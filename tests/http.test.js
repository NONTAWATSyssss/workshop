"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { bodyJson } = require("../src/core/http").createHttp({
  MAX_BODY_BYTES: 100,
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
