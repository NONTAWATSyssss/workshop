"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const database = require("./helpers/test-database");
const { publicUser } = require("../src/core/utils");

test("readable passwords persist for database operators and stay out of public profiles", async (t) => {
  const db = await database();
  t.after(() => db.close());
  await require("./helpers/fixtures")(db);
  assert.equal(
    (
      await db
        .prepare("SELECT password_plaintext FROM users WHERE id=?")
        .get("student")
    ).password_plaintext,
    null,
  );
  const password = "Test-only readable password!";
  await db
    .prepare("UPDATE users SET password_plaintext=? WHERE id=?")
    .run(password, "student");
  await db.initialize();
  const row = await db.prepare("SELECT * FROM users WHERE id=?").get("student");
  assert.equal(row.password_plaintext, password);
  assert.equal(row.name, "นักศึกษาตัวอย่าง");
  assert.equal(Object.hasOwn(publicUser(row), "password_plaintext"), false);
  assert.doesNotMatch(
    JSON.stringify(publicUser(row)),
    /Test-only readable password/,
  );
  await db.exec(
    "CREATE ROLE password_reader; GRANT SELECT ON users TO password_reader; SET ROLE password_reader",
  );
  try {
    assert.deepEqual(
      await db.prepare("SELECT password_plaintext FROM users").all(),
      [],
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});
