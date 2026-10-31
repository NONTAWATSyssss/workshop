"use strict";

const OTP_TTL = 5 * 60000;
const WINDOW = 15 * 60000;
const COOLDOWN = 60000;
const MAX_ATTEMPTS = 5;

module.exports = function passwordRecovery(c, delivery) {
  const {
    db,
    json,
    now,
    uid,
    crypto,
    hashToken,
    readJson,
    isExpired,
    validNewPassword,
    passwordRecord,
  } = c;
  const fail = (status, message, code) => {
    throw Object.assign(new Error(message), { status, code });
  };
  const until = (ms) => new Date(Date.now() + ms).toISOString();
  async function request(req, data) {
    if (!delivery.available)
      fail(
        503,
        "ยังไม่ได้ตั้งค่าอีเมลสำหรับส่ง OTP กรุณาติดต่อผู้ดูแลระบบ",
        "OTP_DELIVERY_NOT_CONFIGURED",
      );
    const email = String(data.contact || data.email || "")
      .trim()
      .toLowerCase();
    if (data.purpose && data.purpose !== "reset")
      fail(400, "คำขอ OTP ไม่ถูกต้อง");
    if (
      (data.channel && data.channel !== "email") ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 150
    )
      fail(400, "กรุณากรอกอีเมลที่ใช้สมัครสมาชิกให้ถูกต้อง");
    const ip = hashToken(
      String(
        (process.env.VERCEL && req.headers["x-real-ip"]) ||
          req.socket?.remoteAddress ||
          "unknown",
      ),
    );
    const id = uid(),
      code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expires = until(OTP_TTL),
      created = now();
    let user, payload;
    await db.exec("BEGIN IMMEDIATE");
    try {
      const rows = await db
        .prepare(
          "SELECT * FROM otp_challenges WHERE purpose='password-reset' AND created_at>? ORDER BY created_at DESC",
        )
        .all(new Date(Date.now() - WINDOW).toISOString());
      const own = rows.filter((row) => row.contact === email);
      if (own[0] && Date.now() - Date.parse(own[0].created_at) < COOLDOWN)
        fail(429, "กรุณารอ 60 วินาทีก่อนขอ OTP ใหม่");
      if (
        own.length >= 3 ||
        rows.filter((row) => readJson(row.payload_json).ip === ip).length >= 15
      )
        fail(429, "ขอ OTP หลายครั้งเกินไป กรุณารอ 15 นาที");
      user = await db
        .prepare("SELECT id FROM users WHERE lower(email)=?")
        .get(email);
      payload = { userId: user?.id || null, ip, sent: false };
      await db
        .prepare(
          "UPDATE otp_challenges SET consumed_at=? WHERE purpose='password-reset' AND contact=? AND consumed_at IS NULL",
        )
        .run(created, email);
      if (user)
        await db
          .prepare(
            "UPDATE password_reset_grants SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
          )
          .run(created, user.id);
      await db
        .prepare(
          "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,'password-reset','email',?,?,?,?,?)",
        )
        .run(
          id,
          email,
          hashToken(`${id}:${code}`),
          JSON.stringify(payload),
          expires,
          created,
        );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    // Unknown addresses receive the same public response, but no mail or grant.
    if (user) {
      try {
        await delivery.send(email, code, { purpose: "reset" });
        await db
          .prepare("UPDATE otp_challenges SET payload_json=? WHERE id=?")
          .run(JSON.stringify({ ...payload, sent: true }), id);
      } catch {
        await db
          .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
          .run(now(), id);
        fail(
          502,
          "ส่งอีเมล OTP ไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
          "OTP_SEND_FAILED",
        );
      }
    }
    return {
      challengeId: id,
      expiresAt: expires,
      resendAt: new Date(Date.parse(created) + COOLDOWN).toISOString(),
      message:
        "หากอีเมลนี้มีบัญชี ระบบจะส่ง OTP ไปยังอีเมลที่สมัคร กรุณาตรวจ Inbox และ Spam",
    };
  }
  async function verify(data) {
    const id = String(data.challengeId || ""),
      code = String(data.code || "");
    await db.exec("BEGIN IMMEDIATE");
    try {
      const row = await db
        .prepare(
          "SELECT * FROM otp_challenges WHERE id=? AND purpose='password-reset'",
        )
        .get(id);
      if (!row || row.consumed_at || isExpired(row.expires_at))
        fail(410, "OTP หมดอายุหรือใช้ไปแล้ว กรุณาขอใหม่");
      if (row.attempts >= MAX_ATTEMPTS)
        fail(429, "กรอก OTP ผิดครบ 5 ครั้ง กรุณาขอใหม่");
      const payload = readJson(row.payload_json);
      const match =
        /^\d{6}$/.test(code) &&
        crypto.timingSafeEqual(
          Buffer.from(row.code_hash),
          Buffer.from(hashToken(`${id}:${code}`)),
        );
      if (!match || !payload.userId || !payload.sent) {
        const attempts = Number(row.attempts) + 1;
        await db
          .prepare(
            "UPDATE otp_challenges SET attempts=?,consumed_at=? WHERE id=?",
          )
          .run(attempts, attempts >= MAX_ATTEMPTS ? now() : null, id);
        await db.exec("COMMIT");
        return {
          status: 400,
          body: {
            error:
              attempts >= MAX_ATTEMPTS
                ? "กรอก OTP ผิดครบ 5 ครั้ง กรุณาขอใหม่"
                : `OTP ไม่ถูกต้อง เหลือโอกาส ${MAX_ATTEMPTS - attempts} ครั้ง`,
          },
        };
      }
      await db
        .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
        .run(now(), id);
      await db
        .prepare(
          "UPDATE password_reset_grants SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
        )
        .run(now(), payload.userId);
      const grant = crypto.randomBytes(32).toString("base64url"),
        expires = until(OTP_TTL);
      await db
        .prepare(
          "INSERT INTO password_reset_grants(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
        )
        .run(hashToken(grant), payload.userId, expires, now());
      await db.exec("COMMIT");
      return {
        status: 200,
        body: { purpose: "reset", grant, expiresAt: expires },
      };
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  async function reset(data) {
    const grant = String(data.grant || ""),
      password = String(data.password || "");
    if (
      !validNewPassword(password) ||
      password !== String(data.confirmation || "")
    )
      fail(400, "รหัสผ่านใหม่ไม่ผ่านเกณฑ์หรือยืนยันไม่ตรงกัน");
    await db.exec("BEGIN IMMEDIATE");
    try {
      const row = await db
        .prepare(
          "UPDATE password_reset_grants SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING user_id",
        )
        .get(now(), hashToken(grant), now());
      if (!row)
        fail(410, "สิทธิ์ตั้งรหัสผ่านหมดอายุหรือใช้ไปแล้ว กรุณาขอ OTP ใหม่");
      const record = passwordRecord(password);
      await db
        .prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id=?")
        .run(record.salt, record.hash, row.user_id);
      await c.storeReadablePassword(row.user_id, password);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
      await db
        .prepare(
          "UPDATE password_reset_grants SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
        )
        .run(now(), row.user_id);
      const active = await db
        .prepare(
          "SELECT * FROM otp_challenges WHERE purpose='password-reset' AND consumed_at IS NULL",
        )
        .all();
      for (const challenge of active)
        if (readJson(challenge.payload_json).userId === row.user_id)
          await db
            .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
            .run(now(), challenge.id);
      await db.exec("COMMIT");
      return { ok: true };
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  return async function route(req, res, url) {
    if (
      !["/api/otp/request", "/api/otp/verify", "/api/password/reset"].includes(
        url.pathname,
      )
    )
      return false;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    try {
      const data = await c.bodyJson(req);
      if (url.pathname === "/api/otp/request")
        json(res, 200, await request(req, data));
      else if (url.pathname === "/api/otp/verify") {
        const result = await verify(data);
        json(res, result.status, result.body);
      } else
        json(res, 200, await reset(data), {
          "Set-Cookie": `bsru_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        });
    } catch (error) {
      json(res, error.status || 500, {
        error: error.status
          ? error.message
          : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
        code: error.code,
      });
    }
    return true;
  };
};
