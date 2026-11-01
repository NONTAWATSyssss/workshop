"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const database = require("./helpers/test-database");
const utils = require("../src/core/utils");
const {
  addSampleWorkshops,
  samples,
  additionalSamples,
} = require("../scripts/add-sample-workshops");

async function fixture(t) {
  const db = await database();
  t.after(() => db.close());
  await require("./helpers/fixtures")(db);
  await db.withRequest(() =>
    require("../src/features/workshops/store")({
      ...utils,
      db,
    }).ensureSnapshot(),
  );
  return db;
}

test("adding sample workshops is atomic, idempotent and preserves existing workspace records", async (t) => {
  const db = await fixture(t);
  const before = await db
    .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
    .get();
  const original = utils.readJson(before.data_json);
  const result = await addSampleWorkshops(db);
  assert.equal(result.added.length, 4);
  const after = await db
    .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
    .get();
  const snapshot = utils.readJson(after.data_json);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(
    snapshot.workshops.filter((w) => !samples.some((s) => s.id === w.id)),
    original.workshops,
  );
  for (const key of [
    "users",
    "registrations",
    "complaints",
    "ratings",
    "notifications",
  ])
    assert.deepEqual(snapshot[key], original[key]);
  assert.deepEqual(snapshot.auditLog.slice(4), original.auditLog);
  for (const sample of samples) {
    const row = await db
      .prepare("SELECT * FROM workshops WHERE id=?")
      .get(sample.id);
    const item = snapshot.workshops.find((w) => w.id === sample.id);
    assert.equal(row.title, item.title);
    assert.equal(utils.localDateInput(row.start_at), item.start);
    assert.equal(row.cover, item.cover);
    assert.equal(row.closed, false);
    assert.ok(utils.validCover(row.cover));
  }
  assert.equal((await addSampleWorkshops(db)).added.length, 0);
  assert.deepEqual(
    await db
      .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
      .get(),
    after,
  );
});

test("sample workshop insertion rolls back all rows if any insertion fails", async (t) => {
  const db = await fixture(t);
  const before = await db
    .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
    .get();
  const prepare = db.prepare.bind(db);
  let inserted = 0;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.includes("INSERT INTO workshops"))
      return {
        ...statement,
        all: async (...values) => {
          if (++inserted === 2) throw Error("TEST_INSERT_FAILED");
          return statement.all(...values);
        },
      };
    return statement;
  };
  await assert.rejects(addSampleWorkshops(db), /TEST_INSERT_FAILED/);
  assert.deepEqual(
    await db
      .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
      .get(),
    before,
  );
  for (const sample of samples)
    assert.equal(
      await db.prepare("SELECT id FROM workshops WHERE id=?").get(sample.id),
      undefined,
    );
});

test("the additional batch adds exactly seven distinct covers without changing earlier workshops or registrations", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { createHash } = require("node:crypto");
  const db = await fixture(t);
  await addSampleWorkshops(db);
  const before = await db
    .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
    .get();
  const original = utils.readJson(before.data_json);
  const originalRows = await db
    .prepare("SELECT * FROM workshops ORDER BY id")
    .all();
  const hashes = new Set();
  for (const item of [...samples, ...additionalSamples]) {
    const bytes = fs.readFileSync(
      path.join(__dirname, "../public", item.cover),
    );
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length < 200000);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(!hashes.has(hash), "cover image contents must be unique");
    hashes.add(hash);
  }
  assert.equal(additionalSamples.length, 7);
  assert.equal(new Set(additionalSamples.map((item) => item.id)).size, 7);
  const result = await addSampleWorkshops(db, additionalSamples);
  assert.equal(result.added.length, 7);
  assert.equal(result.skipped, 0);
  const after = await db
    .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
    .get();
  const snapshot = utils.readJson(after.data_json);
  assert.equal(after.revision, before.revision + 1);
  const addedIds = new Set(result.added);
  assert.deepEqual(
    (await db.prepare("SELECT * FROM workshops ORDER BY id").all()).filter(
      (item) => !addedIds.has(item.id),
    ),
    originalRows,
  );
  assert.deepEqual(
    snapshot.workshops.filter((item) => !addedIds.has(item.id)),
    original.workshops,
  );
  for (const key of [
    "users",
    "registrations",
    "complaints",
    "ratings",
    "notifications",
  ])
    assert.deepEqual(snapshot[key], original[key]);
  assert.deepEqual(snapshot.auditLog.slice(7), original.auditLog);
  for (const item of additionalSamples) {
    const row = await db
      .prepare("SELECT * FROM workshops WHERE id=?")
      .get(item.id);
    const saved = snapshot.workshops.find((entry) => entry.id === item.id);
    assert.equal(row.cover, item.cover);
    assert.equal(saved.cover, item.cover);
    assert.equal(row.closed, false);
    assert.equal(saved.closed, false);
    assert.equal(saved.start, utils.localDateInput(item.start));
    assert.equal(saved.end, utils.localDateInput(item.end));
    assert.equal(
      Date.parse(item.end) - Date.parse(item.start),
      item.hours * 3600000,
    );
  }
  assert.deepEqual(await addSampleWorkshops(db, additionalSamples), {
    added: [],
    skipped: 7,
  });
  assert.deepEqual(
    await db
      .prepare("SELECT revision,data_json FROM app_state WHERE id=1")
      .get(),
    after,
  );
});
