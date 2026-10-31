"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

for (const kind of ["postgres"])
  test(`${kind}: finalization requires complete attendance and locks archived results on all write paths`, async (t) => {
    const db = await database(kind);
    const previousSeed = process.env.SEED_DEMO;
    process.env.SEED_DEMO = "1";
    let app;
    try {
      app = await require("./helpers/management-app")({ database: db });
    } finally {
      if (previousSeed === undefined) delete process.env.SEED_DEMO;
      else process.env.SEED_DEMO = previousSeed;
    }
    const server = http.createServer(app.handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await app.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    const call = async (endpoint, body, headers = {}) => {
      const result = await fetch(base + endpoint, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: result.status,
        body: await result.json(),
        cookie: result.headers.get("set-cookie"),
      };
    };
    const login = async (identity) => ({
      Cookie: identity.startsWith("admin")
        ? "test_actor=admin"
        : "test_actor=student",
      "X-CSRF-Token": "test-only-token",
    });
    const staff = await login("admin1@bsru.ac.th");
    const student = await login("std_demo@bsru.ac.th");
    const snapshot = async () =>
      (await call("store", undefined, staff)).body.store;
    const initial = await snapshot();
    const endpoint = "workshops/finalize-attendance";
    const request = { workshopId: "w4", revision: initial.revision };
    assert.equal((await call(endpoint, request)).status, 401);
    assert.equal((await call(endpoint, request, student)).status, 403);
    assert.equal(
      (await call(endpoint, request, { Cookie: staff.Cookie })).status,
      403,
    );
    assert.equal(
      (await call(endpoint, { ...request, revision: -1 }, staff)).status,
      409,
    );
    assert.equal(
      (await call(endpoint, { ...request, workshopId: "missing" }, staff))
        .status,
      404,
    );
    assert.equal(
      (await call(endpoint, { ...request, workshopId: "w1" }, staff)).status,
      409,
    );
    assert.deepEqual(await snapshot(), initial);

    // The finalization check reads relational attendance even when app_state is stale.
    await db
      .prepare("UPDATE registrations SET status='PENDING' WHERE id=?")
      .run("demo-r5");
    const incomplete = await call(endpoint, request, staff);
    assert.equal(incomplete.status, 409);
    assert.equal(incomplete.body.code, "ATTENDANCE_INCOMPLETE");
    assert.equal(incomplete.body.pendingCount, 1);
    assert.equal(
      (await snapshot()).workshops.find((w) => w.id === "w4")
        .attendanceFinalizedAt,
      undefined,
    );

    const forged = structuredClone(initial);
    forged.revision++;
    Object.assign(
      forged.workshops.find((w) => w.id === "w4"),
      {
        attendanceFinalizedAt: new Date().toISOString(),
        attendanceFinalizedBy: "admin",
      },
    );
    assert.equal((await call("store", { store: forged }, staff)).status, 403);

    assert.equal(
      (
        await call(
          "attendance",
          { registrationId: "demo-r5", status: "ABSENT" },
          staff,
        )
      ).status,
      200,
    );
    const complete = await snapshot();
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (sql === "UPDATE app_state SET data_json=? WHERE id=1")
        throw new Error("Simulated finalization failure");
      return prepare(sql);
    };
    try {
      assert.equal(
        (
          await call(
            endpoint,
            { workshopId: "w4", revision: complete.revision },
            staff,
          )
        ).status,
        400,
      );
    } finally {
      db.prepare = prepare;
    }
    assert.deepEqual(await snapshot(), complete);
    const finalized = await call(
      endpoint,
      { workshopId: "w4", revision: complete.revision },
      staff,
    );
    assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
    const workshop = finalized.body.store.workshops.find((w) => w.id === "w4");
    assert.ok(Number.isFinite(Date.parse(workshop.attendanceFinalizedAt)));
    assert.equal(workshop.attendanceFinalizedBy, "admin");
    assert.equal(finalized.body.store.revision, complete.revision + 1);
    assert.ok(
      finalized.body.store.auditLog.some(
        (entry) =>
          entry.action === "finalize-attendance" && entry.entityId === "w4",
      ),
    );
    assert.equal(
      (
        await call(
          "attendance",
          { registrationId: "demo-r5", status: "ATTENDED" },
          staff,
        )
      ).status,
      409,
    );
    const edit = structuredClone(finalized.body.store);
    edit.revision++;
    edit.registrations.find((r) => r.id === "demo-r5").status = "ATTENDED";
    assert.equal((await call("store", { store: edit }, staff)).status, 409);
    const removeStamp = structuredClone(finalized.body.store);
    removeStamp.revision++;
    delete removeStamp.workshops.find((w) => w.id === "w4")
      .attendanceFinalizedAt;
    assert.equal(
      (await call("store", { store: removeStamp }, staff)).status,
      403,
    );
    const reschedule = structuredClone(finalized.body.store);
    reschedule.revision++;
    reschedule.workshops.find((w) => w.id === "w4").end = "2099-12-31T12:00";
    assert.equal(
      (await call("store", { store: reschedule }, staff)).status,
      409,
    );
    assert.deepEqual(await snapshot(), finalized.body.store);

    // Unrelated refreshes and whole-store saves must retain the protected stamp.
    assert.equal(
      (
        await call(
          "attendance",
          { registrationId: "demo-r1", status: "ATTENDED" },
          staff,
        )
      ).status,
      200,
    );
    let latest = await snapshot();
    assert.equal(
      latest.workshops.find((w) => w.id === "w4").attendanceFinalizedAt,
      workshop.attendanceFinalizedAt,
    );
    latest.revision++;
    assert.equal((await call("store", { store: latest }, staff)).status, 200);

    // Cancelled registrations are excluded and empty workshops still require explicit confirmation.
    latest = await snapshot();
    const empty = {
      ...latest.workshops.find((w) => w.id === "w5"),
      id: "empty-results",
    };
    latest.workshops.push(empty);
    latest.revision++;
    assert.equal((await call("store", { store: latest }, staff)).status, 200);
    latest = await snapshot();
    const allCancelled = latest.workshops.find((w) => w.id === "w5");
    await db
      .prepare(
        "UPDATE registrations SET status='CANCELLED' WHERE workshop_id=?",
      )
      .run(allCancelled.id);
    const cancelled = await call(
      endpoint,
      { workshopId: allCancelled.id, revision: latest.revision },
      staff,
    );
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const zero = await call(
      endpoint,
      { workshopId: empty.id, revision: cancelled.body.store.revision },
      staff,
    );
    assert.equal(zero.status, 200);
  });
