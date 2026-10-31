"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

test("public catalog exposes activities while private APIs require valid membership", async (t) => {
  const db = await database("postgres");
  await db
    .prepare(
      "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "private-user",
      "Private member",
      "นักศึกษา",
      "PRIVATE-CODE",
      "private.user@example.test",
      "0811111111",
      "Science",
      "Computing",
      "APPROVED",
      "staff",
    );
  // Existing credentials may remain in the cloud; they must not grant access.
  await db.exec(
    "UPDATE users SET password_hash='PRIVATE_CREDENTIAL_HASH' WHERE id='private-user'",
  );
  await db
    .prepare("UPDATE users SET password_plaintext=? WHERE id=?")
    .run("PRIVATE_READABLE_PASSWORD", "private-user");
  await db
    .prepare(
      "INSERT INTO workshops(id,title,description,cover,start_at,end_at,place,capacity,hours,closed) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "public-one",
      "กิจกรรมทดสอบ",
      "รายละเอียดกิจกรรม",
      "",
      "2099-11-01T09:00:00+07:00",
      "2099-11-01T12:00:00+07:00",
      "ห้องเรียน",
      30,
      3,
      false,
    );
  process.env.SEED_DEMO = "1";
  const app = await require("../src/app")({
    database: db,
    emailDelivery: { available: false },
  });
  delete process.env.SEED_DEMO;
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const catalog = await fetch(base + "/api/workshops");
  assert.equal(catalog.status, 200);
  const { workshops } = await catalog.json();
  assert.equal(workshops.length, 1, "no automatic demo seeding");
  assert.equal(workshops[0].description, "รายละเอียดกิจกรรม");
  assert.equal(workshops[0].start, "2099-11-01T09:00");
  assert.equal(workshops[0].occupancy, 0);
  assert.doesNotMatch(
    JSON.stringify(workshops),
    /Private member|PRIVATE-CODE|private.user|PRIVATE_CREDENTIAL_HASH|PRIVATE_READABLE_PASSWORD|old-cookie/,
  );
  assert.deepEqual(
    Object.keys(workshops[0]).sort(),
    [
      "id",
      "title",
      "description",
      "cover",
      "start",
      "end",
      "place",
      "capacity",
      "hours",
      "closed",
      "occupancy",
    ].sort(),
  );
  const detail = await fetch(base + "/api/workshops/public-one");
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).workshop.id, "public-one");
  assert.equal((await fetch(base + "/api/workshops/missing")).status, 404);
  assert.equal((await fetch(base + "/api/workshops/%ZZ")).status, 400);
  const head = await fetch(base + "/api/workshops", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(
    (
      await fetch(base + "/api/workshops", {
        headers: { Origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(base + "/assets/js/views/activities.js")).status,
    200,
  );
  assert.equal((await fetch(base + "/%2e%2e%2fpackage.json")).status, 403);
  for (const [endpoint, expected] of [
    ["login", 400],
    ["logout", 401],
    ["account", 401],
    ["registration/request", 400],
    ["firebase/resend", 404],
    ["otp/request", 503],
    ["otp/verify", 410],
    ["password/reset", 400],
  ]) {
    const response = await fetch(base + "/api/" + endpoint, {
      method: endpoint === "session" ? "GET" : "POST",
      headers: {
        Cookie: "bsru_session=old-cookie",
        "X-CSRF-Token": "old-token",
      },
    });
    assert.equal(response.status, expected, endpoint);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  for (const [endpoint, method] of [
    ["store", "GET"],
    ["store", "POST"],
    ["registrations", "GET"],
    ["enroll", "POST"],
    ["attendance", "POST"],
    ["workshops/delete", "POST"],
    ["workshops/finalize-attendance", "POST"],
  ]) {
    const response = await fetch(base + "/api/" + endpoint, {
      method,
      headers: {
        Cookie: "bsru_session=old-cookie",
        "Content-Type": "application/json",
      },
      ...(method === "POST" ? { body: '{"workshopId":"public-one"}' } : {}),
    });
    assert.equal(response.status, 401, endpoint + " " + method);
  }
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM workshops").get()).n,
    1,
  );
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM users").get()).n,
    1,
  );
  assert.equal((await fetch(base + "/api/not-real")).status, 404);
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.database, "PostgreSQL");
  assert.equal(health.membershipAvailable, true);
  assert.equal(
    health.counts,
    undefined,
    "health does not expose private table counts",
  );
});
