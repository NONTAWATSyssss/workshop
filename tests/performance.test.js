"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

async function workload(t) {
  const queries = [];
  const db = await database({ onQuery: (sql) => queries.push(sql) });
  await require("./helpers/fixtures")(db);
  const utils = require("../src/core/utils");
  const credentials = utils.passwordRecord("WorkloadPassword123!");
  await db
    .prepare(
      "UPDATE users SET password_salt=?,password_hash=? WHERE id='admin'",
    )
    .run(credentials.salt, credentials.hash);
  await db
    .prepare(
      `INSERT INTO workshops(id,title,start_at,end_at,place,capacity,hours)
    SELECT 'load-'||n,'Load fixture '||n,'2099-02-01T02:00Z','2099-02-01T05:00Z','Room',30,3 FROM generate_series(1,40) n`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO complaints(id,user_id,issue,detail,status)
    SELECT 'load-complaint-'||n,'student','Load fixture','Example detail','REPLIED' FROM generate_series(1,30) n`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO complaint_replies(id,complaint_id,staff_id,message,created_at)
    SELECT 'load-reply-'||n||'-'||r,'load-complaint-'||n,'admin','Reply '||r,'2026-01-01T00:00Z'::timestamptz+r*INTERVAL '1 minute' FROM generate_series(1,30) n CROSS JOIN generate_series(1,2) r`,
    )
    .run();
  const factory = require("../src/features/workshops/store")({ ...utils, db });
  const app = await require("../src/app")({
    database: db,
    emailDelivery: { available: false },
  });
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  let auth = {};
  const call = async (endpoint, body, extraHeaders = {}) => {
    const response = await fetch(base + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...auth, ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
  const login = await call("login", {
    identity: "admin1@bsru.ac.th",
    password: "WorkloadPassword123!",
  });
  assert.equal(login.status, 200);
  auth = {
    Cookie: login.cookie.split(";")[0],
    "X-CSRF-Token": login.body.csrf,
  };
  return { db, factory, queries, call };
}

test("direct enrollment returns success after committing once and rejects duplicate registrations", async (t) => {
  const { db, call } = await workload(t);
  const credentials = require("../src/core/utils").passwordRecord(
    "EnrollmentPassword123!",
  );
  await db
    .prepare(
      "UPDATE users SET password_salt=?,password_hash=? WHERE id='student'",
    )
    .run(credentials.salt, credentials.hash);
  const login = await call("login", {
    identity: "std_demo@bsru.ac.th",
    password: "EnrollmentPassword123!",
  });
  assert.equal(login.status, 200);
  const auth = {
    Cookie: login.cookie.split(";")[0],
    "X-CSRF-Token": login.body.csrf,
  };
  const enrolled = await call("enroll", { workshopId: "w2" }, auth);
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
  assert.equal(enrolled.body.ok, true);
  assert.ok(Array.isArray(enrolled.body.workshops));
  const row = await db
    .prepare(
      "SELECT status FROM registrations WHERE user_id='student' AND workshop_id='w2'",
    )
    .get();
  assert.equal(row.status, "PENDING");
  assert.equal((await call("enroll", { workshopId: "w2" }, auth)).status, 409);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) n FROM registrations WHERE user_id='student' AND workshop_id='w2'",
        )
        .get()
    ).n,
    1,
  );
});

test("snapshot refresh batches complaint replies and preserves staff names and reply order", async (t) => {
  const { db, factory, queries } = await workload(t);
  queries.length = 0;
  const snapshot = await db.withRequest(() => factory.refreshSnapshot());
  assert.ok(
    queries.length <= 10,
    `Snapshot refresh exceeded its fixed query budget: ${queries.length}`,
  );
  const complaint = snapshot.complaints.find(
    (item) => item.id === "load-complaint-1",
  );
  assert.deepEqual(
    complaint.replies.map((reply) => reply.text),
    ["Reply 1", "Reply 2"],
  );
  assert.ok(
    complaint.replies.every((reply) => reply.staffName === "ผู้ดูแลระบบ BSRU"),
  );
});

test("one workspace edit writes only changed records regardless of unrelated workshop and complaint counts", async (t) => {
  const { db, queries, call } = await workload(t);
  let snapshot = (await call("store")).body.store;
  snapshot.workshops.find((item) => item.id === "load-1").title = "Edited once";
  snapshot.revision++;
  queries.length = 0;
  const saved = await call("store", { store: snapshot });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.ok(
    queries.length <= 12,
    `Single edit exceeded its fixed query budget: ${queries.length}`,
  );
  assert.equal(
    (await db.prepare("SELECT title FROM workshops WHERE id='load-1'").get())
      .title,
    "Edited once",
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM complaint_replies").get()).n,
    60,
  );
  assert.equal(
    (await db.prepare("SELECT role FROM users WHERE id='admin'").get()).role,
    "staff",
  );
  snapshot = structuredClone(saved.body.store);
  snapshot.revision = String(Number(snapshot.revision) + 1);
  queries.length = 0;
  const unchanged = await call("store", { store: snapshot });
  assert.equal(unchanged.status, 200);
  assert.equal(typeof unchanged.body.revision, "number");
  assert.equal(typeof unchanged.body.store.revision, "number");
  assert.ok(
    !queries.some(
      (sql) =>
        !sql.startsWith("UPDATE complaints SET learner_deleted_at=") &&
        /^(INSERT INTO|UPDATE) (users|workshops|registrations|ratings|complaints|complaint_replies|notifications)\b/i.test(
          sql,
        ),
    ),
    "An unchanged save must not rewrite relational records",
  );
  snapshot = structuredClone(unchanged.body.store);
  snapshot.workshops.find((item) => item.id === "w4").capacity = 1;
  snapshot.revision++;
  assert.equal(
    (await call("store", { store: snapshot })).status,
    409,
    "Seat reductions still check actual registrations",
  );
});

