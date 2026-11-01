"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { bodyJson } = require("../src/core/http").createHttp({
  MAX_BODY_BYTES: 100,
});

test("static assets revalidate without downloading unchanged bytes and update their validators after edits", async (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    http = require("node:http");
  const { once } = require("node:events");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-static-"));
  const file = path.join(directory, "fixture.css");
  fs.writeFileSync(file, "body{color:blue}");
  const { serveStatic } = require("../src/core/http").createStatic({
    fs,
    path,
    PUBLIC: directory,
    MIME: { ".css": "text/css" },
  });
  const server = http.createServer((req, res) =>
    serveStatic(req, res, new URL(req.url, "http://localhost")),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  });
  const url = `http://127.0.0.1:${server.address().port}/fixture.css`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const etag = response.headers.get("etag");
  assert.ok(etag);
  assert.match(response.headers.get("cache-control"), /must-revalidate/);
  assert.equal(await response.text(), "body{color:blue}");
  const cached = await fetch(url, {
    headers: { "If-None-Match": `"unrelated", ${etag}` },
  });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), "");
  const head = await fetch(url, {
    method: "HEAD",
    headers: { "If-None-Match": etag },
  });
  assert.equal(head.status, 304);
  fs.writeFileSync(file, "body{color:navy}");
  const modified = new Date(Date.now() + 2000);
  fs.utimesSync(file, modified, modified);
  const changed = await fetch(url, { headers: { "If-None-Match": etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  assert.equal(await changed.text(), "body{color:navy}");
  assert.equal(
    (await fetch(url.replace("fixture.css", "missing.css"))).status,
    404,
  );
});

test("Vercel parsed JSON bodies and raw strings use the same request parser", async () => {
  assert.deepEqual(await bodyJson({ body: { identity: "test" } }), {
    identity: "test",
  });
  assert.deepEqual(await bodyJson({ body: '{"identity":"test"}' }), {
    identity: "test",
  });
  assert.deepEqual(
    await bodyJson({ body: Buffer.from('{"identity":"test"}') }),
    { identity: "test" },
  );
  await assert.rejects(bodyJson({ body: "invalid" }), { status: 400 });
  await assert.rejects(bodyJson({ body: "x".repeat(101) }), { status: 413 });
  for (const body of [null, [], 1, true, "null", "[]"])
    await assert.rejects(bodyJson({ body }), { status: 400 });
});
