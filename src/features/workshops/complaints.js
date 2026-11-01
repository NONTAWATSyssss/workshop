"use strict";

module.exports = function createComplaintLifecycle({
  db,
  now,
  json,
  bodyJson,
  requireAccess,
  syncUsersSnapshot,
  viewFromSnapshot,
}) {
  async function save(snapshot) {
    snapshot.revision++;
    await db
      .prepare(
        "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
      )
      .run(snapshot.revision, JSON.stringify(snapshot), now());
  }

  // Ordinary reads only need maintenance when an expiry or two-sided deletion is due.
  function complaintMaintenanceDue(snapshot) {
    const cutoff = Date.parse(now()) - 15 * 86400000;
    return snapshot.complaints.some(
      (item) =>
        (item.learnerDeletedAt && item.staffClearedAt) ||
        (!item.learnerDeletedAt && Date.parse(item.learnerTrashedAt) <= cutoff),
    );
  }

  // Caller holds the shared transaction lock. Expiry uses server time, never a browser timestamp.
  async function maintainComplaints(snapshot) {
    const cutoff = new Date(Date.parse(now()) - 15 * 86400000).toISOString();
    const expired = await db
      .prepare(
        "UPDATE complaints SET learner_deleted_at=learner_trashed_at + INTERVAL '15 days' WHERE learner_trashed_at<=? AND learner_deleted_at IS NULL RETURNING id,learner_deleted_at",
      )
      .all(cutoff);
    for (const row of expired) {
      const complaint = snapshot.complaints.find((item) => item.id === row.id);
      if (complaint) complaint.learnerDeletedAt = row.learner_deleted_at;
    }
    const purged = await db
      .prepare(
        "DELETE FROM complaints WHERE learner_deleted_at IS NOT NULL AND staff_cleared_at IS NOT NULL RETURNING id",
      )
      .all();
    const ids = new Set(purged.map((item) => item.id));
    if (ids.size) {
      snapshot.complaints = snapshot.complaints.filter(
        (item) => !ids.has(item.id),
      );
      snapshot.notifications = snapshot.notifications.filter(
        (item) => item.kind !== "complaint" || !ids.has(item.refId),
      );
      for (const id of ids)
        await db
          .prepare(
            "DELETE FROM notifications WHERE related_type='complaint' AND related_id=?",
          )
          .run(id);
    }
    if (expired.length || ids.size) await save(snapshot);
    return snapshot;
  }

  async function routeComplaints(req, res, url) {
    const maintenance =
      req.method === "GET" && url.pathname === "/api/maintenance/complaints";
    const action = /^\/api\/complaints\/(trash|restore|clear)$/.exec(
      url.pathname,
    )?.[1];
    if (!maintenance && !(req.method === "POST" && action)) return false;
    let actor, data;
    if (maintenance) {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        json(res, 401, { error: "Unauthorized" });
        return true;
      }
    } else {
      actor = await requireAccess(
        req,
        res,
        action === "clear" ? "staff" : "user",
      );
      if (!actor) return true;
      data = await bodyJson(req);
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
      const snapshot = await maintainComplaints(await syncUsersSnapshot());
      if (maintenance) {
        await db.exec("COMMIT");
        json(res, 200, { ok: true });
        return true;
      }
      if (data.revision !== snapshot.revision)
        throw Object.assign(
          new Error("ข้อมูลเปลี่ยนแล้ว กรุณาตรวจสอบรายการล่าสุดก่อนทำอีกครั้ง"),
          { status: 409 },
        );
      const timestamp = now();
      let targets;
      if (action === "clear") {
        const visible = snapshot.complaints.filter(
          (item) => !item.staffClearedAt,
        );
        if (data.all === true) targets = visible;
        else {
          if (
            !Array.isArray(data.ids) ||
            !data.ids.length ||
            data.ids.length > 1000 ||
            data.ids.some((id) => typeof id !== "string") ||
            new Set(data.ids).size !== data.ids.length
          )
            throw Object.assign(new Error("กรุณาเลือกคำร้องที่ต้องการล้าง"), {
              status: 400,
            });
          targets = data.ids.map((id) =>
            visible.find((item) => item.id === id),
          );
          if (targets.some((item) => !item))
            throw Object.assign(
              new Error("ไม่พบคำร้องที่เลือก กรุณาโหลดรายการใหม่"),
              { status: 404 },
            );
        }
        for (const item of targets) {
          item.staffClearedAt = timestamp;
          await db
            .prepare("UPDATE complaints SET staff_cleared_at=? WHERE id=?")
            .run(timestamp, item.id);
        }
      } else {
        const item = snapshot.complaints.find(
          (row) => row.id === data.id && row.userId === actor.user.id,
        );
        if (!item)
          throw Object.assign(new Error("ไม่พบคำร้องนี้"), { status: 404 });
        if (item.learnerDeletedAt)
          throw Object.assign(new Error("คำร้องนี้พ้นระยะกู้คืน 15 วันแล้ว"), {
            status: 410,
          });
        const value =
          action === "restore" ? null : item.learnerTrashedAt || timestamp;
        targets = (item.learnerTrashedAt || null) === value ? [] : [item];
        item.learnerTrashedAt = value;
        if (targets.length)
          await db
            .prepare(
              "UPDATE complaints SET learner_trashed_at=? WHERE id=? AND user_id=?",
            )
            .run(value, item.id, actor.user.id);
      }
      if (targets.length) await save(snapshot);
      await maintainComplaints(snapshot);
      await db.exec("COMMIT");
      json(res, 200, {
        store: viewFromSnapshot(snapshot, actor.user),
        changedCount: targets.length,
      });
    } catch (error) {
      await db.exec("ROLLBACK");
      json(res, error.status || 400, { error: error.message });
    }
    return true;
  }
  return { complaintMaintenanceDue, maintainComplaints, routeComplaints };
};
