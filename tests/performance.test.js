"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

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
