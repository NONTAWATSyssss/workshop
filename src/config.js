"use strict";
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
if (!process.env.VERCEL) {
  const fs = require("node:fs");
  const file = path.join(ROOT, ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
const PUBLIC = path.join(ROOT, "public");
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const APP_ORIGIN = process.env.APP_ORIGIN
  ? new URL(process.env.APP_ORIGIN).origin
  : null;
const PREFERRED_PORT = Number(process.env.PORT || 8001);
if (
  !Number.isInteger(PREFERRED_PORT) ||
  PREFERRED_PORT < 0 ||
  PREFERRED_PORT > 65535
)
  throw new Error("PORT must be an integer from 0 to 65535.");
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

module.exports = {
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,
  ROOT,
  PUBLIC,
  HOST,
  APP_ORIGIN,
  PREFERRED_PORT,
  MAX_BODY_BYTES,
  MIME,
};
