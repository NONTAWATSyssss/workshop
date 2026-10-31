"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const fs = require("node:fs");
const path = require("node:path");

// The application uses positional parameters; only SQL placeholders outside
// quoted strings are translated. Values are always passed separately to pg.
function parameters(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? "$" + ++index : token,
  );
}

function createPostgresDatabase(pool) {
  const scope = new AsyncLocalStorage();
  let booleanClosed = true;
  const normalize = (row) =>
    row &&
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    );
  const query = (sql, values = []) =>
    (scope.getStore()?.client || pool).query(parameters(sql), values);
  const db = {
    kind: "postgres",
    boolean: (value) =>
      booleanClosed ? Boolean(value) : Number(Boolean(value)),
    prepare(sql) {
      return {
        async get(...values) {
          return normalize((await query(sql, values)).rows[0]);
        },
        async all(...values) {
          return (await query(sql, values)).rows.map(normalize);
        },
        async run(...values) {
          return { changes: (await query(sql, values)).rowCount };
        },
      };
    },
    async exec(sql) {
      if (sql.trim().toUpperCase() === "BEGIN IMMEDIATE") {
        await query("BEGIN");
        const request = scope.getStore();
        if (!request) throw new Error("Transactions require withRequest().");
        request.transaction = true;
        // Match SQLite's single-writer semantics across Vercel instances.
        await query("SELECT pg_advisory_xact_lock(724017001)");
        return;
      }
      const result = await query(sql);
      if (["COMMIT", "ROLLBACK"].includes(sql.trim().toUpperCase())) {
        const request = scope.getStore();
        if (request) request.transaction = false;
      }
      return result;
    },
    async withRequest(work) {
      const client = await pool.connect();
      const request = { client, transaction: false };
      try {
        return await scope.run(request, work);
      } finally {
        // A failed request must never return an open transaction to the pool.
        try {
          if (request.transaction) await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
    },
    async initialize() {
      const schema = fs.readFileSync(
        path.join(__dirname, "../../database/schema.sql"),
        "utf8",
      );
      await db.withRequest(async () => {
        await db.exec("BEGIN IMMEDIATE");
        await db.exec(schema);
        const column = await db
          .prepare(
            "SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='workshops' AND column_name='closed'",
          )
          .get();
        booleanClosed = column?.data_type === "boolean";
        await db.exec("COMMIT");
      });
    },
    close: () => pool.end(),
  };
  return db;
}

async function openDatabase() {
  if (!process.env.DATABASE_URL)
    throw Object.assign(
      new Error(
        "Set DATABASE_URL to your Supabase PostgreSQL connection string.",
      ),
      { code: "DATABASE_URL_MISSING" },
    );
  const db = createPostgresDatabase(require("./pool").createPool());
  try {
    await db.initialize();
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
module.exports = { openDatabase, createPostgresDatabase, parameters };
