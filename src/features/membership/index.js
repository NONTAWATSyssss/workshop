"use strict";

function createAuth({
  db,
  parseCookies,
  hashToken,
  isExpired,
  publicUser,
  json,
}) {
  async function sessionFor(req) {
    const raw = parseCookies(req.headers.cookie).bsru_session;
    if (!raw) return null;
    const row = await db
      .prepare(
        `SELECT s.token_hash,s.csrf_token,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`,
      )
      .get(hashToken(raw));
    if (!row || isExpired(row.expires_at) || row.status !== "APPROVED")
      return null;
    return { row, user: publicUser(row), csrf: row.csrf_token };
  }
  async function requireAccess(req, res, role) {
    const session = await sessionFor(req);
    if (!session) {
      json(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
      return null;
    }
    if (role && session.user.role !== role) {
      json(res, 403, { error: "ไม่มีสิทธิ์ดำเนินการ" });
      return null;
    }
    if (req.method !== "GET" && req.headers["x-csrf-token"] !== session.csrf) {
      json(res, 403, { error: "โทเคนความปลอดภัยไม่ถูกต้อง" });
      return null;
    }
    return session;
  }

  return { sessionFor, requireAccess };
}

("use strict");

// Public signup does not depend on the mail service. Passwords and profiles
// live in the application's database (Supabase PostgreSQL in production).
function passwordRegistration(c) {
  const { db, json, now, uid, hashToken, passwordRecord, validNewPassword } = c;
  const fail = (status, message, field) => {
    throw Object.assign(new Error(message), { status, field });
  };
  return async function route(req, res, url) {
    if (!url.pathname.startsWith("/api/registration/")) return false;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    let transaction = false;
    try {
      if (url.pathname !== "/api/registration/request")
        fail(
          404,
          "การสมัครใช้ชื่อ อีเมล และรหัสผ่าน กรุณากลับไปที่หน้าสมัครสมาชิก",
        );
      const data = await c.bodyJson(req);
      const name = String(data.name || "").trim();
      const email = String(data.email || "")
        .trim()
        .toLowerCase();
      const type = String(data.type || "");
      const code = String(data.code || "").trim();
      const phone = String(data.phone || "").trim();
      const password = String(data.password || "");
      if (!name || name.length > 120)
        fail(400, "กรุณากรอกชื่อ-นามสกุลไม่เกิน 120 ตัว", "name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)
        fail(400, "กรุณากรอกอีเมลให้ถูกต้อง", "email");
      if (!["นักศึกษา", "อาจารย์", "เจ้าหน้าที่"].includes(type))
        fail(400, "กรุณาเลือกประเภทผู้ใช้งาน", "type");
      if (!code || code.length > 30)
        fail(400, "กรุณากรอกรหัสประจำตัวไม่เกิน 30 ตัว", "code");
      if (!/^0\d{8,9}$/.test(phone))
        fail(400, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "phone");
      if (!validNewPassword(password))
        fail(
          400,
          "ใช้รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ ไม่มีช่องว่าง",
          "password",
        );
      await db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const ip = hashToken(
        String(
          (process.env.VERCEL && req.headers["x-real-ip"]) ||
            req.socket?.remoteAddress ||
            "unknown",
        ),
      );
      const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
      const count = await db
        .prepare(
          "SELECT count(*) n FROM otp_challenges WHERE purpose='password-signup-limit' AND contact=? AND created_at>?",
        )
        .get(ip, cutoff);
      if (Number(count.n) >= 10)
        fail(429, "สมัครหลายบัญชีเกินไป กรุณารอ 15 นาที");
      if (
        await db
          .prepare(
            "SELECT id FROM users WHERE lower(email)=? OR code=? OR phone=?",
          )
          .get(email, code, phone)
      )
        fail(
          409,
          "อีเมล รหัสประจำตัว หรือเบอร์โทรศัพท์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบหรือตรวจสอบข้อมูล",
        );
      const record = passwordRecord(password),
        userId = uid();
      await db
        .prepare(
          "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'APPROVED','user',?,?,?)",
        )
        .run(
          userId,
          name,
          type,
          code,
          email,
          phone,
          "",
          "",
          record.salt,
          record.hash,
          now(),
        );
      await c.storeReadablePassword(userId, password);
      await db
        .prepare(
          "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,'password-signup-limit','email',?,'','{}',?,?)",
        )
        .run(uid(), ip, new Date(Date.now() + 15 * 60000).toISOString(), now());
      await c.refreshSnapshot();
      await db.exec("COMMIT");
      transaction = false;
      json(res, 200, { registered: true, email });
    } catch (error) {
      if (transaction) await db.exec("ROLLBACK");
      json(res, error.status || (/unique/i.test(error.message) ? 409 : 500), {
        error: error.status
          ? error.message
          : /unique/i.test(error.message)
            ? "ข้อมูลบัญชีนี้ถูกใช้แล้ว กรุณาตรวจสอบข้อมูล"
            : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
        field: error.field,
      });
    }
    return true;
  };
}

("use strict");

function emailDelivery(options = {}) {
  const unavailable = () => ({
    available: false,
    async send() {
      throw new Error("EMAIL_NOT_CONFIGURED");
    },
  });
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (smtpUser && smtpPassword) {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    if (![465, 587, 2525].includes(port)) return unavailable();
    const from = process.env.SMTP_FROM || `BSRU Workshop <${smtpUser}>`;
    const transport = (
      options.createTransport || require("nodemailer").createTransport
    )({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: smtpUser,
        pass:
          host === "smtp.gmail.com"
            ? smtpPassword.replace(/\s/g, "")
            : smtpPassword,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      dnsTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return {
      available: true,
      async send(to, code, { purpose = "registration" } = {}) {
        const reset = purpose === "reset";
        try {
          const result = await transport.sendMail({
            from,
            to,
            subject: reset
              ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน BSRU Workshop"
              : "ยืนยันอีเมล BSRU Workshop",
            text: `${reset ? "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน" : "รหัสยืนยันอีเมล"}ของคุณคือ ${code}\nรหัสมีอายุ 5 นาที ใช้ได้ครั้งเดียว อย่าเปิดเผยรหัสนี้แก่ผู้อื่น\nหากไม่ได้เป็นผู้ขอรหัส สามารถละเว้นอีเมลนี้ได้`,
          });
          if (
            !result.accepted?.some(
              (address) => String(address).toLowerCase() === to.toLowerCase(),
            )
          )
            throw new Error("SMTP_REJECTED");
        } catch {
          throw new Error("EMAIL_SEND_FAILED");
        }
      },
    };
  }
  return unavailable();
}

function createMembership(c, options = {}) {
  const {
    db,
    json,
    now,
    uid,
    crypto,
    hashToken,
    bodyJson,
    publicUser,
    verifyPassword,
    SESSION_TTL_MS,
    refreshSnapshot,
    viewFromSnapshot,
    loadWorkspace,
  } = c;
  const { sessionFor, requireAccess } = createAuth(c);
  const avatarRoute = require("./avatar")({ ...c, requireAccess });
  c.storeReadablePassword = (id, password) =>
    db
      .prepare("UPDATE users SET password_plaintext=? WHERE id=?")
      .run(password, id);
  const mail = options.emailDelivery || emailDelivery();
  const signup = passwordRegistration(c);
  const recover = require("./recovery")(c, mail);
  async function accountRoute(req, res, url) {
    const cookieSecure =
      process.env.VERCEL || process.env.NODE_ENV === "production"
        ? "; Secure"
        : "";
    if (req.method === "GET" && url.pathname === "/api/session") {
      const session = await sessionFor(req);
      return json(res, 200, {
        user: session?.user || null,
        csrf: session?.csrf || null,
        registrationAvailable: true,
        registrationProvider: "password",
        passwordResetAvailable: mail.available,
        otpAvailable: mail.available,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/account") {
      const session = await requireAccess(req, res);
      if (!session) return;
      const data = await bodyJson(req);
      if (
        !data ||
        Object.keys(data).some((key) => !["name", "phone"].includes(key)) ||
        typeof data.name !== "string" ||
        typeof data.phone !== "string"
      )
        return json(res, 400, { error: "แก้ไขได้เฉพาะชื่อและเบอร์โทรศัพท์" });
      const name = data.name.trim();
      const phone = data.phone.trim();
      if (!name || name.length > 120)
        return json(res, 400, { error: "กรุณากรอกชื่อไม่เกิน 120 ตัวอักษร" });
      if (phone && !/^0\d{8,9}$/.test(phone))
        return json(res, 400, { error: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง" });
      await db.exec("BEGIN IMMEDIATE");
      let account, snapshot;
      try {
        if (
          await db
            .prepare("SELECT id FROM users WHERE phone=? AND id<>?")
            .get(phone, session.user.id)
        ) {
          await db.exec("ROLLBACK");
          return json(res, 409, {
            error: "เบอร์โทรศัพท์นี้ถูกใช้กับบัญชีอื่นแล้ว",
          });
        }
        await db
          .prepare("UPDATE users SET name=?,phone=? WHERE id=?")
          .run(name, phone, session.user.id);
        account = publicUser(
          await db
            .prepare("SELECT * FROM users WHERE id=?")
            .get(session.user.id),
        );
        snapshot = await refreshSnapshot();
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        if (
          error.code === "23505" ||
          /UNIQUE constraint failed/.test(error.message)
        )
          return json(res, 409, {
            error: "เบอร์โทรศัพท์นี้ถูกใช้กับบัญชีอื่นแล้ว",
          });
        throw error;
      }
      return json(res, 200, {
        user: account,
        store: viewFromSnapshot(snapshot, account),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/login")
      return bodyJson(req).then(async (data) => {
        const identity = String(data.identity || "")
            .trim()
            .toLowerCase(),
          password = String(data.password || ""),
          portal = data.portal;
        if (!identity || identity.length > 160 || password.length > 128)
          return json(res, 400, { error: "กรุณาตรวจสอบข้อมูลเข้าสู่ระบบ" });
        const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        // One database round trip records the attempt and retrieves credentials.
        // Failed credentials, blocked accounts and portal mismatches still count.
        const user = await db
          .prepare(
            `WITH recent AS (
              SELECT count(*) n FROM login_attempts WHERE identity=? AND created_at>=?
            ), attempted AS (
              INSERT INTO login_attempts(id,identity,created_at)
              SELECT ?,?,? FROM recent WHERE n<8 RETURNING id
            ), expired AS (
              DELETE FROM login_attempts WHERE created_at < ?
            )
            SELECT recent.n AS attempt_count,u.* FROM recent
            LEFT JOIN users u ON lower(u.email)=? OR u.phone=?`,
          )
          .get(
            identity,
            cutoff,
            uid(),
            identity,
            now(),
            cutoff,
            identity,
            identity,
          );
        if (Number(user.attempt_count) >= 8)
          return json(res, 429, {
            error: "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที",
            code: "LOGIN_RATE_LIMITED",
          });
        if (
          !user.id ||
          !verifyPassword(password, user.password_salt, user.password_hash)
        )
          return json(res, 401, {
            error: "อีเมล/เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง",
          });
        if (portal && user.role !== portal)
          return json(res, 403, {
            error: "บัญชีนี้ไม่มีสิทธิ์ใน Portal ที่เลือก",
          });
        if (user.status !== "APPROVED")
          return json(res, 403, {
            error:
              user.status === "REJECTED"
                ? "บัญชีนี้ไม่ได้รับอนุมัติ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบข้อมูล"
                : "บัญชีนี้รอเจ้าหน้าที่อนุมัติ",
          });
        const workspace = await loadWorkspace(publicUser(user));
        if (portal && workspace.user.role !== portal)
          return json(res, 403, {
            error: "บัญชีนี้ไม่มีสิทธิ์ใน Portal ที่เลือก",
          });
        const token = crypto.randomBytes(32).toString("base64url"),
          csrf = crypto.randomBytes(24).toString("base64url"),
          expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await db
          .prepare(
            `WITH cleared AS (DELETE FROM login_attempts WHERE identity=?)
            INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)`,
          )
          .run(identity, hashToken(token), user.id, csrf, expires, now());
        return json(
          res,
          200,
          { user: workspace.user, csrf, store: workspace.store },
          {
            "Set-Cookie": `bsru_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${cookieSecure}`,
          },
        );
      });
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const session = await requireAccess(req, res);
      if (!session) return;
      await db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(session.row.token_hash);
      return json(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": `bsru_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure}`,
        },
      );
    }

    return json(res, 405, { error: "Method not allowed" });
  }
  const accountPaths = new Set([
    "/api/session",
    "/api/login",
    "/api/logout",
    "/api/account",
  ]);
  async function route(req, res, url) {
    if (await avatarRoute(req, res, url)) return true;
    if (await signup(req, res, url)) return true;
    if (await recover(req, res, url)) return true;
    if (!accountPaths.has(url.pathname)) return false;
    await accountRoute(req, res, url);
    return true;
  }
  return {
    route,
    requireAccess,
    sessionFor,
    passwordResetAvailable: mail.available,
  };
}
module.exports = { createMembership };
