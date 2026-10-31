"use strict";
require("../src/config");
const { createPool } = require("../src/database/pool");
const { createPostgresDatabase } = require("../src/database");
async function main() {
  const command = process.argv[2] || "status";
  if (!["status", "setup"].includes(command))
    throw Object.assign(Error("Use db:status or db:setup."), {
      code: "DATABASE_COMMAND_INVALID",
    });
  if (!process.env.DATABASE_URL)
    throw Object.assign(
      Error("Set DATABASE_URL in .env or Vercel Environment Variables."),
      { code: "DATABASE_URL_MISSING" },
    );
  const db = createPostgresDatabase(createPool());
  try {
    if (command === "setup") await db.initialize();
    const ready = await db
      .prepare(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('users','workshops','registrations','ratings','complaints','complaint_replies','notifications','app_state','sessions','otp_challenges','password_reset_grants','login_attempts')",
      )
      .get();
    console.log(
      JSON.stringify(
        {
          connected: true,
          database: "PostgreSQL",
          tablesReady: ready.n === 12,
          membershipAvailable: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error("Database command failed:", error.code || "UNKNOWN");
    process.exitCode = 1;
  });
module.exports = { main };
