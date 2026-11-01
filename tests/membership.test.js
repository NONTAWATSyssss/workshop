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

test("complaint trash and staff Clear are independent, expire after 15 days, and purge only after both sides delete", async (t) => {
  const { db, call } = await start(t);
  await call("registration/request", applicant);
  await call("registration/request", {
    ...applicant,
    code: "STAFF-TRASH",
    phone: "0898765432",
    email: "trash-staff@example.test",
  });
  await db
    .prepare("UPDATE users SET role='staff' WHERE email=?")
    .run("trash-staff@example.test");
  const member = headers(
    await call("login", {
      identity: applicant.email,
      password: applicant.password,
    }),
  );
  const staff = headers(
    await call("login", {
      identity: "trash-staff@example.test",
      password: applicant.password,
    }),
  );
  const own = (await call("store", undefined, member)).body.store.users[0];
  const staffId = (await call("session", undefined, staff)).body.user.id;
  const get = async (auth) => (await call("store", undefined, auth)).body.store;
  const initial = await get(staff);
  initial.complaints = ["first", "second", "keep"].map((id) => ({
    id,
    userId: own.id,
    issue: id,
    detail: "ข้อความของผู้เรียน",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    replies: [],
    learnerTrashedAt: null,
    learnerDeletedAt: null,
    staffClearedAt: null,
  }));
  initial.complaints.push({
    ...initial.complaints[0],
    id: "foreign",
    userId: staffId,
  });
  for (const c of initial.complaints)
    await db
      .prepare(
        "INSERT INTO complaints(id,user_id,issue,detail,status,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(c.id, c.userId, c.issue, c.detail, c.status, c.createdAt);
  const reply = {
    id: "reply-first",
    staffId,
    staffName: "Staff",
    text: "คำตอบที่เก็บไว้",
    createdAt: new Date().toISOString(),
  };
  initial.complaints[0].replies.push(reply);
  const firstNotice = {
    id: "notice-first",
    userId: own.id,
    title: "คำตอบคำร้อง",
    body: "ข้อความที่ลบพร้อมข้อมูลกลาง",
    kind: "complaint",
    refId: "first",
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  initial.notifications.push(firstNotice);
  await db
    .prepare(
      "INSERT INTO notifications(id,user_id,title,message,related_type,related_id,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      firstNotice.id,
      own.id,
      firstNotice.title,
      firstNotice.body,
      "complaint",
      "first",
      firstNotice.createdAt,
    );
  await db
    .prepare(
      "INSERT INTO complaint_replies(id,complaint_id,staff_id,message,created_at) VALUES(?,?,?,?,?)",
    )
    .run(reply.id, "first", staffId, reply.text, reply.createdAt);
  await db
    .prepare("UPDATE app_state SET data_json=? WHERE id=1")
    .run(JSON.stringify(initial));
  const action = async (name, data, auth) =>
    call(
      "complaints/" + name,
      { ...data, revision: (await get(auth)).revision },
      auth,
    );
  assert.equal((await call("complaints/trash", { id: "first" })).status, 401);
  assert.equal(
    (await call("complaints/trash", { id: "first" }, { Cookie: member.Cookie }))
      .status,
    403,
  );
  assert.equal((await action("trash", { id: "foreign" }, member)).status, 404);
  assert.equal((await action("clear", { all: true }, member)).status, 403);
  const trash = await action("trash", { id: "first" }, member);
  assert.equal(trash.status, 200, JSON.stringify(trash.body));
  const firstDate = trash.body.store.complaints.find(
    (c) => c.id === "first",
  ).learnerTrashedAt;
  assert.ok(Date.parse(firstDate) > Date.now() - 10000);
  assert.equal(
    (await action("trash", { id: "first" }, member)).body.store.complaints.find(
      (c) => c.id === "first",
    ).learnerTrashedAt,
    firstDate,
    "trashing twice must not extend the deadline",
  );
  assert.ok((await get(staff)).complaints.some((c) => c.id === "first"));
  assert.equal(
    (
      await action("restore", { id: "first" }, member)
    ).body.store.complaints.find((c) => c.id === "first").learnerTrashedAt,
    null,
  );
  const cleared = await action("clear", { ids: ["first"] }, staff);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.changedCount, 1);
  assert.ok(!cleared.body.store.complaints.some((c) => c.id === "first"));
  assert.ok(
    (await get(member)).complaints.find((c) => c.id === "first").replies.length,
  );
  const staffSave = await get(staff);
  await db
    .prepare(
      "INSERT INTO workshops(id,title,start_at,end_at,place,capacity,hours) VALUES('temporary-workshop','ทดสอบข้อมูลที่ล้างแล้ว','2099-01-01T02:00:00Z','2099-01-01T05:00:00Z','Test',10,3)",
    )
    .run();
  const deletedWorkshop = await call(
    "workshops/delete",
    { workshopId: "temporary-workshop", revision: staffSave.revision },
    staff,
  );
  assert.equal(
    deletedWorkshop.status,
    200,
    JSON.stringify(deletedWorkshop.body),
  );
  assert.ok(
    !deletedWorkshop.body.store.complaints.some((c) => c.id === "first"),
    "other workspace responses must not expose staff-cleared complaints",
  );
  Object.assign(staffSave, await get(staff));
  assert.equal(
    (await action("clear", { ids: ["keep", "missing"] }, staff)).status,
    404,
  );
  assert.equal(
    (await get(staff)).complaints.length,
    staffSave.complaints.length,
    "invalid selections must not partially clear records",
  );
  staffSave.revision++;
  assert.equal(
    (await call("store", { store: staffSave }, staff)).status,
    200,
    "unrelated staff saves preserve hidden complaints",
  );
  const forged = await get(member);
  forged.revision++;
  forged.complaints.find((c) => c.id === "keep").learnerDeletedAt =
    new Date().toISOString();
  assert.equal((await call("store", { store: forged }, member)).status, 403);
  await action("trash", { id: "first" }, member);
  const age = async (id, days) => {
    const timestamp = new Date(Date.now() - days * 86400000).toISOString();
    await db
      .prepare("UPDATE complaints SET learner_trashed_at=? WHERE id=?")
      .run(timestamp, id);
    const row = await db
      .prepare("SELECT data_json FROM app_state WHERE id=1")
      .get();
    const snapshot =
      typeof row.data_json === "string"
        ? JSON.parse(row.data_json)
        : row.data_json;
    snapshot.complaints.find((c) => c.id === id).learnerTrashedAt = timestamp;
    await db
      .prepare("UPDATE app_state SET data_json=? WHERE id=1")
      .run(JSON.stringify(snapshot));
  };
  await age("first", 15);
  assert.ok(!(await get(member)).complaints.some((c) => c.id === "first"));
  assert.ok(
    !(await db.prepare("SELECT id FROM complaints WHERE id='first'").get()),
  );
  assert.ok(
    !(await db
      .prepare("SELECT id FROM complaint_replies WHERE complaint_id='first'")
      .get()),
  );
  await action("trash", { id: "second" }, member);
  assert.ok(
    !(await db
      .prepare("SELECT id FROM notifications WHERE related_id='first'")
      .get()),
  );
  await age("second", 14);
  assert.equal((await action("restore", { id: "second" }, member)).status, 200);
  await action("trash", { id: "second" }, member);
  await age("second", 15);
  const beforeExpire = await get(member);
  assert.ok(!beforeExpire.complaints.some((c) => c.id === "second"));
  beforeExpire.revision++;
  assert.equal(
    (await call("store", { store: beforeExpire }, member)).status,
    200,
    "saving other member data must preserve expired staff records",
  );
  assert.ok((await get(staff)).complaints.some((c) => c.id === "second"));
  assert.equal((await action("restore", { id: "second" }, member)).status, 410);
  const stale = await get(staff);
  const all = await action("clear", { all: true }, staff);
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal(all.body.store.complaints.length, 0);
  assert.ok((await get(member)).complaints.some((c) => c.id === "keep"));
  assert.ok(
    !(await db.prepare("SELECT id FROM complaints WHERE id='second'").get()),
  );
  stale.revision++;
  assert.equal((await call("store", { store: stale }, staff)).status, 409);
  assert.equal((await call("maintenance/complaints")).status, 401);
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only-complaint-maintenance-secret";
  try {
    assert.equal(
      (
        await call("maintenance/complaints", undefined, {
          Authorization: "Bearer wrong-secret",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("maintenance/complaints", undefined, {
          Authorization: "Bearer test-only-complaint-maintenance-secret",
        })
      ).status,
      200,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test("notification reads use the first server timestamp and history clear only deletes the owner's aged reads", async (t) => {
  const { db, call } = await start(t);
  await call("registration/request", applicant);
  assert.equal(
    (
      await call("registration/request", {
        ...applicant,
        code: "OTHER",
        phone: "0898765432",
        email: "other@example.test",
      })
    ).status,
    200,
  );
  const login = await call("login", {
    identity: applicant.email,
    password: applicant.password,
  });
  const auth = headers(login);
  const before = (await call("store", undefined, auth)).body.store;
  const owner = before.users[0].id;
  const other = (
    await db
      .prepare("SELECT id FROM users WHERE email=?")
      .get("other@example.test")
  ).id;
  const timestamp = Date.now();
  const stamp = (hours) => new Date(timestamp - hours * 3600000).toISOString();
  const rows = [
    { id: "unread-old", userId: owner, readAt: null },
    { id: "never-read", userId: owner, readAt: null },
    { id: "history", userId: owner, readAt: stamp(73) },
    { id: "recent", userId: owner, readAt: stamp(71) },
    { id: "foreign", userId: other, readAt: stamp(100) },
  ].map((row) => ({
    ...row,
    title: row.id,
    body: "private message",
    kind: "account",
    refId: "",
    createdAt: stamp(200),
  }));
  for (const row of rows)
    await db
      .prepare(
        "INSERT INTO notifications(id,user_id,title,message,related_type,related_id,read_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        row.id,
        row.userId,
        row.title,
        row.body,
        row.kind,
        row.refId,
        row.readAt,
        row.createdAt,
      );
  const stateRow = await db
    .prepare("SELECT data_json FROM app_state WHERE id=1")
    .get();
  const snapshot =
    typeof stateRow.data_json === "string"
      ? JSON.parse(stateRow.data_json)
      : stateRow.data_json;
  snapshot.notifications = rows;
  await db
    .prepare("UPDATE app_state SET data_json=? WHERE id=1")
    .run(JSON.stringify(snapshot));

  assert.equal(
    (await call("notifications/read", { id: "unread-old" })).status,
    401,
  );
  assert.equal(
    (
      await call(
        "notifications/read",
        { id: "unread-old" },
        { Cookie: auth.Cookie },
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("notifications/read", { id: "foreign" }, auth)).status,
    404,
  );
  const read = await call(
    "notifications/read",
    { id: "unread-old", readAt: stamp(100) },
    auth,
  );
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const firstRead = read.body.store.notifications.find(
    (row) => row.id === "unread-old",
  ).readAt;
  assert.ok(
    Date.parse(firstRead) >= timestamp,
    "a client cannot backdate a first read",
  );
  const repeated = await call("notifications/read", { id: "unread-old" }, auth);
  assert.equal(
    repeated.body.store.notifications.find((row) => row.id === "unread-old")
      .readAt,
    firstRead,
  );
  assert.equal(
    repeated.body.store.revision,
    read.body.store.revision,
    "reopening must not create a new read",
  );

  const forged = structuredClone(repeated.body.store);
  forged.notifications.find((row) => row.id === "recent").readAt = stamp(100);
  forged.revision++;
  assert.equal((await call("store", { store: forged }, auth)).status, 403);
  assert.equal(
    (await call("notifications/clear-history", {}, { Cookie: auth.Cookie }))
      .status,
    403,
  );
  const cleared = await call("notifications/clear-history", {}, auth);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.deletedCount, 1);
  assert.deepEqual(
    cleared.body.store.notifications.map((row) => row.id).sort(),
    ["never-read", "recent", "unread-old"],
  );
  assert.deepEqual(
    (await db.prepare("SELECT id FROM notifications ORDER BY id").all()).map(
      (row) => row.id,
    ),
    ["foreign", "never-read", "recent", "unread-old"],
  );
  assert.deepEqual(
    (await call("store", undefined, auth)).body.store.notifications
      .map((row) => row.id)
      .sort(),
    ["never-read", "recent", "unread-old"],
  );
  const stale = structuredClone(repeated.body.store);
  stale.revision++;
  assert.equal(
    (await call("store", { store: stale }, auth)).status,
    409,
    "a stale client cannot resurrect cleared history",
  );
  const empty = await call("notifications/clear-history", {}, auth);
  assert.equal(empty.body.deletedCount, 0);
  assert.equal(empty.body.store.revision, cleared.body.store.revision);
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

test("database role changes refresh the workspace snapshot without requiring a new session", async (t) => {
  const { db, call } = await start(t);
  assert.equal((await call("registration/request", applicant)).status, 200);
  const login = await call("login", {
    identity: applicant.email,
    password: applicant.password,
  });
  const auth = headers(login);
  const before = (await call("store", undefined, auth)).body.store;
  const id = before.users[0].id;
  assert.equal(before.users[0].role, "user");
  assert.equal(
    (await call("store", undefined, auth)).body.store.revision,
    before.revision,
    "unchanged profiles must not advance the snapshot revision",
  );
  await db.prepare("UPDATE users SET role='staff' WHERE id=?").run(id);
  assert.equal(
    (await call("session", undefined, auth)).body.user.role,
    "staff",
  );
  const staleSave = await call(
    "store",
    { store: { ...before, revision: before.revision + 1 } },
    auth,
  );
  assert.equal(
    staleSave.status,
    409,
    "a stale client must reload after an external profile change",
  );
  const promoted = (await call("store", undefined, auth)).body.store;
  assert.equal(promoted.users.find((user) => user.id === id).role, "staff");
  assert.ok(promoted.revision > before.revision);
  const saved = await call(
    "store",
    { store: { ...promoted, revision: promoted.revision + 1 } },
    auth,
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    (await db.prepare("SELECT role FROM users WHERE id=?").get(id)).role,
    "staff",
  );
  await db.prepare("UPDATE users SET role='user' WHERE id=?").run(id);
  const demoted = (await call("store", undefined, auth)).body.store;
  assert.equal(demoted.users.find((user) => user.id === id).role, "user");
  assert.ok(demoted.revision > saved.body.revision);
  assert.equal(
    (await call("workshops/delete", { workshopId: "none" }, auth)).status,
    403,
  );
  assert.doesNotMatch(
    JSON.stringify(demoted),
    /password_hash|password_salt|password_plaintext/,
  );
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
