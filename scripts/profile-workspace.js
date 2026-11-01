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
  const call = async (path, body, cookie) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
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
    const cover =
      "data:image/png;base64," + Buffer.alloc(750000, 1).toString("base64");
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
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  }
})().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
