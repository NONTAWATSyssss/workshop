"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

for (const kind of ["postgres"])
  test(`${kind}: workshop deletion is authorized, atomic and persistent`, async (t) => {
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
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (endpoint, body, headers = {}) => {
      const response = await fetch(base + "/api/" + endpoint, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie"),
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
    const initial = (await call("store", undefined, staff)).body.store;
    const request = { workshopId: "w4", revision: initial.revision };
    assert.equal((await call("workshops/delete", request)).status, 401);
    assert.equal(
      (await call("workshops/delete", request, student)).status,
      403,
    );
    assert.equal(
      (await call("workshops/delete", request, { Cookie: staff.Cookie }))
        .status,
      403,
    );
    assert.equal(
      (await call("workshops/delete", { ...request, revision: -1 }, staff))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          "workshops/delete",
          { ...request, workshopId: "missing" },
          staff,
        )
      ).status,
      404,
    );
    assert.deepEqual(
      (await call("store", undefined, staff)).body.store,
      initial,
    );

    await db
      .prepare(
        "INSERT INTO ratings(id,registration_id,user_id,score,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "deletion-rating",
        "demo-r2",
        "student",
        5,
        new Date().toISOString(),
      );
    // A database error after child deletion must roll back every change.
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (sql === "DELETE FROM workshops WHERE id=?")
        throw new Error("Simulated deletion failure");
      return prepare(sql);
    };
    try {
      assert.equal(
        (await call("workshops/delete", request, staff)).status,
        400,
      );
    } finally {
      db.prepare = prepare;
    }
    assert.ok(
      await db
        .prepare("SELECT id FROM ratings WHERE id=?")
        .get("deletion-rating"),
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM registrations WHERE workshop_id=?")
          .get("w4")
      ).n,
      2,
    );
    assert.deepEqual(
      (await call("store", undefined, staff)).body.store,
      initial,
    );

    const removed = await call("workshops/delete", request, staff);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const snapshot = removed.body.store;
    assert.equal(snapshot.revision, initial.revision + 1);
    assert.ok(!snapshot.workshops.some((w) => w.id === "w4"));
    assert.ok(!snapshot.registrations.some((r) => r.workshopId === "w4"));
    assert.ok(!snapshot.ratings.some((r) => r.registrationId === "demo-r2"));
    assert.ok(
      snapshot.auditLog.some(
        (entry) =>
          entry.action === "delete" &&
          entry.entityId === "w4" &&
          entry.actorId === "admin",
      ),
    );
    const history = snapshot.auditLog.find(
      (entry) => entry.action === "delete" && entry.entityId === "w4",
    );
    const original = initial.workshops.find((workshop) => workshop.id === "w4");
    assert.deepEqual(history.workshop, {
      id: original.id,
      title: original.title,
      start: original.start,
      end: original.end,
      place: original.place,
      capacity: original.capacity,
      hours: original.hours,
      registrationCount: 2,
    });
    assert.equal(
      history.actorName,
      initial.users.find((user) => user.id === "admin").name,
    );
    assert.ok(Number.isFinite(Date.parse(history.createdAt)));
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM workshops WHERE id=?")
          .get("w4")
      ).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM registrations WHERE workshop_id=?")
          .get("w4")
      ).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM ratings WHERE id=?")
          .get("deletion-rating")
      ).n,
      0,
    );
    assert.deepEqual(
      snapshot.registrations,
      initial.registrations.filter((r) => r.workshopId !== "w4"),
    );
    assert.deepEqual(snapshot.users, initial.users);
    const learner = (await call("store", undefined, student)).body.store;
    assert.deepEqual(learner.auditLog, []);
    assert.ok(!learner.workshops.some((w) => w.id === "w4"));
    assert.ok(!learner.registrations.some((r) => r.workshopId === "w4"));
    const stale = structuredClone(initial);
    stale.revision = snapshot.revision;
    assert.equal((await call("store", { store: stale }, staff)).status, 409);
    await require("./helpers/management-app")({ database: db });
    assert.deepEqual(
      (await call("store", undefined, staff)).body.store,
      snapshot,
    );
    assert.equal(
      (
        await call(
          "workshops/delete",
          { workshopId: "w3", revision: snapshot.revision },
          staff,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("workshops", undefined, staff)).body.workshops.some((w) =>
        ["w3", "w4"].includes(w.id),
      ),
      false,
    );
    const persisted = (await call("store", undefined, staff)).body.store;
    const forged = structuredClone(persisted);
    forged.revision++;
    forged.auditLog = [
      {
        id: "forged-history",
        entity: "workshops",
        action: "delete",
        entityId: "w1",
        workshop: { title: "Forged deleted workshop" },
      },
    ];
    const saved = await call("store", { store: forged }, staff);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.store.auditLog, persisted.auditLog);
    await require("./helpers/management-app")({ database: db });
    assert.deepEqual(
      (await call("store", undefined, staff)).body.store.auditLog,
      persisted.auditLog,
    );
  });
