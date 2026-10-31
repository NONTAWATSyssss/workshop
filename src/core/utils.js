"use strict";
const crypto = require("node:crypto");
const now = () => new Date().toISOString();
const localDateInput = (value) => {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)
  )
    return value.slice(0, 16);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
};
const readJson = (value) =>
  typeof value === "string" ? JSON.parse(value) : structuredClone(value);
// datetime-local fields represent campus time, including on Vercel's UTC host.
const workshopTime = (value) => {
  const text = String(value);
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
      ? `${text}+07:00`
      : text,
  );
};
const workshopTimestamp = (value) =>
  new Date(workshopTime(value)).toISOString();
const uid = () => crypto.randomUUID();
const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  code: row.code,
  email: row.email,
  phone: row.phone,
  faculty: row.faculty,
  major: row.major,
  status: row.status,
  role: row.role,
});
function validCover(value) {
  if (!value) return true;
  if (
    typeof value === "string" &&
    /^\/assets\/images\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp)$/.test(value)
  ) {
    return require("node:fs").existsSync(
      require("node:path").join(__dirname, "../../public", value),
    );
  }
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    String(value),
  );
  if (!m) return false;
  const b = Buffer.from(m[2], "base64");
  if (b.length > 3 * 1024 * 1024) return false;
  if (m[1] === "jpeg")
    return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (m[1] === "png")
    return (
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  return (
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  );
}

const isExpired = (value) =>
  !Number.isFinite(new Date(value).getTime()) ||
  new Date(value).getTime() <= Date.now();

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const passwordRecord = (
  password,
  salt = crypto.randomBytes(16).toString("hex"),
) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") });
const verifyPassword = (password, salt, expected) => {
  if (
    typeof password !== "string" ||
    password.length > 128 ||
    typeof salt !== "string" ||
    typeof expected !== "string" ||
    !/^[a-f0-9]{128}$/i.test(expected)
  )
    return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const digest = Buffer.from(expected, "hex");
  return (
    digest.length === actual.length && crypto.timingSafeEqual(digest, actual)
  );
};
function validNewPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    password.length <= 128 &&
    !/\s/.test(password) &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    ![
      "password123!",
      "password1234!",
      "qwerty123456!",
      "123456789abc!",
    ].includes(password.toLowerCase())
  );
}

module.exports = {
  isExpired,
  hashToken,
  passwordRecord,
  verifyPassword,
  validNewPassword,
  now,
  localDateInput,
  readJson,
  workshopTime,
  workshopTimestamp,
  uid,
  publicUser,
  validCover,
};
