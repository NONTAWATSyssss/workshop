"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const database = require("./helpers/test-database");
const { parameters } = require("../src/database");
const { connectionOptions } = require("../src/database/pool");

test("SQL parameters preserve question marks inside quoted text", () => {
  assert.equal(
    parameters("SELECT '?' AS label, x FROM users WHERE id=? AND name=?"),
    "SELECT '?' AS label, x FROM users WHERE id=$1 AND name=$2",
  );
});

test("Supabase connection options verify TLS and reject incomplete settings", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const options = connectionOptions(
      "postgresql://project:example-secret@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=require",
    );
    assert.equal(options.max, 1);
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.match(options.ssl.ca, /BEGIN CERTIFICATE/);
    assert.equal(
      new URL(options.connectionString).searchParams.has("sslmode"),
      false,
    );
    assert.throws(
      () => connectionOptions("postgresql://USER:PASSWORD@HOST/postgres"),
      { code: "DATABASE_URL_INVALID" },
    );
    assert.throws(
      () =>
        connectionOptions(
          "postgresql://project:secret@aws-example.pooler.supabase.com/postgres?sslmode=disable",
        ),
      { code: "DATABASE_SSL_REQUIRED" },
    );
    assert.throws(
      () =>
        connectionOptions(
          "postgresql://project:secret@aws-example.pooler.supabase.com/postgres",
          { certificate: "invalid" },
        ),
      { code: "DATABASE_CA_INVALID" },
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("schema setup is repeatable and preserves profiles alongside restored membership tables", async (t) => {
  const db = await database();
  t.after(() => db.close());
  const tables = (
    await db
      .prepare("SELECT tablename FROM pg_tables WHERE schemaname='public'")
      .all()
  ).map((row) => row.tablename);
  for (const table of [
    "sessions",
    "otp_challenges",
    "password_reset_grants",
    "login_attempts",
  ])
    assert.ok(tables.includes(table), table);
  const columns = await db
    .prepare(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'",
    )
    .all();
  assert.deepEqual(
    columns
      .filter((row) => row.column_name.includes("password"))
      .map((row) => row.column_name)
      .sort(),
    ["password_hash", "password_plaintext", "password_salt"],
  );
  await require("./helpers/fixtures")(db);
  // Existing cloud data and obsolete tables are deliberately left untouched.
  await db.exec(
    "CREATE TABLE legacy_auth_data (id TEXT PRIMARY KEY); INSERT INTO legacy_auth_data VALUES ('keep')",
  );
  await db.initialize();
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM workshops").get()).n,
    5,
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM legacy_auth_data").get()).n,
    1,
  );
  await db.exec(
    "CREATE ROLE public_reader; GRANT SELECT ON users,workshops,app_state TO public_reader; SET ROLE public_reader",
  );
  try {
    for (const table of ["users", "workshops", "app_state"])
      assert.deepEqual(await db.prepare("SELECT * FROM " + table).all(), []);
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("failed transactions roll back before the database connection is reused", async (t) => {
  const db = await database();
  t.after(() => db.close());
  await assert.rejects(
    db.withRequest(async () => {
      await db.exec("BEGIN IMMEDIATE");
      await db
        .prepare("INSERT INTO app_state(id,revision,data_json) VALUES(1,7,?)")
        .run("{}");
      throw Error("abort");
    }),
    /abort/,
  );
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM app_state").get()).n,
    0,
  );
  await db.withRequest(async () => {
    await db.exec("BEGIN IMMEDIATE");
    await db
      .prepare("INSERT INTO app_state(id,revision,data_json) VALUES(1,8,?)")
      .run("{}");
    await db.exec("COMMIT");
  });
  assert.equal(
    (await db.prepare("SELECT revision FROM app_state").get()).revision,
    8,
  );
});
