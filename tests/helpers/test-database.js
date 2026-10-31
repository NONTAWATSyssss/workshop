"use strict";
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresDatabase } = require("../../src/database");

module.exports = async function database() {
  const engine = new PGlite();
  const query = async (sql, values = []) => {
    if (sql === "SELECT pg_advisory_xact_lock(724017001)") return { rows: [] };
    const result =
      !values.length && sql.includes(";")
        ? (await engine.exec(sql)).at(-1)
        : await engine.query(sql, values);
    return { ...result, rowCount: result.affectedRows };
  };
  let queue = Promise.resolve();
  const db = createPostgresDatabase({
    query,
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query, release };
    },
    end: () => engine.close(),
  });
  await db.initialize();
  return db;
};
