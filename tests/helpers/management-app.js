"use strict";
const crypto = require("node:crypto");
const config = require("../../src/config");
const utils = require("../../src/core/utils");
const { createHttp } = require("../../src/core/http");
module.exports = async function managementApplication({ database: db }) {
  await require("./fixtures")(db);
  const context = { ...config, ...utils, db, crypto };
  Object.assign(context, createHttp(config));
  Object.assign(
    context,
    require("../../src/features/workshops/store")(context),
  );
  await db.withRequest(() => context.ensureSnapshot());
  // Test actors isolate domain rules; membership tests cover production login.
  context.requireAccess = async (req, res, role) => {
    const id = /test_actor=(admin|student)/.exec(req.headers.cookie || "")?.[1];
    const user = id
      ? utils.publicUser(
          await db.prepare("SELECT * FROM users WHERE id=?").get(id),
        )
      : null;
    if (!user) {
      context.json(res, 401, { error: "Test actor required" });
      return null;
    }
    if (
      (role && role !== user.role) ||
      (req.method !== "GET" &&
        req.headers["x-csrf-token"] !== "test-only-token")
    ) {
      context.json(res, 403, { error: "Test access denied" });
      return null;
    }
    return { user };
  };
  const { routeApi } = require("../../src/features/workshops/management")(
    context,
  );
  return {
    handler(req, res) {
      const url = new URL(req.url, "http://localhost");
      return db
        .withRequest(async () => {
          if (req.method === "GET" && url.pathname === "/api/workshops")
            return context.json(res, 200, {
              workshops: await context.workshopRows(),
            });
          return routeApi(req, res, url);
        })
        .catch((error) => {
          context.json(res, error.status || 500, { error: error.message });
        });
    },
    close: () => db.close(),
  };
};
