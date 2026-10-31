"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { X509Certificate } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../..");

function connectionOptions(
  connectionString = process.env.DATABASE_URL,
  options = {},
) {
  let url;
  try {
    url = new URL(String(connectionString || ""));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      /\[|\]|YOUR-PASSWORD|USER:PASSWORD/i.test(url.href)
    )
      throw Error();
  } catch {
    throw Object.assign(
      new Error(
        "DATABASE_URL ไม่ถูกต้อง ให้คัดลอก PostgreSQL connection string จาก Supabase Connect และแทนค่ารหัสผ่านฐานข้อมูลให้ครบ",
      ),
      { code: "DATABASE_URL_INVALID" },
    );
  }
  const supabase =
    url.hostname.endsWith(".supabase.co") ||
    url.hostname.endsWith(".supabase.com");
  if (supabase) {
    if (
      ["disable", "no-verify", "allow", "prefer"].includes(
        url.searchParams.get("sslmode"),
      )
    )
      throw Object.assign(
        new Error("การเชื่อม Supabase ต้องใช้ SSL เช่น sslmode=require"),
        { code: "DATABASE_SSL_REQUIRED" },
      );
    url.searchParams.set("sslmode", "verify-full");
  }
  const certificateFile =
    options.certificateFile === undefined
      ? process.env.DATABASE_CA_FILE ||
        (supabase ? path.join(ROOT, "database/certs/prod-ca-2021.crt") : null)
      : options.certificateFile;
  let certificate =
    options.certificate === undefined
      ? process.env.DATABASE_CA_CERT
      : options.certificate;
  if (certificateFile && !certificate) {
    try {
      certificate = fs.readFileSync(
        path.resolve(ROOT, certificateFile),
        "utf8",
      );
    } catch {
      throw Object.assign(
        new Error(
          "ไม่พบไฟล์ใบรับรองฐานข้อมูล ตรวจ DATABASE_CA_FILE และไฟล์ใน database/certs",
        ),
        { code: "DATABASE_CA_INVALID" },
      );
    }
  }
  let ssl;
  if (certificate) {
    certificate = String(certificate).replace(/\\n/g, "\n");
    try {
      const cert = new X509Certificate(certificate);
      if (
        !cert.ca ||
        Date.parse(cert.validTo) <= Date.now() ||
        Date.parse(cert.validFrom) > Date.now()
      )
        throw Error();
    } catch {
      throw Object.assign(
        new Error(
          "ใบรับรองฐานข้อมูลไม่ถูกต้องหรือหมดอายุ กรุณาดาวน์โหลด CA จาก Supabase ใหม่",
        ),
        { code: "DATABASE_CA_INVALID" },
      );
    }
    // pg parses SSL URL parameters after the ssl object. Remove those keys so
    // they cannot replace the trusted CA or disable hostname verification.
    if (url.searchParams.has("sslcert") || url.searchParams.has("sslkey"))
      throw Object.assign(
        new Error(
          "ให้กำหนดใบรับรองผ่าน DATABASE_CA_FILE หรือ DATABASE_CA_CERT โดยไม่ผสม sslcert/sslkey ใน URL",
        ),
        { code: "DATABASE_SSL_CONFLICT" },
      );
    for (const key of ["sslmode", "sslrootcert", "ssl", "uselibpqcompat"])
      url.searchParams.delete(key);
    ssl = { ca: certificate, rejectUnauthorized: true };
  }
  return {
    connectionString: url.toString(),
    ...(ssl ? { ssl } : {}),
    max: process.env.VERCEL ? 1 : 3,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
  };
}
function createPool(connectionString) {
  const { Pool, types } = require("pg");
  types.setTypeParser(20, Number);
  return new Pool(connectionOptions(connectionString));
}
module.exports = { createPool, connectionOptions };
