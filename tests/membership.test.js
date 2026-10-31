"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

async function start(t, available = false) {
  const db = await database();
  const sent = [];
  const app = await require("../src/app")({
    database: db,
    emailDelivery: {
      available,
      async send(to, code) {
        sent.push({ to, code });
      },
    },
  });
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (endpoint, body, headers = {}) => {
    const response = await fetch(base + "/api/" + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Origin: base, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
  return { db, call, sent };
}
const applicant = {
  name: "สมัครสมาชิกทดสอบ",
  type: "นักศึกษา",
  code: "RESTORE-01",
  phone: "0812345678",
  email: "restore@bsru.ac.th",
  password: "RestorePassword123!",
  role: "staff",
  status: "APPROVED",
};
const headers = (login) => ({
  Cookie: login.cookie.split(";")[0],
  "X-CSRF-Token": login.body.csrf,
});

test("signup, login, session, protected workspace and logout work again without mail configuration", async (t) => {
  const { db, call } = await start(t);
  assert.equal((await call("store")).status, 401);
  const registered = await call("registration/request", applicant);
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert.equal((await call("registration/request", applicant)).status, 409);
  const row = await db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(applicant.email);
  assert.equal(row.password_plaintext, applicant.password);
  assert.notEqual(row.password_hash, applicant.password);
  assert.equal(row.role, "user", "signup cannot grant staff permissions");
  assert.equal(
    (await call("login", { identity: applicant.email, password: "wrong" }))
      .status,
    401,
  );
  const login = await call("login", {
    identity: applicant.email,
    password: applicant.password,
  });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  const auth = headers(login);
  const session = await call("session", undefined, auth);
  assert.equal(session.body.user.id, row.id);
  assert.equal(session.body.registrationAvailable, true);
  assert.equal(session.body.passwordResetAvailable, false);
  const store = await call("store", undefined, auth);
  assert.equal(store.status, 200);
  assert.doesNotMatch(
    JSON.stringify([session.body, store.body]),
    /RestorePassword123|password_hash|password_salt|password_plaintext/,
  );
  assert.equal(
    (await call("workshops/delete", { workshopId: "none" }, auth)).status,
    403,
  );
  assert.equal((await call("logout", {}, { Cookie: auth.Cookie })).status, 403);
  assert.equal((await call("logout", {}, auth)).status, 200);
  assert.equal((await call("store", undefined, auth)).status, 401);
});

test("restored email OTP reset updates both password records and revokes sessions", async (t) => {
  const { db, call, sent } = await start(t, true);
  assert.equal((await call("registration/request", applicant)).status, 200);
  const login = await call("login", {
    identity: applicant.email,
    password: applicant.password,
  });
  const requested = await call("otp/request", {
    purpose: "reset",
    channel: "email",
    contact: applicant.email,
    portal: "auto",
  });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.code, undefined);
  assert.equal(sent.length, 1);
  const verified = await call("otp/verify", {
    challengeId: requested.body.challengeId,
    code: sent[0].code,
  });
  assert.equal(verified.status, 200);
  const password = "ReplacementPassword123!";
  const reset = {
    grant: verified.body.grant,
    password,
    confirmation: password,
  };
  assert.equal((await call("password/reset", reset)).status, 200);
  assert.equal((await call("password/reset", reset)).status, 410);
  assert.equal((await call("store", undefined, headers(login))).status, 401);
  assert.equal(
    (await call("login", { identity: applicant.email, password })).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT password_plaintext FROM users WHERE email=?")
        .get(applicant.email)
    ).password_plaintext,
    password,
  );
});

test("restored login throttles repeated failures without issuing a session", async (t) => {
  const { call } = await start(t);
  for (let attempt = 0; attempt < 8; attempt++) {
    const failed = await call("login", {
      identity: "missing@bsru.ac.th",
      password: "WrongPassword123!",
    });
    assert.equal(failed.status, 401);
    assert.equal(failed.cookie, null);
  }
  const limited = await call("login", {
    identity: "missing@bsru.ac.th",
    password: "WrongPassword123!",
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "LOGIN_RATE_LIMITED");
});

test("signup accepts personal, company and university emails while rejecting malformed addresses", async (t) => {
  const { call, db } = await start(t);
  const emails = [
    {
      email: "member+workshop@gmail.com",
      expected: "member+workshop@gmail.com",
    },
    { email: "  Person@Outlook.com  ", expected: "person@outlook.com" },
    { email: "member@company.co.th", expected: "member@company.co.th" },
    { email: "member@bsru.ac.th", expected: "member@bsru.ac.th" },
  ];
  for (const [index, { email, expected }] of emails.entries()) {
    const registered = await call("registration/request", {
      ...applicant,
      email,
      code: `EMAIL-${index}`,
      phone: `081234560${index}`,
    });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));
    assert.equal(registered.body.email, expected);
    assert.equal(
      (
        await call("login", {
          identity: expected,
          password: applicant.password,
        })
      ).status,
      200,
    );
  }
  for (const email of [
    "missing-at.example.com",
    "member@",
    "member@example",
    "member name@example.com",
    "member@@example.com",
    "x".repeat(142) + "@example.com",
  ]) {
    const invalid = await call("registration/request", { ...applicant, email });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.field, "email");
  }
  assert.equal((await db.prepare("SELECT count(*) n FROM users").get()).n, 4);
});
