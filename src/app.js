"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const utils = require("./core/utils");
const { createHttp, createStatic, isAllowedOrigin } = require("./core/http");
const { createCatalog } = require("./features/workshops/catalog");
const { createMembership } = require("./features/membership");

module.exports = async function createApplication(options = {}) {
  const db = options.database || (await require("./database").openDatabase());
  const context = { ...config, ...utils, db, crypto, fs, path };
  Object.assign(context, createHttp(config));
  Object.assign(context, require("./features/workshops/store")(context));
  try {
    await db.withRequest(async () => {
      await db.exec("BEGIN IMMEDIATE");
      await context.ensureSnapshot();
      await db.exec("COMMIT");
    });
  } catch (error) {
    if (!options.database) await db.close();
    throw error;
  }
  const membership = createMembership(context, options);
  context.requireAccess = membership.requireAccess;
  const { routeApi } = require("./features/workshops/management")(context);
  const { json } = context;
  const { serveStatic } = createStatic({ ...config, fs, path });
  const catalog = createCatalog(db);
  async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/api/")) return serveStatic(req, res, url);
      if (!isAllowedOrigin(req, config.APP_ORIGIN))
        return json(res, 403, { error: "คำขอมาจากแหล่งที่ไม่ได้รับอนุญาต" });
      if (req.method === "OPTIONS") {
        res.writeHead(204, { Allow: "GET, HEAD, POST, OPTIONS" });
        return res.end();
      }
      if (
        ["GET", "HEAD"].includes(req.method) &&
        url.pathname === "/api/health"
      )
        return json(res, 200, {
          ok: true,
          app: "BSRU Workshop",
          database: "PostgreSQL",
          membershipAvailable: true,
          time: new Date().toISOString(),
        });
      if (
        ["GET", "HEAD"].includes(req.method) &&
        url.pathname === "/api/workshops"
      )
        return json(res, 200, { workshops: await catalog.list() });
      const match = /^\/api\/workshops\/([^/]+)$/.exec(url.pathname);
      if (
        match &&
        ["GET", "HEAD"].includes(req.method) &&
        !["delete", "finalize-attendance"].includes(match[1])
      ) {
        let id;
        try {
          id = decodeURIComponent(match[1]);
        } catch {
          return json(res, 400, { error: "URL ไม่ถูกต้อง" });
        }
        const workshop = await catalog.find(id);
        return workshop
          ? json(res, 200, { workshop })
          : json(res, 404, { error: "ไม่พบกิจกรรม" });
      }
      await db.withRequest(async () => {
        if (await membership.route(req, res, url)) return;
        return routeApi(req, res, url);
      });
    } catch (error) {
      if (!res.headersSent) {
        console.error("Request failed:", error.code || error.name);
        return json(res, error.status || 500, {
          code: "REQUEST_FAILED",
          error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองอีกครั้ง",
        });
      }
      res.destroy();
    }
  }
  return { handler, close: () => db.close() };
};