test("workspace reads stay small and read-only while versioned covers survive edits and removal", async (t) => {
  let queries = [],
    leases = 0;
  const db = await database({ onQuery: (sql) => queries.push(sql) });
  const app = await require("../src/app")({
    database: db,
    emailDelivery: { available: false },
  });
  const withRequest = db.withRequest.bind(db);
  db.withRequest = async (work) => {
    leases++;
    return withRequest(work);
  };
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const response = await fetch(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: JSON.parse(text),
      bytes: Buffer.byteLength(text),
      cookie: response.headers.get("set-cookie"),
    };
  };
  leases = 0;
  queries = [];
  assert.equal((await call("session")).status, 200);
  assert.equal(
    leases,
    0,
    "anonymous session discovery must not wait for a remote database connection",
  );
  const person = {
    name: "Performance test",
    type: "นักศึกษา",
    code: "PERF-1",
    phone: "0811111111",
    email: "perf@example.test",
    password: "PerfPassword123!",
  };
  await call("registration/request", person);
  const login = await call("login", {
    identity: person.email,
    password: person.password,
  });
  const auth = {
    Cookie: login.cookie.split(";")[0],
    "X-CSRF-Token": login.body.csrf,
  };
  const blob = Buffer.alloc(750000, 1);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(blob);
  const cover = "data:image/png;base64," + blob.toString("base64");
  await db
    .prepare(
      "INSERT INTO workshops(id,title,cover,start_at,end_at,place,capacity,hours) VALUES('perf','Fixture',?,'2099-01-01T02:00Z','2099-01-01T05:00Z','Room',30,3)",
    )
    .run(cover);
  const factory = require("../src/features/workshops/store")({
    ...require("../src/core/utils"),
    db,
  });
  await db.withRequest(() => factory.refreshSnapshot());
  queries = [];
  const read = await call("store", undefined, auth);
  assert.equal(read.status, 200);
  assert.ok(
    queries.length <= 3,
    `ordinary workspace reads must fit three SQL round trips, saw ${queries.length}`,
  );
  assert.ok(
    !queries.some((sql) =>
      /^(BEGIN|UPDATE|DELETE|SELECT pg_advisory)/i.test(sql),
    ),
    "unchanged reads must not acquire a writer lock or run cleanup writes",
  );
  assert.ok(
    read.bytes < 20000,
    `metadata must not embed image payloads, saw ${read.bytes} bytes`,
  );
  assert.match(
    read.body.store.workshops[0].cover,
    /^\/api\/workshops\/perf\/cover\?v=/,
  );
  const unchanged = structuredClone(read.body.store);
  unchanged.revision++;
  assert.equal((await call("store", { store: unchanged }, auth)).status, 200);
  assert.equal(
    (await db.prepare("SELECT cover FROM workshops WHERE id='perf'").get())
      .cover,
    cover,
  );
  await db
    .prepare("UPDATE users SET role='staff' WHERE email=?")
    .run(person.email);
  const promoted = (await call("store", undefined, auth)).body.store;
  assert.equal(promoted.users[0].role, "staff");
  promoted.workshops[0].title = "Renamed without uploading again";
  promoted.revision++;
  const saved = await call("store", { store: promoted }, auth);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    (await db.prepare("SELECT cover FROM workshops WHERE id='perf'").get())
      .cover,
    cover,
  );
  const replacement = cover.slice(0, -4) + "AQAA";
  const edited = structuredClone(saved.body.store);
  edited.workshops[0].cover = replacement;
  edited.revision++;
  const replaced = await call("store", { store: edited }, auth);
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.notEqual(
    replaced.body.store.workshops[0].cover,
    saved.body.store.workshops[0].cover,
  );
  const removed = structuredClone(replaced.body.store);
  removed.workshops[0].cover = "";
  removed.revision++;
  assert.equal((await call("store", { store: removed }, auth)).status, 200);
  assert.equal(
    (await db.prepare("SELECT cover FROM workshops WHERE id='perf'").get())
      .cover,
    "",
  );
  assert.equal((await fetch(origin + "/api/workshops/perf/cover")).status, 404);
});
