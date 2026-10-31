"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

test("Vercel entry exports a handler and reports missing configuration without a runtime crash", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const handler = require('./server');
    assert.equal(handler, require('./api'));
    assert.equal(typeof handler, 'function');
    const res = {
      setHeader() {},
      end(body) {
        assert.equal(this.statusCode, 503);
        assert.equal(JSON.parse(body).code, 'DATABASE_URL_MISSING');
        console.log('handled');
      }
    };
    handler({url:'/api/health',headers:{}},res).catch(error=>{console.error(error);process.exitCode=1;});
  `,
    ],
    {
      env: { ...process.env, VERCEL: "1", DATABASE_URL: "" },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /handled/);
});
