"use strict";
// Workspace routes use the membership feature's server-side access checks.
module.exports = function createManagementRoutes({
  db,
  readJson,
  now,
  json,
  requireAccess,
  bodyJson,
  uid,
  localDateInput,
  viewFromSnapshot,
  inspectSnapshot,
  syncUsersSnapshot,
  mergeSnapshot,
  writeSnapshot,
  refreshSnapshot,
  maintainComplaints,
  complaintMaintenanceDue,
}) {
  async function routeApi(req, res, url) {
    if (
      req.method === "POST" &&
      ["/api/notifications/read", "/api/notifications/clear-history"].includes(
        url.pathname,
      )
    ) {
      const actor = await requireAccess(req, res, "user");
      if (!actor) return;
      const data = await bodyJson(req);
      await db.exec("BEGIN IMMEDIATE");
      try {
        const snapshot = await syncUsersSnapshot();
        const timestamp = now();
        let changed = false;
        let deletedCount = 0;
        if (url.pathname === "/api/notifications/read") {
          const notice = snapshot.notifications.find(
            (item) => item.id === data.id && item.userId === actor.user.id,
          );
          if (!notice)
            throw Object.assign(new Error("ไม่พบการแจ้งเตือนนี้"), {
              status: 404,
            });
          if (!notice.readAt) {
            notice.readAt = timestamp;
            await db
              .prepare(
                "UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL",
              )
              .run(timestamp, notice.id, actor.user.id);
            changed = true;
          }
        } else {
          const cutoff = new Date(
            Date.parse(timestamp) - 3 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const deleted = await db
            .prepare(
              "DELETE FROM notifications WHERE user_id=? AND read_at<=? RETURNING id",
            )
            .all(actor.user.id, cutoff);
          const ids = new Set(deleted.map((item) => item.id));
          deletedCount = ids.size;
          snapshot.notifications = snapshot.notifications.filter(
            (item) => !ids.has(item.id),
          );
          changed = deletedCount > 0;
        }
        if (changed) {
          snapshot.revision++;
          await db
            .prepare(
              "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
            )
            .run(snapshot.revision, JSON.stringify(snapshot), timestamp);
        }
        await db.exec("COMMIT");
        return json(res, 200, {
          store: viewFromSnapshot(snapshot, actor.user),
          deletedCount,
        });
      } catch (error) {
        await db.exec("ROLLBACK");
        return json(res, error.status || 400, { error: error.message });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/store") {
      const actor = await requireAccess(req, res);
      if (!actor) return;
      const inspected = await inspectSnapshot();
      let snapshot = inspected.snapshot;
      if (inspected.usersChanged || complaintMaintenanceDue(snapshot)) {
        // Re-read under the shared lock before making any maintenance changes.
        await db.exec("BEGIN IMMEDIATE");
        try {
          snapshot = await maintainComplaints(await syncUsersSnapshot());
          await db.exec("COMMIT");
        } catch (error) {
          await db.exec("ROLLBACK");
          throw error;
        }
      }
      const user = snapshot.users.find((item) => item.id === actor.user.id);
      if (!user || user.status !== "APPROVED")
        return json(res, 401, { error: "กรุณาเข้าสู่ระบบอีกครั้ง" });
      return json(res, 200, {
        store: viewFromSnapshot(snapshot, user),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/store")
      return bodyJson(req).then(async (data) => {
        const actor = await requireAccess(req, res);
        if (!actor) return;
        await db.exec("BEGIN IMMEDIATE");
        try {
          await maintainComplaints(await syncUsersSnapshot());
          const merged = await mergeSnapshot(actor.user, data.store);
          merged.revision =
            (
              await db
                .prepare("SELECT revision FROM app_state WHERE id=1")
                .get()
            ).revision + 1;
          await writeSnapshot(merged);
          await db
            .prepare(
              "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
            )
            .run(merged.revision, JSON.stringify(merged), now());
          await db.exec("COMMIT");
          return json(res, 200, {
            revision: merged.revision,
            store: viewFromSnapshot(merged, actor.user),
          });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/workshops/delete")
      return bodyJson(req).then(async (data) => {
        const actor = await requireAccess(req, res, "staff");
        if (!actor) return;
        const workshopId = String(data.workshopId || "");
        await db.exec("BEGIN IMMEDIATE");
        try {
          const row = await db
            .prepare("SELECT revision FROM app_state WHERE id=1")
            .get();
          if (data.revision !== row.revision)
            throw Object.assign(
              new Error(
                "ข้อมูลเปลี่ยนแล้ว กรุณาตรวจสอบข้อมูลล่าสุดก่อนลบอีกครั้ง",
              ),
              { status: 409 },
            );
          const workshop = await db
            .prepare("SELECT * FROM workshops WHERE id=?")
            .get(workshopId);
          if (!workshop)
            throw Object.assign(new Error("ไม่พบเวิร์กช็อป"), { status: 404 });
          const registrationCount = (
            await db
              .prepare(
                "SELECT count(*) n FROM registrations WHERE workshop_id=? AND status<>'CANCELLED'",
              )
              .get(workshopId)
          ).n;
          // Delete children explicitly for existing SQLite and PostgreSQL schemas.
          await db
            .prepare(
              "DELETE FROM ratings WHERE registration_id IN (SELECT id FROM registrations WHERE workshop_id=?)",
            )
            .run(workshopId);
          await db
            .prepare("DELETE FROM registrations WHERE workshop_id=?")
            .run(workshopId);
          await db.prepare("DELETE FROM workshops WHERE id=?").run(workshopId);
          const snapshot = await refreshSnapshot();
          snapshot.auditLog.unshift({
            id: uid(),
            actorId: actor.user.id,
            actorName: actor.user.name,
            action: "delete",
            entity: "workshops",
            entityId: workshopId,
            createdAt: now(),
            workshop: {
              id: workshop.id,
              title: workshop.title,
              start: localDateInput(workshop.start_at),
              end: localDateInput(workshop.end_at),
              place: workshop.place,
              capacity: workshop.capacity,
              hours: workshop.hours,
              registrationCount,
            },
          });
          await db
            .prepare("UPDATE app_state SET data_json=? WHERE id=1")
            .run(JSON.stringify(snapshot));
          await db.exec("COMMIT");
          return json(res, 200, {
            store: viewFromSnapshot(snapshot, actor.user),
            revision: snapshot.revision,
          });
        } catch (error) {
          await db.exec("ROLLBACK");
          return json(res, error.status || 400, { error: error.message });
        }
      });
    if (
      req.method === "POST" &&
      url.pathname === "/api/workshops/finalize-attendance"
    ) {
      const actor = await requireAccess(req, res, "staff");
      if (!actor) return;
      const data = await bodyJson(req);
      await db.exec("BEGIN IMMEDIATE");
      try {
        const row = await db
          .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
          .get();
        if (data.revision !== row.revision)
          throw Object.assign(
            new Error(
              "ข้อมูลเปลี่ยนแล้ว กรุณาตรวจสอบผลล่าสุดก่อนยืนยันอีกครั้ง",
            ),
            { status: 409 },
          );
        const snapshot = readJson(row.data_json);
        const workshop = snapshot.workshops.find(
          (w) => w.id === data.workshopId,
        );
        const record = await db
          .prepare("SELECT * FROM workshops WHERE id=?")
          .get(String(data.workshopId || ""));
        if (!workshop || !record)
          throw Object.assign(new Error("ไม่พบเวิร์กช็อป"), { status: 404 });
        if (
          !Number.isFinite(Date.parse(record.end_at)) ||
          Date.parse(record.end_at) > Date.now()
        )
          throw Object.assign(
            new Error("ยืนยันผลได้เมื่อกิจกรรมสิ้นสุดแล้วเท่านั้น"),
            { status: 409 },
          );
        const pending = (
          await db
            .prepare(
              "SELECT count(*) n FROM registrations WHERE workshop_id=? AND status NOT IN ('ATTENDED','ABSENT','CANCELLED')",
            )
            .get(workshop.id)
        ).n;
        if (pending)
          throw Object.assign(
            new Error(
              `ยังบันทึกผลไม่ครบ เหลือ ${pending} คน กรุณาระบุเข้าร่วมหรือไม่เข้าร่วมให้ครบก่อน`,
            ),
            {
              status: 409,
              code: "ATTENDANCE_INCOMPLETE",
              pendingCount: pending,
            },
          );
        if (!workshop.attendanceFinalizedAt) {
          // Stored in the existing snapshot document; relational attendance remains the source of truth.
          const next = await refreshSnapshot();
          Object.assign(
            next.workshops.find((w) => w.id === workshop.id),
            {
              attendanceFinalizedAt: now(),
              attendanceFinalizedBy: actor.user.id,
            },
          );
          next.auditLog.unshift({
            id: uid(),
            actorId: actor.user.id,
            actorName: actor.user.name,
            action: "finalize-attendance",
            entity: "workshops",
            entityId: workshop.id,
            createdAt: now(),
          });
          await db
            .prepare("UPDATE app_state SET data_json=? WHERE id=1")
            .run(JSON.stringify(next));
          await db.exec("COMMIT");
          return json(res, 200, {
            store: viewFromSnapshot(next, actor.user),
            revision: next.revision,
          });
        }
        await db.exec("COMMIT");
        return json(res, 200, {
          store: viewFromSnapshot(snapshot, actor.user),
          revision: snapshot.revision,
        });
      } catch (error) {
        await db.exec("ROLLBACK");
        return json(res, error.status || 400, {
          error: error.message,
          code: error.code,
          pendingCount: error.pendingCount,
        });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/enroll")
      return bodyJson(req).then(async (data) => {
        const actor = await requireAccess(req, res, "user");
        if (!actor) return;
        const workshopId = String(data.workshopId || "");
        await db.exec("BEGIN IMMEDIATE");
        try {
          const w = await db
            .prepare("SELECT * FROM workshops WHERE id=?")
            .get(workshopId);
          if (!w || w.closed || Date.parse(w.start_at) <= Date.now())
            throw Object.assign(new Error("กิจกรรมปิดรับลงทะเบียนแล้ว"), {
              status: 409,
            });
          const conflict = await db
            .prepare(
              "SELECT w.title FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=? AND r.status<>'CANCELLED' AND w.id<>? AND w.start_at<? AND w.end_at>? LIMIT 1",
            )
            .get(actor.user.id, workshopId, w.end_at, w.start_at);
          if (conflict)
            throw Object.assign(
              new Error(
                `เวลาตรงกับกิจกรรม “${conflict.title}” ที่ลงทะเบียนไว้แล้ว`,
              ),
              { status: 409 },
            );
          const prior = await db
            .prepare(
              "SELECT * FROM registrations WHERE user_id=? AND workshop_id=?",
            )
            .get(actor.user.id, workshopId);
          if (prior && prior.status !== "CANCELLED")
            throw Object.assign(new Error("คุณลงทะเบียนกิจกรรมนี้แล้ว"), {
              status: 409,
            });
          const count = (
            await db
              .prepare(
                `SELECT count(*) n FROM registrations WHERE workshop_id=? AND status IN ('PENDING','ATTENDED','ABSENT')`,
              )
              .get(workshopId)
          ).n;
          if (count >= w.capacity)
            throw Object.assign(new Error("ที่นั่งเต็มแล้ว"), { status: 409 });
          const t = now();
          if (prior)
            await db
              .prepare(
                `UPDATE registrations SET status='PENDING',updated_at=? WHERE id=?`,
              )
              .run(t, prior.id);
          else
            await db
              .prepare(
                `INSERT INTO registrations(id,user_id,workshop_id,status,created_at,updated_at) VALUES(?,?,?,'PENDING',?,?)`,
              )
              .run(uid(), actor.user.id, workshopId, t, t);
          await refreshSnapshot();
          await db.exec("COMMIT");
          return json(res, 200, { ok: true, workshops: await workshopRows() });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/attendance")
      return bodyJson(req).then(async (data) => {
        const actor = await requireAccess(req, res, "staff");
        if (!actor) return;
        const status = String(data.status || "");
        if (!["ATTENDED", "ABSENT"].includes(status))
          return json(res, 400, { error: "สถานะเช็กชื่อไม่ถูกต้อง" });
        const row = await db
          .prepare(
            "SELECT r.*,w.title,w.hours FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.id=?",
          )
          .get(String(data.registrationId || ""));
        if (!row) return json(res, 404, { error: "ไม่พบรายการลงทะเบียน" });
        if (row.status !== status) {
          await db.exec("BEGIN IMMEDIATE");
          try {
            const snapshot = readJson(
              (
                await db
                  .prepare("SELECT data_json FROM app_state WHERE id=1")
                  .get()
              ).data_json,
            );
            if (
              snapshot.workshops.find((w) => w.id === row.workshop_id)
                ?.attendanceFinalizedAt
            )
              throw Object.assign(
                new Error(
                  "กิจกรรมนี้ยืนยันผลและเก็บเข้าประวัติแล้ว ไม่สามารถแก้ไขผลได้",
                ),
                { status: 409 },
              );
            const current = await db
              .prepare("SELECT status FROM registrations WHERE id=?")
              .get(row.id);
            if (current.status === "CANCELLED")
              throw Object.assign(
                new Error("ไม่สามารถเช็กชื่อรายการที่ยกเลิกแล้ว"),
                { status: 409 },
              );
            if (current.status === status) {
              await db.exec("COMMIT");
              return json(res, 200, { ok: true });
            }
            await db
              .prepare(
                "UPDATE registrations SET status=?,updated_at=? WHERE id=?",
              )
              .run(status, now(), row.id);
            await db
              .prepare(
                "INSERT INTO notifications(id,user_id,title,message,related_type,related_id,created_at) VALUES(?,?,?,?,?,?,?)",
              )
              .run(
                uid(),
                row.user_id,
                "อัปเดตผลการเข้าร่วม",
                `กิจกรรม “${row.title}” เปลี่ยนเป็น ${status === "ATTENDED" ? "เข้าร่วมงานแล้ว" : "ไม่ได้เข้าร่วม"}`,
                "registration",
                row.id,
                now(),
              );
            await refreshSnapshot();
            await db.exec("COMMIT");
          } catch (e) {
            await db.exec("ROLLBACK");
            return json(res, e.status || 400, { error: e.message });
          }
        }
        return json(res, 200, { ok: true });
      });
    if (req.method === "GET" && url.pathname === "/api/registrations") {
      const actor = await requireAccess(req, res);
      if (!actor) return;
      const all = actor.user.role === "staff";
      const rows = all
        ? await db
            .prepare(
              `SELECT r.*,u.name AS user_name,u.code,w.title AS workshop_title,w.hours FROM registrations r JOIN users u ON u.id=r.user_id JOIN workshops w ON w.id=r.workshop_id ORDER BY r.created_at DESC`,
            )
            .all()
        : await db
            .prepare(
              `SELECT r.*,w.title AS workshop_title,w.hours FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=? ORDER BY r.created_at DESC`,
            )
            .all(actor.user.id);
      return json(res, 200, { registrations: rows });
    }
    json(res, 404, { error: "ไม่พบ API endpoint" });
  }

  return { routeApi };
};
