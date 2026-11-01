"use strict";
// Repeatable, isolated read-path measurements. Never opens the configured cloud database.
const http = require("node:http");
const { once } = require("node:events");
const database = require("../tests/helpers/test-database");

(async () => {
  let queries = [];
  const db = await database({
    latencyMs: 10,
    onQuery: (sql) => queries.push(sql),
  });
  const app = await require("../src/app")({
    database: db,
    emailDelivery: { available: false },
  });
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, cookie, csrf) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const buffer = await response.arrayBuffer();
    if (!response.ok)
      throw new Error(`${path} returned HTTP ${response.status}`);
    return {
      response,
      bytes: buffer.byteLength,
      body: JSON.parse(Buffer.from(buffer).toString()),
    };
  };
  try {
    const account = {
      name: "Performance fixture",
      email: "perf@example.test",
      phone: "0811111111",
      code: "PERF",
      type: "นักศึกษา",
      password: "PerfPassword123!",
    };
    await call("/api/registration/request", account);
    const login = await call("/api/login", {
      identity: account.email,
      password: account.password,
    });
    const cookie = login.response.headers.get("set-cookie").split(";")[0];
    await call("/api/store", undefined, cookie);
    const user = (
      await db.prepare("SELECT id FROM users WHERE email=?").get(account.email)
    ).id;
    const image = Buffer.alloc(750000, 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    const cover = "data:image/png;base64," + image.toString("base64");
    await db
      .prepare(
        "INSERT INTO workshops(id,title,cover,start_at,end_at,place,capacity,hours) VALUES('perf-workshop','Performance fixture',?,'2099-01-01T02:00Z','2099-01-01T05:00Z','Room',30,3)",
      )
      .run(cover);
    await db
      .prepare(
        "INSERT INTO registrations(id,user_id,workshop_id,status) VALUES('perf-registration',?,'perf-workshop','PENDING')",
      )
      .run(user);
    const storeFactory = require("../src/features/workshops/store")({
      ...require("../src/core/utils"),
      db,
    });
    await db.withRequest(() => storeFactory.refreshSnapshot());
    for (const path of ["/api/session", "/api/workshops", "/api/store"]) {
      const samples = [];
      let bytes, statements;
      for (let i = 0; i < 3; i++) {
        queries = [];
        const start = performance.now();
        const result = await call(
          path,
          undefined,
          path === "/api/store" ? cookie : undefined,
        );
        samples.push(Math.round(performance.now() - start));
        bytes = result.bytes;
        statements = queries.length;
      }
      process.stdout.write(
        JSON.stringify({
          path,
          ms: samples,
          statements,
          bytes,
          simulatedRoundTripMs: 10,
        }) + "\n",
      );
    }
    await db.prepare("UPDATE users SET role='staff' WHERE id=?").run(user);
    await db
      .prepare(
        `INSERT INTO workshops(id,title,start_at,end_at,place,capacity,hours)
      SELECT 'load-'||n,'Load fixture '||n,'2099-02-01T02:00Z','2099-02-01T05:00Z','Room',30,3 FROM generate_series(1,40) n`,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO complaints(id,user_id,issue,detail,status)
      SELECT 'load-complaint-'||n,?,'Load fixture','Example detail','REPLIED' FROM generate_series(1,30) n`,
      )
      .run(user);
    await db
      .prepare(
        `INSERT INTO complaint_replies(id,complaint_id,staff_id,message)
      SELECT 'load-reply-'||n||'-'||r,'load-complaint-'||n,?,'Example reply' FROM generate_series(1,30) n CROSS JOIN generate_series(1,2) r`,
      )
      .run(user);
    queries = [];
    let start = performance.now();
    await db.withRequest(() => storeFactory.refreshSnapshot());
    console.log(
      JSON.stringify({
        path: "snapshot-refresh",
        workshops: 41,
        complaints: 30,
        replies: 60,
        statements: queries.length,
        ms: Math.round(performance.now() - start),
        simulatedRoundTripMs: 10,
      }),
    );
    let workspace = (await call("/api/store", undefined, cookie)).body.store;
    for (let i = 0; i < 3; i++) {
      workspace.workshops.find((item) => item.id === "load-1").title =
        `Edited fixture ${i}`;
      workspace.revision++;
      queries = [];
      start = performance.now();
      workspace = (
        await call("/api/store", { store: workspace }, cookie, login.body.csrf)
      ).body.store;
      console.log(
        JSON.stringify({
          path: "single-workshop-edit",
          sample: i + 1,
          workshops: 41,
          statements: queries.length,
          ms: Math.round(performance.now() - start),
          simulatedRoundTripMs: 10,
        }),
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  }
})().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
