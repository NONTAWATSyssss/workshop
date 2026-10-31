"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedOrigin } = require("../src/core/http");

test("HTTPS deployment origin works behind a proxy; foreign origins fail", () => {
  const request = (origin, host = "workshop.vercel.app") => ({
    headers: { origin, host },
  });
  assert.equal(isAllowedOrigin(request("https://workshop.vercel.app")), true);
  assert.equal(isAllowedOrigin(request("https://other.vercel.app")), false);
  assert.equal(isAllowedOrigin(request("null")), false);
  assert.equal(isAllowedOrigin(request("malformed")), false);
  assert.equal(isAllowedOrigin(request(undefined)), true);
  assert.equal(
    isAllowedOrigin(request("http://localhost:8001", "localhost:8001")),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      request("https://custom.example", "internal:3000"),
      "https://custom.example",
    ),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      request("https://workshop.vercel.app"),
      "https://custom.example",
    ),
    false,
  );
});
