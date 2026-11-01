"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function screen({
  failOnce = false,
  workshops,
  request,
  simulateFocus = false,
  hash = "#manage",
  objectUrls = null,
  clock = null,
} = {}) {
  const { window, document } = parseHTML(
    fs.readFileSync("public/index.html", "utf8"),
  );
  window.scrollTo = () => {};
  window.location = { hash, hostname: "example.test" };
  let focused = document.body;
  if (simulateFocus)
    Object.defineProperty(document, "activeElement", { get: () => focused });
  window.HTMLElement.prototype.focus = function () {
    if (!simulateFocus || focused === this) return;
    focused = this;
    this.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  };
  const calls = [];
  const intervals = [];
  let failed = false;
  const context = vm.createContext({
    window,
    document,
    console,
    Headers,
    URL: objectUrls
      ? class extends URL {
          static createObjectURL(file) {
            const value = `blob:preview-${objectUrls.length}`;
            objectUrls.push({ action: "create", value, name: file.name });
            return value;
          }
          static revokeObjectURL(value) {
            objectUrls.push({ action: "revoke", value });
          }
        }
      : URL,
    URLSearchParams,
    Date: clock
      ? class extends Date {
          constructor(...args) {
            super(...(args.length ? args : [clock.now]));
          }
          static now() {
            return clock.now;
          }
        }
      : Date,
    Blob,
    FormData: class {
      constructor(form) {
        this.rows = [...form.querySelectorAll("input,select,textarea")]
          .filter((field) => field.name)
          .map((field) => [
            field.name,
            field.value ||
              field.querySelector?.("option[selected]")?.value ||
              "",
          ]);
      }
      [Symbol.iterator]() {
        return this.rows[Symbol.iterator]();
      }
    },
    crypto: require("node:crypto").webcrypto,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (callback) => intervals.push(callback),
    clearInterval() {},
    fetch: async (endpoint, options = {}) => {
      calls.push(endpoint);
      const custom = await request?.(endpoint, options);
      if (custom) return custom;
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({
            user: null,
            registrationAvailable: true,
            passwordResetAvailable: false,
          }),
        };
      if (endpoint !== "/api/workshops")
        throw Error("Unexpected private endpoint: " + endpoint);
      if (failOnce && !failed) {
        failed = true;
        throw Error("Offline");
      }
      return {
        ok: true,
        json: async () => ({
          workshops: workshops || [
            {
              id: "w1",
              title: "กิจกรรมสาธารณะ",
              description: "รายละเอียดที่เปิดอ่านได้",
              start: "2099-11-01T09:00",
              end: "2099-11-01T12:00",
              place: "ห้องประชุม",
              capacity: 30,
              hours: 3,
              closed: false,
              occupancy: 4,
              cover: "",
            },
          ],
        }),
      };
    },
  });
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (!cache.has(filename))
      cache.set(
        filename,
        new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), {
          context,
          identifier: filename,
        }),
      );
    return cache.get(filename);
  }
  const main = load("public/assets/js/app.js");
  await main.link((specifier, parent) =>
    load(path.resolve(path.dirname(parent.identifier), specifier)),
  );
  await main.evaluate();
  await new Promise((resolve) => setImmediate(resolve));
  return {
    window,
    document,
    calls,
    poll: async () => {
      for (const callback of intervals) await callback();
    },
  };
}

async function notificationScreen({
  failRead = false,
  failClear = false,
  deferRead = null,
  hash = "#dashboard",
} = {}) {
  const clock = { now: Date.parse("2026-11-01T12:00:00Z") };
  const account = {
    id: "person",
    name: "Member",
    role: "user",
    status: "APPROVED",
    email: "member@example.test",
    type: "นักศึกษา",
    code: "MEMBER",
  };
  const at = (hours) => new Date(clock.now - hours * 3600000).toISOString();
  const store = {
    users: [account],
    workshops: [],
    registrations: [],
    complaints: [],
    ratings: [],
    auditLog: [],
    revision: 1,
    notifications: [
      {
        id: "history",
        userId: account.id,
        title: "ข้อความในประวัติ",
        body: "รายละเอียดเก่า",
        kind: "account",
        refId: "",
        createdAt: at(200),
        readAt: at(72),
      },
      {
        id: "unread",
        userId: account.id,
        title: "ข้อความใหม่ <img src=x onerror=alert(1)>",
        body: "รายละเอียดข้อความใหม่",
        kind: "registration",
        refId: "",
        createdAt: at(100),
        readAt: null,
      },
      {
        id: "recent",
        userId: account.id,
        title: "ข้อความทั่วไปที่อ่านแล้ว",
        body: "รายละเอียดที่อ่านแล้ว",
        kind: "account",
        refId: "",
        createdAt: at(1),
        readAt: at(1),
      },
    ],
  };
  const saved = [];
  const ui = await screen({
    hash,
    clock,
    simulateFocus: true,
    request: async (endpoint, options) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "test-csrf" }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({ store: structuredClone(store) }),
        };
      if (endpoint.startsWith("/api/notifications/")) {
        saved.push({
          endpoint,
          data: JSON.parse(options.body),
          csrf: options.headers.get("X-CSRF-Token"),
        });
        if (endpoint.endsWith("/read")) {
          await deferRead?.();
          if (failRead)
            return {
              ok: false,
              status: 503,
              json: async () => ({ error: "อ่านไม่สำเร็จ" }),
            };
          const item = store.notifications.find(
            (n) => n.id === JSON.parse(options.body).id,
          );
          if (!item.readAt) {
            item.readAt = new Date(clock.now).toISOString();
            store.revision++;
          }
        } else {
          if (failClear)
            return {
              ok: false,
              status: 503,
              json: async () => ({ error: "ลบไม่สำเร็จ" }),
            };
          store.notifications = store.notifications.filter(
            (n) => !n.readAt || Date.parse(n.readAt) > clock.now - 72 * 3600000,
          );
          store.revision++;
        }
        return {
          ok: true,
          json: async () => ({
            store: structuredClone(store),
            deletedCount: 1,
          }),
        };
      }
    },
  });
  const click = (action, id) => {
    const item = [
      ...ui.document.querySelectorAll(`[data-action="${action}"]`),
    ].find((n) => id === undefined || n.dataset.id === id);
    assert.ok(item, `missing ${action}:${id || ""}`);
    item.focus();
    item.dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { ...ui, clock, store, saved, click, settle };
}

test("notification bell opens compact current/detail/history views without leaving the page", async () => {
  const ui = await notificationScreen();
  const { document, click, settle } = ui;
  assert.ok(!document.querySelector('.side-nav [data-id="notifications"]'));
  assert.equal(document.querySelector(".notification-count")?.textContent, "1");
  click("notification-open");
  assert.equal(ui.window.location.hash, "#dashboard");
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    2,
  );
  assert.equal(
    document.querySelector(
      '#notification-center [data-action="notification-read"]',
    ).dataset.id,
    "recent",
  );
  assert.ok(
    !document.querySelector('#notification-center [data-id="history"]'),
  );
  assert.ok(
    !document.querySelector("#notification-center img"),
    "message markup is escaped",
  );
  assert.equal(
    ui.saved.length,
    0,
    "opening the list must not mark messages read",
  );
  click("notification-read", "unread");
  await settle();
  assert.ok(document.querySelector(".notification-detail"));
  assert.match(
    document.querySelector("#notification-center").textContent,
    /รายละเอียดข้อความใหม่/,
  );
  assert.ok(!document.querySelector(".notification-count"));
  assert.equal(ui.saved[0].csrf, "test-csrf");
  click("notification-back");
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    2,
  );
  click("notification-history");
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    1,
  );
  click("notification-read", "history");
  await settle();
  assert.match(
    document.querySelector(".notification-detail").textContent,
    /รายละเอียดเก่า/,
  );
  click("notification-back");
  assert.equal(
    document.querySelector("#notification-center").dataset.view,
    "history",
  );
  click("close");
  assert.equal(document.activeElement?.dataset.action, "notification-open");
});

test("notification history clear confirms and preserves current messages; search and categories stay usable", async () => {
  const ui = await notificationScreen();
  const { document, click, settle } = ui;
  click("notification-open");
  click("notification-filter", "activity");
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    1,
  );
  click("notification-filter", "all");
  const search = document.querySelector("#notification-search");
  search.value = "ไม่พบข้อความ";
  search.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  assert.match(
    document.querySelector("#notification-center").textContent,
    /ไม่พบรายการ/,
  );
  click("clear-notification-search");
  click("notification-history");
  click("notification-clear");
  assert.ok(document.querySelector("#confirm-root .confirm-dialog"));
  click("answer-no");
  await settle();
  assert.equal(ui.saved.length, 0);
  click("notification-clear");
  click("answer-yes");
  await settle();
  assert.ok(
    !document.querySelector(
      '#notification-center [data-action="notification-read"]',
    ),
  );
  assert.equal(ui.store.notifications.length, 2);
  click("notification-current");
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    2,
  );
  assert.equal(document.querySelector(".notification-count").textContent, "1");
  click("close");
  click("notification-open");
  click("notification-history");
  assert.ok(
    !document.querySelector(
      '#notification-center [data-action="notification-read"]',
    ),
  );
});

test("notifications age from first reading after exactly 72 hours and polling refreshes an open list", async () => {
  const ui = await notificationScreen();
  const { document, click } = ui;
  click("notification-open");
  ui.clock.now += 71 * 3600000;
  await ui.poll();
  assert.equal(
    document.querySelectorAll(
      '#notification-center [data-action="notification-read"]',
    ).length,
    1,
    "recent read enters history at exactly 72 hours",
  );
  assert.ok(
    document.querySelector('#notification-center [data-id="unread"]'),
    "unread messages do not expire",
  );
  ui.store.notifications.push({
    id: "live",
    userId: "person",
    title: "แจ้งเตือนล่าสุด",
    body: "new",
    kind: "account",
    refId: "",
    createdAt: new Date(ui.clock.now).toISOString(),
    readAt: null,
  });
  ui.store.revision++;
  await ui.poll();
  assert.equal(document.querySelector(".notification-count").textContent, "2");
  assert.equal(
    document.querySelector(
      '#notification-center [data-action="notification-read"]',
    ).dataset.id,
    "live",
  );
});

test("notification save errors keep unread badges and history; closing during a read cannot reopen the modal", async () => {
  const failed = await notificationScreen({ failRead: true, failClear: true });
  failed.click("notification-open");
  failed.click("notification-read", "unread");
  await failed.settle();
  assert.equal(
    failed.document.querySelector(".notification-count").textContent,
    "1",
  );
  assert.ok(failed.document.querySelector(".notification-detail"));
  assert.match(
    failed.document.querySelector(".notification-detail-label").textContent,
    /ยังไม่ได้บันทึก/,
  );
  failed.click("notification-back");
  failed.click("notification-history");
  failed.click("notification-clear");
  failed.click("answer-yes");
  await failed.settle();
  assert.ok(
    failed.document.querySelector('#notification-center [data-id="history"]'),
  );
  assert.match(
    failed.document.querySelector("#toast-root").textContent,
    /ลบไม่สำเร็จ/,
  );
  let release;
  const pending = await notificationScreen({
    deferRead: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  pending.click("notification-open");
  pending.click("notification-read", "unread");
  await pending.settle();
  pending.click("close");
  release();
  await pending.settle();
  assert.ok(!pending.document.querySelector("#modal-root .dialog"));
});

test("notification details open before a slow read completes and late responses do not change the selected message", async () => {
  let release;
  const ui = await notificationScreen({
    deferRead: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  ui.click("notification-open");
  ui.click("notification-read", "unread");
  assert.ok(
    ui.document.querySelector(".notification-detail"),
    "the already loaded message must open without waiting for the network",
  );
  assert.match(
    ui.document.querySelector(".notification-detail").textContent,
    /รายละเอียดข้อความใหม่/,
  );
  assert.equal(
    ui.document.querySelector(".notification-count").textContent,
    "1",
    "reading is confirmed only after the server saves it",
  );
  await ui.settle();
  ui.click("notification-back");
  ui.click("notification-read", "unread");
  await ui.settle();
  assert.equal(
    ui.saved.length,
    1,
    "opening the same pending message must not duplicate read requests",
  );
  ui.click("notification-back");
  ui.click("notification-read", "recent");
  const detail = ui.document.querySelector(".notification-detail");
  assert.match(detail.textContent, /รายละเอียดที่อ่านแล้ว/);
  assert.equal(
    ui.saved.length,
    1,
    "already read messages do not need another write request",
  );
  release();
  await ui.settle();
  assert.ok(
    ui.document.querySelector(".notification-detail") === detail,
    "a late read response must not replace the new selection",
  );
  assert.ok(ui.document.activeElement === detail);
  assert.ok(!ui.document.querySelector(".notification-count"));
  ui.click("notification-back");
  ui.click("notification-read", "unread");
  assert.match(
    ui.document.querySelector(".notification-detail-label").textContent,
    /อ่านแล้ว/,
  );
  assert.equal(ui.saved.length, 1);
});

test("legacy notifications links open the center over the dashboard", async () => {
  const ui = await notificationScreen({ hash: "#notifications" });
  assert.ok(ui.document.querySelector("#notification-center"));
  assert.ok(
    ui.document.querySelector('.side-nav [data-id="dashboard"].active'),
  );
});

test("notification polling keeps an open detail and its keyboard focus stable", async () => {
  const ui = await notificationScreen();
  ui.click("notification-open");
  ui.click("notification-read", "unread");
  await ui.settle();
  const detail = ui.document.querySelector(".notification-detail");
  assert.equal(ui.document.activeElement, detail);
  await ui.poll();
  assert.ok(ui.document.querySelector(".notification-detail") === detail);
  assert.ok(ui.document.activeElement === detail);
  const escape = new ui.window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(escape, "key", { value: "Escape" });
  detail.dispatchEvent(escape);
  assert.ok(!ui.document.querySelector("#notification-center"));
  assert.equal(ui.document.activeElement?.dataset.action, "notification-open");
});

test("public homepage opens login and signup modals without exposing a staff deep link", async () => {
  const { window, document, calls } = await screen();
  assert.match(document.querySelector("#app").textContent, /กิจกรรมสาธารณะ/);
  assert.equal(document.querySelector("#login-form"), null);
  assert.equal(document.querySelector('[data-action="enroll"]'), null);
  assert.equal(document.querySelector('[data-action="edit-workshop"]'), null);
  assert.match(document.querySelector("#app").textContent, /ประชาสัมพันธ์/);
  assert.equal(document.querySelector('[data-action="register"]'), null);
  document
    .querySelector('[data-action="login"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelector("#modal-root #login-form"));
  document
    .querySelector('[data-action="register"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelector("#modal-root #register-form"));
  document
    .querySelector('[data-action="close"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  document
    .querySelector('[data-action="workshop-detail"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.match(
    document.querySelector("#modal-root").textContent,
    /รายละเอียดที่เปิดอ่านได้/,
  );
  assert.ok(calls.includes("/api/session"));
  assert.ok(calls.includes("/api/workshops"));
});

test("authenticated refresh does not wait for or download the public catalog and page navigation uses loaded data", async () => {
  const account = {
    id: "fast-user",
    name: "Fast member",
    role: "user",
    status: "APPROVED",
    email: "fast@example.test",
    code: "FAST",
    type: "นักศึกษา",
  };
  const ui = await screen({
    hash: "#reports",
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "fast-csrf" }),
        };
      if (endpoint === "/api/workshops") return new Promise(() => {});
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops: [],
              registrations: [],
              complaints: [],
              ratings: [],
              notifications: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
    },
  });
  assert.ok(
    ui.document.querySelector(".sidebar"),
    "a public catalog delay must not block the authenticated workspace",
  );
  assert.ok(
    !ui.calls.includes("/api/workshops"),
    "private reload already obtains workshops in its filtered workspace response",
  );
  const requests = ui.calls.length;
  ui.document
    .querySelector('.side-nav [data-id="my-complaints"]')
    .dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  assert.ok(ui.document.querySelector(".record-inbox"));
  assert.equal(
    ui.calls.length,
    requests,
    "changing pages must not trigger another API load",
  );
});

test("public page can retry a failed catalog request and shows an honest empty state", async () => {
  const { window, document, calls } = await screen({
    failOnce: true,
    workshops: [],
  });
  assert.ok(document.querySelector('[data-action="retry-bootstrap"]'));
  document
    .querySelector('[data-action="retry-bootstrap"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(document.querySelector("#app").textContent, /ไม่พบเวิร์กช็อป/);
  assert.equal(document.querySelector("#login-form"), null);
  assert.equal(
    calls.filter((endpoint) => endpoint === "/api/workshops").length,
    2,
  );
});

test("login promotional carousel has three slides and preserves form input and errors while changing images", async () => {
  const ui = await screen({
    simulateFocus: true,
    request: async (endpoint) =>
      endpoint === "/api/login"
        ? {
            ok: false,
            status: 401,
            json: async () => ({ error: "บัญชีหรือรหัสผ่านไม่ถูกต้อง" }),
          }
        : undefined,
  });
  const click = (selector) => {
    const control = ui.document.querySelector(selector);
    assert.ok(control, selector);
    control.focus();
    control.dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  };
  click('[data-action="login"]');
  assert.equal(ui.document.querySelectorAll(".login-promo-slide").length, 3);
  assert.equal(
    ui.document.querySelectorAll(".login-promo-slide:not([hidden])").length,
    1,
  );
  const form = ui.document.querySelector("#login-form");
  form.querySelector('[name="identity"]').value = "member@example.test";
  form.querySelector('[name="password"]').value = "TestPassword123!";
  form.dispatchEvent(
    new ui.window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  click('[data-action="auth-toggle-password"]');
  click('[data-action="auth-promo"][data-id="next"]');
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "1",
  );
  assert.ok(ui.document.querySelector("#login-form") === form);
  assert.equal(
    form.querySelector('[name="identity"]').value,
    "member@example.test",
  );
  assert.equal(
    form.querySelector('[name="password"]').value,
    "TestPassword123!",
  );
  assert.equal(form.querySelector('[name="password"]').type, "text");
  assert.match(
    form.querySelector(".error").textContent,
    /บัญชีหรือรหัสผ่านไม่ถูกต้อง/,
  );
  click('[data-action="auth-promo"][data-id="2"]');
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "2",
  );
  assert.equal(
    ui.document
      .querySelector('[data-action="auth-promo"][data-id="2"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  click('[data-action="auth-promo"][data-id="next"]');
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "0",
  );
  click('[data-action="auth-promo"][data-id="prev"]');
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "2",
  );
  const arrow = new ui.window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(arrow, "key", { value: "ArrowLeft" });
  ui.document
    .querySelector('[data-action="auth-promo"][data-id="prev"]')
    .dispatchEvent(arrow);
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "1",
  );
  click('[data-action="register"]');
  assert.ok(ui.document.querySelector("#register-form"));
  assert.ok(!ui.document.querySelector(".login-layout"));
  click('[data-action="login"]');
  assert.equal(
    ui.document.querySelector(".login-promo-slide:not([hidden])").dataset.slide,
    "0",
  );
  click('[data-action="forgot"]');
  assert.ok(!ui.document.querySelector(".login-layout"));
});

test("password eye controls switch icons and accessible labels while keeping each password field independent", async () => {
  const ui = await screen();
  const click = (selector) => {
    const button = ui.document.querySelector(selector);
    assert.ok(button);
    button.dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  };
  click('[data-action="login"]');
  const button = ui.document.querySelector(
    '[data-action="auth-toggle-password"]',
  );
  const password = ui.document.querySelector("#password");
  password.value = "ExamplePassword123!";
  assert.ok(button.querySelector(".fa-eye"));
  assert.equal(button.getAttribute("aria-label"), "แสดงรหัสผ่าน");
  click('[data-action="auth-toggle-password"]');
  assert.equal(password.type, "text");
  assert.ok(button.querySelector(".fa-eye-slash"));
  assert.equal(button.getAttribute("aria-label"), "ซ่อนรหัสผ่าน");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  click('[data-action="auth-toggle-password"]');
  assert.equal(password.type, "password");
  assert.ok(button.querySelector(".fa-eye"));
  assert.equal(password.value, "ExamplePassword123!");
  click('[data-action="register"]');
  click('[data-action="auth-toggle-password"][data-id="confirmation"]');
  assert.equal(ui.document.querySelector("#confirmation").type, "text");
  assert.equal(ui.document.querySelector("#password").type, "password");
});

test("public home replaces the guest workshop page with illustrated news and a latest open workshop carousel", async () => {
  const make = (id, createdAt, extra = {}) => ({
    id,
    title: "กิจกรรม " + id,
    description: "รายละเอียดกิจกรรม",
    cover: "/assets/images/image-003.jpg",
    start: "2099-12-01T09:00",
    end: "2099-12-01T12:00",
    place: "ห้องอบรม",
    capacity: 30,
    hours: 3,
    occupancy: 2,
    closed: false,
    createdAt,
    ...extra,
  });
  const workshops = [
    make("old", "2026-01-01T00:00:00Z"),
    make("closed", "2026-11-01T00:00:00Z", { closed: true }),
    make("newest", "2026-10-30T00:00:00Z"),
    make("full", "2026-10-31T00:00:00Z", { occupancy: 30 }),
    make("expired", "2026-10-31T00:00:00Z", {
      start: "2020-01-01T09:00",
      end: "2020-01-01T12:00",
    }),
    make("started", "2026-10-31T00:00:00Z", {
      start: "2026-11-01T09:00:00Z",
      end: "2026-11-01T15:00:00Z",
    }),
    make("middle", "2026-10-15T00:00:00Z"),
    make("fourth", "2026-09-01T00:00:00Z"),
    make("fifth", "2026-08-01T00:00:00Z"),
  ];
  const ui = await screen({
    workshops,
    hash: "#workshops",
    clock: { now: Date.parse("2026-11-01T12:00:00Z") },
  });
  assert.ok(ui.document.querySelector(".public-home"));
  assert.ok(!ui.document.querySelector('.public-nav [data-id="workshops"]'));
  assert.ok(
    !ui.document.querySelector(
      '.public-home [data-action="public-page"][data-id="workshops"]',
    ),
  );
  assert.deepEqual(
    [...ui.document.querySelectorAll(".public-workshop-card")].map(
      (c) => c.dataset.workshopId,
    ),
    ["newest", "middle", "fourth", "fifth", "old"],
  );
  assert.equal(ui.document.querySelectorAll(".public-news-card img").length, 3);
  assert.ok(
    [...ui.document.querySelectorAll(".public-news-card img")].every((img) =>
      img.getAttribute("alt"),
    ),
    "announcement photos need accessible descriptions",
  );
  let scrolled = false;
  ui.document.querySelector("#public-workshops").scrollIntoView = () => {
    scrolled = true;
  };
  ui.document
    .querySelector('[data-action="public-section"]')
    .dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  assert.equal(scrolled, true);
  ui.document
    .querySelector('.public-news-card [data-action="announcement"]')
    .dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  assert.ok(ui.document.querySelector(".public-announcement-modal img"));
  assert.equal(
    ui.document
      .querySelector(".public-announcement-modal img")
      .getAttribute("src"),
    "/assets/images/image-005.jpg",
  );
  assert.ok(
    ui.document.querySelector(".public-announcement-detail").textContent.trim()
      .length > 0,
  );
});

test("public workshop carousel supports controls, keyboard and boundaries without navigating to another page", async () => {
  const ui = await screen();
  const track = ui.document.querySelector("#public-workshop-track");
  assert.ok(track);
  Object.defineProperties(track, {
    scrollWidth: { value: 1200 },
    clientWidth: { value: 400 },
    scrollLeft: { value: 0, writable: true },
  });
  ui.document.querySelector(".public-workshop-card").getBoundingClientRect =
    () => ({ width: 300 });
  let movement;
  track.scrollBy = (value) => {
    movement = value;
    track.scrollLeft += value.left;
    track.dispatchEvent(new ui.window.Event("scroll", { bubbles: true }));
  };
  ui.window.dispatchEvent(new ui.window.Event("resize"));
  assert.equal(
    ui.document.querySelector('[data-action="public-carousel"][data-id="prev"]')
      .disabled,
    true,
  );
  ui.document
    .querySelector('[data-action="public-carousel"][data-id="next"]')
    .dispatchEvent(new ui.window.Event("click", { bubbles: true }));
  assert.equal(movement.left, 320);
  assert.equal(
    ui.document.querySelector('[data-action="public-carousel"][data-id="prev"]')
      .disabled,
    false,
  );
  const arrow = new ui.window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(arrow, "key", { value: "ArrowLeft" });
  track.dispatchEvent(arrow);
  assert.equal(movement.left, -320);
  track.scrollLeft = 800;
  track.dispatchEvent(new ui.window.Event("scroll", { bubbles: true }));
  assert.equal(
    ui.document.querySelector('[data-action="public-carousel"][data-id="next"]')
      .disabled,
    true,
  );
});

test("login modal opens the member workspace and logout clears private data", async () => {
  const account = {
    id: "person",
    name: "Member",
    role: "user",
    status: "APPROVED",
    email: "member@bsru.ac.th",
    type: "นักศึกษา",
    code: "MEMBER",
  };
  const { window, document } = await screen({
    request: async (endpoint) => {
      if (endpoint === "/api/login")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "test-csrf" }),
        };
      if (endpoint === "/api/logout")
        return { ok: true, json: async () => ({ ok: true }) };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops: [],
              registrations: [],
              complaints: [],
              notifications: [],
              ratings: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
    },
  });
  document
    .querySelector('[data-action="login"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  const form = document.querySelector("#login-form");
  form.querySelector('[name="identity"]').value = account.email;
  form.querySelector('[name="password"]').value = "TestPassword123!";
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(document.querySelector("#login-form"), null);
  assert.ok(document.querySelector(".sidebar"));
  assert.match(document.querySelector("#app").textContent, /Member/);
  document
    .querySelector('[data-action="toggle-account-menu"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(document.querySelector("#account-dropdown").hidden, false);
  document
    .querySelector('#account-dropdown [data-action="logout"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(document.querySelector(".sidebar"), null);
  assert.doesNotMatch(document.querySelector("#app").textContent, /Member/);
  assert.ok(document.querySelector('[data-action="login"]'));
});

test("signup keeps invalid input and returns to login after server acknowledgement", async () => {
  let rejected = true;
  const { window, document } = await screen({
    request: async (endpoint) => {
      if (endpoint === "/api/registration/request")
        return rejected
          ? {
              ok: false,
              status: 409,
              json: async () => ({
                error: "อีเมลนี้มีบัญชีแล้ว",
                field: "email",
              }),
            }
          : {
              ok: true,
              json: async () => ({ registered: true, email: "new@gmail.com" }),
            };
    },
  });
  document
    .querySelector('[data-action="login"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  document
    .querySelector('[data-action="register"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  const form = document.querySelector("#register-form");
  for (const [name, value] of Object.entries({
    name: "Test Member",
    code: "TEST",
    email: "new@gmail.com",
    phone: "0812345678",
    password: "TestPassword123!",
    confirmation: "TestPassword123!",
  }))
    form.querySelector(`[name="${name}"]`).value = value;
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(form.querySelector('[name="email"]').value, "new@gmail.com");
  assert.match(form.querySelector(".error").textContent, /มีบัญชีแล้ว/);
  rejected = false;
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(document.querySelector("#register-form"), null);
  assert.equal(
    document.querySelector('#login-form [name="identity"]').value,
    "new@gmail.com",
  );
  assert.match(
    document.querySelector("#modal-root").textContent,
    /สมัครสมาชิกสำเร็จ/,
  );
  const escape = new window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(escape, "key", { value: "Escape" });
  document.querySelector("#login-form").dispatchEvent(escape);
  assert.equal(document.querySelector("#modal-root .dialog"), null);
  assert.equal(document.body.style.overflow, "");
});

test("restored staff session can open member approvals from the existing workspace", async () => {
  const account = {
    id: "staff",
    name: "Staff",
    role: "staff",
    status: "APPROVED",
    email: "staff@bsru.ac.th",
  };
  const { window, document } = await screen({
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({
            user: account,
            csrf: "staff-csrf",
            registrationAvailable: true,
            passwordResetAvailable: false,
          }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [
                account,
                {
                  id: "pending",
                  name: "Pending Member",
                  role: "user",
                  status: "WAITING",
                  code: "PENDING",
                  email: "pending@bsru.ac.th",
                },
              ],
              workshops: [],
              registrations: [],
              complaints: [],
              notifications: [],
              ratings: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
    },
  });
  document
    .querySelector('[data-action="page"][data-id="approvals"]')
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.match(document.querySelector("#app").textContent, /Pending Member/);
  assert.ok(document.querySelector('[data-action="approve"]'));
});

test("polling updates the account badge and workspace when database permissions change", async () => {
  let role = "user",
    revision = 1;
  const account = {
    id: "role-person",
    name: "Role Member",
    role,
    status: "APPROVED",
    email: "role@example.test",
  };
  const ui = await screen({
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "role-csrf" }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [
                { ...account, role },
                ...(role === "staff"
                  ? [
                      {
                        id: "other-person",
                        name: "Other Member",
                        role: "user",
                        status: "APPROVED",
                      },
                    ]
                  : []),
              ],
              workshops: [],
              registrations: [],
              complaints: [],
              notifications: [],
              ratings: [],
              auditLog: [],
              revision,
            },
          }),
        };
    },
  });
  assert.equal(
    ui.document.querySelector(".role-pill").textContent.trim(),
    "ผู้เรียน",
  );
  role = "staff";
  revision++;
  await ui.poll();
  assert.equal(
    ui.document.querySelector(".role-pill").textContent.trim(),
    "เจ้าหน้าที่",
  );
  assert.ok(
    ui.document.querySelector(
      '.sidebar [data-action="page"][data-id="manage"]',
    ),
  );
  role = "user";
  revision++;
  await ui.poll();
  assert.equal(
    ui.document.querySelector(".role-pill").textContent.trim(),
    "ผู้เรียน",
  );
  assert.ok(
    !ui.document.querySelector(
      '.sidebar [data-action="page"][data-id="manage"]',
    ),
  );
});

for (const [role, label] of [
  ["user", "ผู้เรียน"],
  ["staff", "เจ้าหน้าที่"],
]) {
  test(`${role}: account profile opens dropdown with its role after the name and supports keyboard dismissal`, async () => {
    const account = {
      id: "profile-person",
      name: "Profile Member",
      email: "profile@example.com",
      role,
      status: "APPROVED",
    };
    const { window, document } = await screen({
      request: async (endpoint) => {
        if (endpoint === "/api/session")
          return {
            ok: true,
            json: async () => ({
              user: account,
              csrf: "profile-csrf",
              registrationAvailable: true,
            }),
          };
        if (endpoint === "/api/store")
          return {
            ok: true,
            json: async () => ({
              store: {
                users: [account],
                workshops: [],
                registrations: [],
                complaints: [],
                notifications: [],
                ratings: [],
                auditLog: [],
                revision: 0,
              },
            }),
          };
      },
    });
    const trigger = document.querySelector(
      '[data-action="toggle-account-menu"]',
    );
    const dropdown = document.querySelector("#account-dropdown");
    assert.ok(
      !document.querySelector(".header-actions > .role-pill"),
      "role belongs inside the dropdown",
    );
    assert.ok(
      !trigger.querySelector(".fa-chevron-down"),
      "profile trigger has no trailing arrow",
    );
    assert.equal(dropdown.hidden, true);
    trigger
      .querySelector(".header-avatar")
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(dropdown.hidden, false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const heading = dropdown.querySelector(".account-dropdown-heading");
    assert.equal(heading.querySelector("strong").textContent, account.name);
    assert.equal(
      heading.querySelector("strong").nextElementSibling.textContent.trim(),
      label,
    );
    const escape = new window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(escape, "key", { value: "Escape" });
    dropdown.querySelector("button").dispatchEvent(escape);
    assert.equal(dropdown.hidden, true);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    trigger.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector("#main-content")
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(dropdown.hidden, true);
  });
}

async function myActivitiesScreen() {
  const account = {
    id: "range-member",
    name: "Range Member",
    email: "range@example.test",
    role: "user",
    status: "APPROVED",
  };
  const workshops = [
    "2027-01-05",
    "2027-01-15",
    "2027-01-25",
    "2027-02-05",
  ].map((date, index) => ({
    id: `range-${index}`,
    title: `กิจกรรม ${date}`,
    start: `${date}T09:00`,
    end: `${date}T12:00`,
    place: "ห้องประชุม",
    capacity: 30,
    hours: 3,
    closed: false,
  }));
  const ui = await screen({
    simulateFocus: true,
    workshops,
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "range-csrf" }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops,
              registrations: workshops.map((workshop, index) => ({
                id: `registration-${index}`,
                workshopId: workshop.id,
                userId: account.id,
                status: ["PENDING", "ATTENDED", "ABSENT", "CANCELLED"][index],
              })),
              complaints: [],
              notifications: [],
              ratings: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
    },
  });
  ui.click = (selector) => {
    const element = ui.document.querySelector(selector);
    assert.ok(element, `Missing control: ${selector}`);
    element.dispatchEvent(
      new ui.window.Event("click", { bubbles: true, cancelable: true }),
    );
  };
  ui.change = (selector, value) => {
    const element = ui.document.querySelector(selector);
    assert.ok(element, `Missing field: ${selector}`);
    if (element.hasAttribute("data-date-period")) {
      if (element.getAttribute("aria-expanded") !== "true") ui.click(selector);
      return ui.click(
        `[data-date-option="${element.dataset.datePeriod}"][data-period-value="${value}"]`,
      );
    }
    if (element.tagName === "SELECT") {
      element.querySelector(`option[value="${value}"]`).selected = true;
    } else element.value = value;
    element.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  };
  ui.cards = () =>
    [...ui.document.querySelectorAll(".card .activity-title")].map(
      (el) => el.textContent,
    );
  ui.click('[data-action="page"][data-id="mine"]');
  return ui;
}

test("my activities filters participation from a dropdown beside search and retains the activity phase filter", async () => {
  const ui = await myActivitiesScreen();
  assert.ok(ui.document.querySelector(".toolbar #mine-status"));
  assert.ok(ui.document.querySelector(".toolbar #phase-filter"));
  assert.ok(!ui.document.querySelector('[data-action="mine-status"]'));
  assert.equal(ui.cards().length, 4);
  for (const [status, dates] of [
    ["upcoming", ["2027-01-05"]],
    ["finished", ["2027-01-15", "2027-01-25"]],
    ["cancelled", ["2027-02-05"]],
  ]) {
    ui.change("#mine-status", status);
    assert.deepEqual(
      ui.cards(),
      dates.map((date) => `กิจกรรม ${date}`),
    );
  }
  ui.change("#mine-status", "all");
  ui.change("#phase-filter", "closed");
  assert.equal(ui.cards().length, 0);
  ui.change("#phase-filter", "all");
  assert.equal(ui.cards().length, 4);
  ui.change("#mine-status", "finished");
  const search = ui.document.querySelector("#search");
  search.value = "2027-01-25";
  search.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  assert.deepEqual(ui.cards(), ["กิจกรรม 2027-01-25"]);
});

test("single date range calendar applies inclusive dates, combines filters, and clears only dates", async () => {
  const ui = await myActivitiesScreen();
  assert.ok(
    !ui.document.querySelector(".toolbar #date-from, .toolbar #date-to"),
  );
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-01");
  // A fresh selection starts with the later date and normalizes a backwards range.
  ui.click('[data-date="2027-01-25"]');
  ui.click('[data-date="2027-01-05"]');
  assert.equal(ui.cards().length, 4, "draft dates are applied together");
  ui.click('[data-date-action="apply"]');
  assert.deepEqual(
    ui.cards(),
    ["2027-01-05", "2027-01-15", "2027-01-25"].map((date) => `กิจกรรม ${date}`),
  );
  assert.match(
    ui.document.querySelector("#date-range-trigger").textContent,
    /2570/,
  );
  ui.change("#mine-status", "finished");
  assert.equal(ui.cards().length, 2);
  ui.click("#date-range-trigger");
  ui.click('[data-date-action="clear"]');
  assert.equal(
    ui.cards().length,
    2,
    "clearing dates preserves participation status",
  );
  ui.change("#mine-status", "all");
  assert.equal(ui.cards().length, 4);
});

test("date range supports cross-month and one-sided ranges; Escape and outside clicks discard drafts", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-01");
  ui.click('[data-date="2027-01-25"]');
  ui.click('[data-date-action="next"]');
  ui.click('[data-date="2027-02-05"]');
  ui.click('[data-date-action="apply"]');
  assert.equal(ui.cards().length, 2);
  ui.click("#date-range-trigger");
  ui.change("#range-start", "");
  ui.change("#range-end", "2027-01-15");
  ui.click('[data-date-action="apply"]');
  assert.equal(ui.cards().length, 2, "end-only range includes its final day");
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-02-05");
  ui.change("#range-end", "");
  const escape = new ui.window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(escape, "key", { value: "Escape" });
  ui.document.querySelector("#range-start").dispatchEvent(escape);
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
  assert.equal(ui.cards().length, 2, "Escape discards unapplied edits");
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-02-05");
  ui.change("#range-end", "");
  ui.click('[data-date-action="apply"]');
  assert.equal(ui.cards().length, 1, "start-only range is supported");
  ui.click("#date-range-trigger");
  ui.click("#main-content h1");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
});

test("calendar arrow and page keys move the active day across months without applying a draft", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-31");
  for (const [key, date] of [
    ["ArrowRight", "2027-02-01"],
    ["End", "2027-02-06"],
    ["PageUp", "2027-01-06"],
    ["ArrowDown", "2027-01-13"],
    ["Home", "2027-01-10"],
  ]) {
    const event = new ui.window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "key", { value: key });
    ui.document.querySelector('[data-date][tabindex="0"]').dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(
      ui.document.querySelector('[data-date][tabindex="0"]').dataset.date,
      date,
    );
  }
  assert.equal(ui.cards().length, 4);
});

test("calendar shows the selected range and its close button discards unapplied changes", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-01");
  ui.click('[data-date="2027-01-05"]');
  assert.match(
    ui.document.querySelector(".date-range-hint").textContent,
    /เลือกวันสิ้นสุด/,
  );
  ui.click('[data-date="2027-01-15"]');
  assert.match(
    ui.document.querySelector(".date-range-hint").textContent,
    /ใช้ช่วงวันที่/,
  );
  assert.ok(
    ui.document
      .querySelector('[data-date="2027-01-05"]')
      .closest(".range-start"),
  );
  assert.ok(
    ui.document.querySelector('[data-date="2027-01-10"]').closest(".in-range"),
  );
  assert.ok(
    ui.document.querySelector('[data-date="2027-01-15"]').closest(".range-end"),
  );
  ui.click('[data-date-action="close"]');
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
  assert.equal(ui.cards().length, 4);
  ui.click("#date-range-trigger");
  assert.equal(ui.document.querySelector("#range-start").value, "");
  assert.equal(ui.document.querySelector("#range-end").value, "");
});

test("calendar uses an explicit disclosure button; clicking its month heading keeps dates and focus inside the page", async () => {
  const ui = await myActivitiesScreen();
  const trigger = ui.document.querySelector("#date-range-trigger");
  assert.equal(trigger.tagName, "BUTTON");
  assert.equal(trigger.getAttribute("type"), "button");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
  const originalHash = ui.window.location.hash;
  ui.click("#date-range-trigger");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
  ui.change("#range-start", "2027-01-01");
  ui.click('[data-date="2027-01-05"]');
  ui.click(".date-range-month");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(ui.document.querySelector("#range-start").value, "2027-01-05");
  assert.equal(ui.window.location.hash, originalHash);
  assert.equal(ui.cards().length, 4);
  ui.click('[data-date="2027-01-15"]');
  ui.click('[data-date-action="apply"]');
  assert.equal(ui.cards().length, 2);
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
  assert.equal(ui.document.activeElement.id, "date-range-trigger");
  ui.click("#date-range-trigger");
  ui.document.querySelector("#search").focus();
  assert.equal(
    ui.document.querySelector("#date-range-panel").hidden,
    false,
    "a focus change alone must not dismiss the calendar",
  );
  ui.click("#search");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
  assert.equal(
    ui.document
      .querySelector("#date-range-trigger")
      .getAttribute("aria-expanded"),
    "false",
  );
});

test("month and Buddhist year dropdowns stay open, retain focus and preserve the pending date range", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-01");
  ui.click('[data-date="2027-01-25"]');
  const monthSelect = ui.document.querySelector("#range-month");
  const yearSelect = ui.document.querySelector("#range-year");
  assert.ok(monthSelect);
  assert.ok(yearSelect);
  assert.equal(
    ui.document.querySelector(
      '[data-date-option="year"][data-period-value="2028"] .date-period-option-label',
    ).textContent,
    "2571",
  );
  // A focus change alone must not dismiss the calendar.
  ui.document.body.focus();
  ui.click("#range-month");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
  ui.click("#range-month");
  yearSelect.focus();
  ui.change("#range-year", "2028");
  assert.equal(ui.document.activeElement, yearSelect);
  monthSelect.focus();
  ui.change("#range-month", "1");
  assert.equal(ui.document.activeElement, monthSelect);
  assert.ok(
    ui.document.querySelector("#range-month") === monthSelect,
    "changing the period must keep its trigger mounted",
  );
  assert.ok(ui.document.querySelector('[data-date="2028-02-29"]'));
  assert.equal(ui.document.querySelector("#range-start").value, "2027-01-25");
  assert.equal(ui.cards().length, 4);
  ui.change("#range-year", "2027");
  assert.ok(!ui.document.querySelector('[data-date="2027-02-29"]'));
  ui.click('[data-date="2027-02-05"]');
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
  ui.click('[data-date-action="apply"]');
  assert.deepEqual(ui.cards(), ["กิจกรรม 2027-01-25", "กิจกรรม 2027-02-05"]);
});

test("month navigation keeps dropdown values synchronized across year boundaries", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-12-01");
  ui.click('[data-date-action="next"]');
  assert.equal(ui.document.querySelector("#range-month").value, "0");
  assert.equal(ui.document.querySelector("#range-year").value, "2028");
  ui.click('[data-date-action="previous"]');
  assert.equal(ui.document.querySelector("#range-month").value, "11");
  assert.equal(ui.document.querySelector("#range-year").value, "2027");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
});

test("staff management reuses the user date range picker, resets pagination and filters deletion dates", async () => {
  const account = {
    id: "calendar-staff",
    name: "Calendar Staff",
    email: "calendar@example.test",
    role: "staff",
    status: "APPROVED",
  };
  const workshops = Array.from({ length: 24 }, (_, index) => ({
    id: `staff-date-${index}`,
    title: `Workshop ${index + 1}`,
    place: "Room",
    capacity: 30,
    hours: 3,
    closed: false,
    start: `2027-01-${String(index + 1).padStart(2, "0")}T09:00`,
    end: `2027-01-${String(index + 1).padStart(2, "0")}T12:00`,
  }));
  const { window, document } = await screen({
    workshops,
    simulateFocus: true,
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "staff-calendar-csrf" }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops,
              registrations: [],
              complaints: [],
              notifications: [],
              ratings: [],
              revision: 0,
              auditLog: ["2027-02-05", "2027-03-05"].map((day, index) => ({
                id: `delete-${index}`,
                action: "delete",
                entity: "workshops",
                entityId: `deleted-${index}`,
                createdAt: `${day}T04:00:00Z`,
                actorName: "Staff",
                workshop: {
                  title: `Deleted ${day}`,
                  place: "Room",
                  capacity: 30,
                  hours: 3,
                },
              })),
            },
          }),
        };
    },
  });
  const click = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing control: ${selector}`);
    element.dispatchEvent(
      new window.Event("click", { bubbles: true, cancelable: true }),
    );
  };
  const range = (from, to) => {
    click("#date-range-trigger");
    assert.ok(document.querySelector("#range-month"));
    assert.ok(document.querySelector("#range-year"));
    for (const [id, value] of [
      ["range-start", from],
      ["range-end", to],
    ]) {
      const field = document.querySelector(`#${id}`);
      field.value = value;
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
    click('[data-date-action="apply"]');
  };
  assert.ok(!document.querySelector("#date-from, #date-to"));
  click('[data-action="manage-page"][data-id="2"]');
  range("2027-01-01", "2027-01-15");
  assert.equal(
    document.querySelector('.manage-pagination [aria-current="page"]')
      .textContent,
    "1",
  );
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 10);
  assert.match(
    document.querySelector(".manage-result-count").textContent,
    /15/,
  );
  click("#date-range-trigger");
  click('[data-date-action="clear"]');
  assert.match(
    document.querySelector(".manage-result-count").textContent,
    /24/,
  );
  click('[data-action="manage-view"][data-id="deleted"]');
  range("2027-02-01", "2027-02-28");
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 1);
  assert.match(
    document.querySelector(".manage-deleted-row").textContent,
    /Deleted 2027-02-05/,
  );
  click("#date-range-trigger");
  click('[data-date-action="clear"]');
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 2);
});

test("calendar period menus scroll to their selection, open one at a time and dismiss before the calendar", async () => {
  const ui = await myActivitiesScreen();
  ui.click("#date-range-trigger");
  ui.change("#range-start", "2027-01-01");
  ui.click("#range-year");
  const years = ui.document.querySelector("#range-year-options");
  assert.equal(years.hidden, false);
  assert.equal(years.getAttribute("role"), "listbox");
  assert.ok(years.querySelectorAll('[role="option"]').length > 100);
  assert.equal(ui.document.activeElement.getAttribute("aria-selected"), "true");
  ui.click("#range-month");
  assert.equal(years.hidden, true);
  assert.equal(ui.document.querySelector("#range-month-options").hidden, false);
  const key = (value) => {
    const event = new ui.window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "key", { value });
    ui.document.activeElement.dispatchEvent(event);
  };
  key("ArrowDown");
  assert.equal(ui.document.activeElement.dataset.periodValue, "1");
  // Activate February as a real button click (Enter/Space use the native button behavior).
  ui.click('[data-date-option="month"][data-period-value="1"]');
  assert.equal(ui.document.querySelector("#range-month").value, "1");
  assert.equal(ui.document.querySelector("#range-month-options").hidden, true);
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
  ui.click("#range-year");
  key("End");
  assert.ok(ui.document.activeElement === years.lastElementChild);
  key("Home");
  assert.ok(ui.document.activeElement === years.firstElementChild);
  const firstYear = Number(ui.document.activeElement.dataset.periodValue);
  key("PageDown");
  assert.equal(
    Number(ui.document.activeElement.dataset.periodValue),
    firstYear + 5,
  );
  key("Escape");
  assert.equal(years.hidden, true);
  assert.equal(ui.document.activeElement.id, "range-year");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, false);
  key("Escape");
  assert.equal(ui.document.querySelector("#date-range-panel").hidden, true);
});

async function complaintsScreen(hash = "#complaints") {
  const account = {
    id: "inbox-staff",
    name: "Inbox Staff",
    role: "staff",
    status: "APPROVED",
    email: "inbox@example.test",
  };
  const complaints = [
    {
      id: "ticket-1",
      userId: "member-1",
      issue: 'ยกเลิกอบรมไม่ได้ <img src=x onerror="alert(1)">',
      name: "Member One",
      code: "670001",
      contact: "one@example.test",
      detail: 'รายละเอียด <img src=x onerror="alert(1)">',
      status: "OPEN",
      createdAt: "2026-11-01T02:00:00Z",
      replies: [
        {
          staffName: "Staff Before",
          text: "คำตอบเดิมของเจ้าหน้าที่",
          createdAt: "2026-11-01T03:00:00Z",
        },
      ],
    },
    {
      id: "ticket-2",
      userId: "member-2",
      issue: "สอบถามชั่วโมงอบรม",
      name: "Member Two",
      code: "670002",
      contact: "two@example.test",
      detail: "รายละเอียดคำร้องที่สอง",
      status: "CLOSED",
      createdAt: "2026-10-30T02:00:00Z",
      replies: [],
    },
  ];
  const ui = await screen({
    hash,
    simulateFocus: true,
    request: async (endpoint) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "inbox-csrf" }),
        };
      if (endpoint === "/api/store")
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops: [],
              registrations: [],
              complaints,
              notifications: [],
              ratings: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
    },
  });
  ui.click = (selector) => {
    const element = ui.document.querySelector(selector);
    assert.ok(element, `Missing control: ${selector}`);
    element.dispatchEvent(
      new ui.window.Event("click", { bubbles: true, cancelable: true }),
    );
  };
  return ui;
}

async function recordsScreen(role = "user", options = {}) {
  const clock = { now: Date.parse("2026-11-01T12:00:00Z") };
  const account = {
    id: "records-person",
    role,
    status: "APPROVED",
    name: "Record User",
    email: "records@example.test",
    code: "REC",
    type: "นักศึกษา",
  };
  const workshops = Array.from({ length: 23 }, (_, i) => ({
    id: "rw" + i,
    title: `เวิร์กช็อป ${String(i + 1).padStart(2, "0")}`,
    description: "รายละเอียดกิจกรรมที่เลือก",
    start: `${i === 22 ? 2025 : 2026}-10-${String(i + 1).padStart(2, "0")}T09:00`,
    end: `${i === 22 ? 2025 : 2026}-10-${String(i + 1).padStart(2, "0")}T12:00`,
    place: "ห้องทดสอบ",
    capacity: 30,
    hours: 3,
    closed: false,
    cover: "",
  }));
  const statuses = ["ATTENDED", "PENDING", "ABSENT", "CANCELLED"];
  const store = {
    users: [account],
    workshops,
    registrations: workshops.map((w, i) => ({
      id: "rr" + i,
      userId: account.id,
      workshopId: w.id,
      status: statuses[i % 4],
      updatedAt: w.end,
      ratingEvent: "rr" + i,
    })),
    ratings: [],
    notifications: [],
    auditLog: [],
    revision: 1,
    complaints: Array.from({ length: 13 }, (_, i) => ({
      id: "rc" + i,
      userId: account.id,
      issue: `คำร้อง ${String(i + 1).padStart(2, "0")}`,
      name: "Record User",
      code: "REC",
      contact: account.email,
      detail: "เนื้อหาที่ซ่อนไว้จนกดเปิด",
      status: ["OPEN", "REPLIED", "CLOSED"][i % 3],
      createdAt: new Date(clock.now - i * 3600000).toISOString(),
      learnerTrashedAt:
        i === 12 ? new Date(clock.now - 86400000).toISOString() : null,
      learnerDeletedAt: null,
      staffClearedAt: null,
      replies: [
        {
          id: "reply" + i,
          staffId: "staff",
          staffName: "เจ้าหน้าที่ทดสอบ",
          text: "คำตอบเฉพาะคำร้อง " + (i + 1),
          createdAt: new Date(clock.now - i * 3600000 + 60000).toISOString(),
        },
      ],
    })),
  };
  const actions = [];
  const ui = await screen({
    hash: role === "staff" ? "#complaints" : options.page || "#reports",
    simulateFocus: true,
    clock,
    request: async (endpoint, req) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "records-csrf" }),
        };
      if (endpoint === "/api/store") {
        if (req.method === "POST")
          Object.assign(store, JSON.parse(req.body).store);
        return {
          ok: true,
          json: async () => ({ store: structuredClone(store) }),
        };
      }
      if (endpoint.startsWith("/api/complaints/")) {
        const data = JSON.parse(req.body);
        actions.push({ endpoint, data, csrf: req.headers.get("X-CSRF-Token") });
        if (options.failClear)
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: "ยังบันทึกไม่ได้" }),
          };
        if (endpoint.endsWith("/clear"))
          store.complaints = store.complaints.filter(
            (c) => !data.all && !data.ids.includes(c.id),
          );
        else
          store.complaints.find((c) => c.id === data.id).learnerTrashedAt =
            endpoint.endsWith("/restore")
              ? null
              : new Date(clock.now).toISOString();
        store.revision++;
        return {
          ok: true,
          json: async () => ({ store: structuredClone(store) }),
        };
      }
    },
  });
  ui.click = (selector) => {
    const element = ui.document.querySelector(selector);
    assert.ok(element, `Missing control ${selector}`);
    element.focus();
    element.dispatchEvent(
      new ui.window.Event("click", { bubbles: true, cancelable: true }),
    );
  };
  ui.change = (selector, value) => {
    const element = ui.document.querySelector(selector);
    assert.ok(element, `Missing field ${selector}`);
    if (element.type === "checkbox") element.checked = value;
    else {
      Object.defineProperty(element, "value", {
        value,
        writable: true,
        configurable: true,
      });
    }
    element.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  };
  ui.search = (selector, value) => {
    const field = ui.document.querySelector(selector);
    assert.ok(field);
    field.value = value;
    field.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  };
  return {
    ...ui,
    store,
    actions,
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

test("reports use compact paginated rows, preserve global totals through filters and open immediate details", async () => {
  const ui = await recordsScreen();
  assert.equal(ui.document.querySelectorAll(".report-record-row").length, 10);
  assert.match(ui.document.querySelector(".record-summary").textContent, /18/);
  assert.ok(!ui.document.querySelector(".page-stage .notice"));
  ui.click('[data-action="record-page"][data-id="2"]');
  assert.equal(ui.document.querySelectorAll(".report-record-row").length, 10);
  ui.search("#report-search", "เวิร์กช็อป 01");
  assert.equal(ui.document.querySelectorAll(".report-record-row").length, 1);
  assert.match(ui.document.querySelector(".record-summary").textContent, /18/);
  ui.click('[data-action="report-detail"][data-id="rr0"]');
  assert.match(
    ui.document.querySelector(".record-dialog").textContent,
    /รายละเอียดกิจกรรมที่เลือก/,
  );
  assert.match(
    ui.document.querySelector(".record-dialog").textContent,
    /ห้องทดสอบ/,
  );
  assert.ok(ui.document.querySelector('[data-action="rate-open"]'));
  ui.click('#modal-root [data-action="close"]');
  ui.search("#report-search", "");
  ui.change("#report-year", "2025");
  assert.equal(ui.document.querySelectorAll(".report-record-row").length, 1);
  ui.change("#report-status", "ATTENDED");
  assert.equal(ui.document.querySelectorAll(".report-record-row").length, 0);
  assert.ok(ui.document.querySelector(".record-empty"));
});

test("member complaint inbox hides threads, opens details and supports trash and restore without clearing staff data", async () => {
  const ui = await recordsScreen("user", { page: "#my-complaints" });
  assert.equal(
    ui.document.querySelectorAll(".member-complaint-row").length,
    10,
  );
  assert.ok(!ui.document.querySelector(".page-stage .thread-reply"));
  ui.click('[data-action="member-complaint-open"][data-id="rc0"]');
  assert.match(
    ui.document.querySelector(".record-dialog").textContent,
    /คำตอบเฉพาะคำร้อง 1/,
  );
  ui.click('#modal-root [data-action="close"]');
  ui.click('[data-action="complaint-trash"][data-id="rc0"]');
  await ui.settle();
  assert.equal(ui.actions[0].csrf, "records-csrf");
  assert.ok(
    !ui.document.querySelector('.member-complaint-row [data-id="rc0"]'),
  );
  ui.click('[data-action="complaint-view"][data-id="trash"]');
  assert.equal(ui.document.querySelectorAll(".member-complaint-row").length, 2);
  assert.match(
    ui.document.querySelector(".record-inbox").textContent,
    /15 วัน|กู้คืน/,
  );
  ui.click('[data-action="complaint-restore"][data-id="rc0"]');
  await ui.settle();
  assert.equal(ui.document.querySelectorAll(".member-complaint-row").length, 1);
  ui.click('[data-action="complaint-view"][data-id="inbox"]');
  ui.search("#complaint-search", "คำร้อง 01");
  assert.equal(ui.document.querySelectorAll(".member-complaint-row").length, 1);
  ui.change("#complaint-status", "CLOSED");
  assert.equal(ui.document.querySelectorAll(".member-complaint-row").length, 0);
});

test("participant attendance uses a single status menu, preserves confirmation and locks finalized or cancelled rows", async () => {
  const ui = await recordsScreen("staff");
  ui.click('.side-nav [data-id="participants"]');
  assert.equal(
    ui.document.querySelectorAll(".participants-table th").length,
    4,
  );
  assert.ok(
    !ui.document.querySelector(
      '.participants-table [data-action="attend"],.participants-table [data-action="absent"]',
    ),
  );
  ui.click('[data-action="attendance-menu"][data-id="rr1"]');
  assert.equal(ui.document.querySelectorAll('[role="menu"]').length, 1);
  assert.equal(
    ui.document.querySelectorAll(
      '#workshop-actions-menu [role="menuitemradio"]',
    ).length,
    2,
  );
  ui.click('[data-action="attendance-menu"][data-id="rr0"]');
  assert.equal(
    ui.document
      .querySelector('[data-id="rr1"][data-action="attendance-menu"]')
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    ui.document
      .querySelector('#workshop-actions-menu [data-action="attend"]')
      .getAttribute("aria-checked"),
    "true",
  );
  assert.equal(
    ui.document.querySelector('#workshop-actions-menu [data-action="attend"]')
      .disabled,
    true,
  );
  const escape = new ui.window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(escape, "key", { value: "Escape" });
  ui.document
    .querySelector("#workshop-actions-menu button:not([disabled])")
    .dispatchEvent(escape);
  assert.ok(!ui.document.querySelector("#workshop-actions-menu"));
  assert.equal(ui.document.activeElement?.dataset.id, "rr0");
  ui.click('[data-action="attendance-menu"][data-id="rr1"]');
  ui.click('#workshop-actions-menu [data-action="attend"]');
  assert.ok(ui.document.querySelector('[data-action="confirmed-attend"]'));
  assert.equal(
    ui.store.registrations.find((r) => r.id === "rr1").status,
    "PENDING",
  );
  ui.click('#modal-root [data-action="close"]');
  ui.click('[data-action="attendance-menu"][data-id="rr1"]');
  ui.click('#workshop-actions-menu [data-action="attend"]');
  ui.click('[data-action="confirmed-attend"]');
  await ui.settle();
  assert.equal(
    ui.store.registrations.find((r) => r.id === "rr1").status,
    "ATTENDED",
  );
  assert.match(
    ui.document.querySelector('[data-action="attendance-menu"][data-id="rr1"]')
      .textContent,
    /เข้าร่วม/,
  );
  assert.ok(
    !ui.document.querySelector(
      '[data-action="attendance-menu"][data-id="rr3"]',
    ),
  );
  ui.store.workshops.find((w) => w.id === "rw0").attendanceFinalizedAt =
    new Date().toISOString();
  ui.store.revision++;
  ui.document.body.focus();
  await ui.poll();
  assert.ok(
    !ui.document.querySelector(
      '[data-action="attendance-menu"][data-id="rr0"]',
    ),
  );
});

test("staff can select a page, cancel Clear and clear selected or all records with counts and error recovery", async () => {
  const options = { failClear: true };
  const ui = await recordsScreen("staff", options);
  assert.ok(!ui.document.querySelector('.record-inbox input[type="checkbox"]'));
  ui.click('[data-action="complaint-clear-selected"]');
  assert.ok(!ui.document.querySelector("#confirm-root .confirm-dialog"));
  ui.click('[data-action="complaint-select-page"]');
  assert.equal(
    ui.document.querySelectorAll('.complaint-row[aria-pressed="true"]').length,
    10,
  );
  ui.click('[data-action="complaint-clear-selected"]');
  assert.match(ui.document.querySelector("#confirm-message").textContent, /10/);
  ui.click('[data-action="answer-no"]');
  await ui.settle();
  assert.equal(ui.actions.length, 0);
  ui.click('[data-action="complaint-clear-selected"]');
  ui.click('[data-action="answer-yes"]');
  await ui.settle();
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 10);
  assert.match(
    ui.document.querySelector("#toast-root").textContent,
    /ยังบันทึกไม่ได้/,
  );
  options.failClear = false;
  ui.click('[data-action="complaint-clear-selected"]');
  ui.click('[data-action="answer-yes"]');
  await ui.settle();
  assert.equal(ui.actions.at(-1).data.ids.length, 10);
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 3);
  ui.search("#complaint-search", "ไม่มีคำร้องที่ตรงกัน");
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 0);
  ui.click('[data-action="complaint-clear-all"]');
  assert.match(ui.document.querySelector("#confirm-message").textContent, /3/);
  ui.click('[data-action="answer-yes"]');
  await ui.settle();
  assert.equal(ui.actions.at(-1).data.all, true);
  assert.ok(ui.document.querySelector(".record-empty"));
});

test("staff selects dimmed complaint rows after entering Clear mode and can toggle or cancel without opening details", async () => {
  const ui = await recordsScreen("staff");
  ui.click('[data-action="complaint-clear-selected"]');
  assert.ok(!ui.document.querySelector('input[type="checkbox"]'));
  ui.click('[data-action="complaint-toggle-selection"][data-id="rc0"]');
  assert.ok(!ui.document.querySelector(".complaint-detail"));
  assert.equal(
    ui.document
      .querySelector(
        '[data-action="complaint-toggle-selection"][data-id="rc0"]',
      )
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    ui.document.querySelectorAll(
      ".record-staff-row.is-selected .record-selection-mark",
    ).length,
    1,
  );
  ui.click('[data-action="complaint-toggle-selection"][data-id="rc0"]');
  assert.equal(
    ui.document.querySelectorAll(".record-selection-mark").length,
    0,
  );
  assert.equal(
    ui.document.querySelector('[data-action="complaint-clear-selected"]')
      .disabled,
    true,
  );
  ui.click('[data-action="complaint-toggle-selection"][data-id="rc1"]');
  ui.click('[data-action="record-page"][data-id="2"]');
  ui.click('[data-action="complaint-toggle-selection"][data-id="rc10"]');
  ui.click('[data-action="complaint-clear-selected"]');
  assert.match(
    ui.document.querySelector("#confirm-message").textContent,
    /2 รายการ/,
  );
  ui.click('[data-action="answer-no"]');
  await ui.settle();
  ui.click('[data-action="complaint-selection-cancel"]');
  assert.equal(
    ui.document.querySelectorAll(".record-selection-mark").length,
    0,
  );
  assert.ok(
    !ui.document.querySelector('[data-action="complaint-toggle-selection"]'),
  );
  assert.equal(ui.actions.length, 0);
  ui.click('[data-action="complaint-open"][data-id="rc10"]');
  assert.ok(ui.document.querySelector(".complaint-detail"));
});

test("complaints inbox shows compact rows and opens one escaped thread with reply and back navigation", async () => {
  const ui = await complaintsScreen();
  ui.window.history = {
    pushState: (_state, _title, hash) => {
      ui.window.location.hash = hash;
    },
  };
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 2);
  assert.ok(
    !ui.document.querySelector(".thread-original, .thread-reply, #reply-form"),
  );
  assert.doesNotMatch(
    ui.document.querySelector(".page-stage").textContent,
    /รายละเอียดคำร้องที่สอง|คำตอบเดิมของเจ้าหน้าที่/,
  );
  ui.click('[data-action="complaint-open"][data-id="ticket-1"]');
  assert.equal(ui.window.location.hash, "#complaints?id=ticket-1");
  assert.match(
    ui.document.querySelector(".complaint-detail").textContent,
    /รายละเอียด <img/,
  );
  assert.match(
    ui.document.querySelector(".complaint-detail").textContent,
    /คำตอบเดิมของเจ้าหน้าที่/,
  );
  assert.ok(!ui.document.querySelector(".complaint-detail img"));
  assert.doesNotMatch(
    ui.document.querySelector(".complaint-detail").textContent,
    /รายละเอียดคำร้องที่สอง/,
  );
  ui.click('[data-action="reply-open"]');
  assert.ok(ui.document.querySelector('#reply-form[data-id="ticket-1"]'));
  ui.click('#modal-root [data-action="close"]');
  ui.click('[data-action="complaints-back"]');
  assert.equal(ui.window.location.hash, "#complaints");
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 2);
  assert.ok(!ui.document.querySelector(".thread-original"));
  ui.window.location.hash = "#complaints?id=ticket-1";
  ui.window.dispatchEvent(new ui.window.Event("popstate"));
  assert.ok(ui.document.querySelector(".complaint-detail"));
  ui.click('.sidebar [data-action="page"][data-id="complaints"]');
  assert.equal(ui.document.querySelectorAll(".complaint-row").length, 2);
});

test("complaint detail links restore on refresh and missing requests return safely to the inbox", async () => {
  const detail = await complaintsScreen("#complaints?id=ticket-2");
  assert.match(
    detail.document.querySelector(".complaint-detail").textContent,
    /รายละเอียดคำร้องที่สอง/,
  );
  const missing = await complaintsScreen("#complaints?id=missing");
  assert.match(
    missing.document.querySelector(".page-stage").textContent,
    /ไม่พบคำร้อง/,
  );
  missing.click('[data-action="complaints-back"]');
  assert.equal(missing.document.querySelectorAll(".complaint-row").length, 2);
});

test("workshop editor groups fields and saves an independent date range with start and end times", async () => {
  const objectUrls = [];
  const account = {
    id: "editor-staff",
    name: "Editor Staff",
    role: "staff",
    status: "APPROVED",
    email: "editor@example.test",
  };
  const initial = {
    id: "existing-editor",
    title: "Existing",
    place: "Room",
    capacity: 30,
    hours: 3,
    start: "2027-01-10T09:00",
    end: "2027-01-10T12:00",
    closed: false,
    cover: "/assets/images/bsru-workshop-logo.png",
  };
  let saved;
  const { window, document } = await screen({
    objectUrls,
    simulateFocus: true,
    workshops: [initial],
    request: async (endpoint, options) => {
      if (endpoint === "/api/session")
        return {
          ok: true,
          json: async () => ({ user: account, csrf: "editor-csrf" }),
        };
      if (endpoint === "/api/store") {
        if (options.method === "POST") {
          saved = JSON.parse(options.body).store;
          return {
            ok: true,
            json: async () => ({ store: saved, revision: saved.revision }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            store: {
              users: [account],
              workshops: [initial],
              registrations: [],
              complaints: [],
              notifications: [],
              ratings: [],
              auditLog: [],
              revision: 0,
            },
          }),
        };
      }
    },
  });
  const click = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing control: ${selector}`);
    element.dispatchEvent(
      new window.Event("click", { bubbles: true, cancelable: true }),
    );
  };
  const change = (selector, value) => {
    const field = document.querySelector(selector);
    assert.ok(field, `Missing field: ${selector}`);
    field.value = value;
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  click("#date-range-trigger");
  change("#range-start", "2027-01-01");
  change("#range-end", "2027-01-31");
  click('#date-range-panel [data-date-action="apply"]');
  const filterText = document.querySelector("#date-range-trigger").textContent;
  click('[data-action="add-workshop"]');
  const form = document.querySelector("#workshop-form");
  assert.ok(form.children[0].querySelector('[name="title"]'));
  assert.ok(form.children[1].querySelector('[name="place"]'));
  assert.ok(form.querySelector('.workshop-numbers-row [name="capacity"]'));
  assert.ok(form.querySelector('.workshop-numbers-row [name="hours"]'));
  assert.ok(
    form.querySelector(".workshop-media-row #editor-date-range-trigger"),
  );
  assert.ok(form.querySelector('.workshop-media-row [name="cover"]'));
  const cover = form.querySelector('[name="cover"]');
  Object.defineProperty(cover, "files", {
    configurable: true,
    value: [{ name: "first.png", type: "image/png", size: 100 }],
  });
  cover.dispatchEvent(new window.Event("change", { bubbles: true }));
  const preview = form.querySelector(".workshop-cover-preview");
  assert.ok(preview, "selected cover is shown as an image preview");
  assert.equal(preview.hidden, false);
  assert.match(preview.getAttribute("src"), /^blob:/);
  const firstPreview = preview.getAttribute("src");
  Object.defineProperty(cover, "files", {
    configurable: true,
    value: [{ name: "next.webp", type: "image/webp", size: 100 }],
  });
  cover.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(
    objectUrls.some(
      (entry) => entry.action === "revoke" && entry.value === firstPreview,
    ),
  );
  click('[data-action="remove-workshop-cover"]');
  assert.equal(preview.hidden, true);
  assert.equal(form.querySelector('[name="removeCover"]').value, "1");
  Object.defineProperty(cover, "files", { configurable: true, value: [] });
  cover.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(preview.hidden, true);
  change('#workshop-form [name="title"]', "New schedule");
  change('#workshop-form [name="place"]', "New Room");
  const chooseTime = (name, hour, minute) => {
    click(`#${name}-trigger`);
    click(
      `#${name}-panel [data-time-option="hour"][data-time-value="${hour}"]`,
    );
    click(
      `#${name}-panel [data-time-option="minute"][data-time-value="${minute}"]`,
    );
    click(`#${name}-panel [data-time-action="apply"]`);
  };
  chooseTime("startTime", "11", "00");
  click("#endTime-trigger");
  assert.equal(
    document.querySelectorAll('#endTime-panel [data-time-option="hour"]')
      .length,
    24,
  );
  assert.equal(
    document.querySelectorAll('#endTime-panel [data-time-option="minute"]')
      .length,
    60,
  );
  click('#endTime-panel [data-time-option="minute"][data-time-value="45"]');
  const timeEscape = new window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(timeEscape, "key", { value: "Escape" });
  document.activeElement.dispatchEvent(timeEscape);
  assert.equal(
    form.querySelector('[name="endTime"]').value,
    "12:00",
    "Escape discards an unconfirmed time",
  );
  assert.ok(document.querySelector("#workshop-form"));
  chooseTime("endTime", "15", "30");
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.match(form.querySelector(".error").textContent, /เลือกช่วงวันที่/);
  assert.ok(!saved);
  const floatingPanel = document.querySelector("#editor-date-range-panel");
  const floatingTrigger = document.querySelector("#editor-date-range-trigger");
  assert.equal(floatingPanel.getAttribute("popover"), "manual");
  let promoted = false;
  floatingPanel.showPopover = () => {
    promoted = true;
  };
  floatingPanel.hidePopover = () => {
    promoted = false;
  };
  floatingTrigger.getBoundingClientRect = () => ({
    left: 42,
    width: 590,
    top: 554,
    bottom: 600,
  });
  floatingPanel.getBoundingClientRect = () => ({ height: 520 });
  window.innerWidth = 800;
  window.innerHeight = 800;
  click("#editor-date-range-trigger");
  assert.equal(promoted, true, "calendar is promoted above the clipped modal");
  assert.equal(floatingPanel.style.left, "42px");
  assert.equal(floatingPanel.style.width, "590px");
  assert.equal(floatingPanel.style.top, "608px");
  assert.equal(floatingPanel.style.maxHeight, "180px");
  window.innerWidth = 500;
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(floatingPanel.style.width, "476px");
  assert.equal(floatingPanel.style.left, "12px");
  assert.equal(floatingPanel.style.top, "608px");
  window.innerWidth = 800;
  const floatingYears = document.querySelector("#editor-range-year-options");
  const selectedYear = floatingYears.querySelector('[aria-selected="true"]');
  Object.defineProperty(floatingYears, "clientHeight", { value: 200 });
  Object.defineProperty(selectedYear, "offsetTop", { value: 3300 });
  Object.defineProperty(selectedYear, "offsetHeight", { value: 33 });
  floatingYears.scrollTop = 0;
  click("#editor-range-year");
  assert.ok(
    floatingYears.scrollTop > 0,
    "year menu scrolls to its selection without scrolling the modal",
  );
  for (let step = 0; step < 2; step++) {
    const event = new window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "key", { value: "Escape" });
    document.activeElement.dispatchEvent(event);
    assert.ok(
      document.querySelector("#workshop-form"),
      "Escape closes the dropdown/calendar before the editor",
    );
  }
  assert.equal(document.querySelector("#editor-date-range-panel").hidden, true);
  assert.equal(promoted, false);
  click("#editor-date-range-trigger");
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "calendar instances need unique control ids",
  );
  change("#editor-range-start", "2027-02-05");
  change("#editor-range-end", "2027-02-06");
  click('#editor-date-range-panel [data-date-action="apply"]');
  assert.equal(
    document.querySelector("#date-range-trigger").textContent,
    filterText,
  );
  assert.equal(form.querySelector('[name="start"]').value, "2027-02-05T11:00");
  assert.equal(form.querySelector('[name="end"]').value, "2027-02-06T15:30");
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  click('[data-action="answer-yes"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(saved);
  const created = saved.workshops.find((item) => item.title === "New schedule");
  assert.equal(created.start, "2027-02-05T11:00");
  assert.equal(created.end, "2027-02-06T15:30");
  assert.equal(created.capacity, 30);
  assert.equal(created.hours, 3);
  click('[data-action="workshop-menu"][data-id="existing-editor"]');
  click('[data-action="edit-workshop"][data-id="existing-editor"]');
  const edit = document.querySelector("#workshop-form");
  assert.equal(edit.querySelector('[name="startDate"]').value, "2027-01-10");
  assert.equal(edit.querySelector('[name="startTime"]').value, "09:00");
  assert.equal(edit.querySelector('[name="endTime"]').value, "12:00");
  assert.match(
    edit.querySelector("#editor-date-range-trigger").textContent,
    /2570/,
  );
  assert.equal(
    edit.querySelector(".workshop-cover-preview").getAttribute("src"),
    initial.cover,
  );
  const editCover = edit.querySelector('[name="cover"]');
  Object.defineProperty(editCover, "files", {
    configurable: true,
    value: [{ name: "final.png", type: "image/png", size: 100 }],
  });
  editCover.dispatchEvent(new window.Event("change", { bubbles: true }));
  const temporaryPreview = edit
    .querySelector(".workshop-cover-preview")
    .getAttribute("src");
  click('#modal-root [data-action="close"]');
  assert.ok(
    objectUrls.some(
      (entry) => entry.action === "revoke" && entry.value === temporaryPreview,
    ),
    "closing the editor releases its image preview",
  );
  click('[data-action="workshop-menu"][data-id="existing-editor"]');
  click('[data-action="edit-workshop"][data-id="existing-editor"]');
  let removalForm = document.querySelector("#workshop-form");
  const currentCover = removalForm.querySelector('[name="cover"]');
  let filePickerOpened = false;
  currentCover.click = () => {
    filePickerOpened = true;
  };
  click('[data-action="change-workshop-cover"]');
  assert.equal(filePickerOpened, true);
  click('[data-action="remove-workshop-cover"]');
  assert.equal(
    removalForm.querySelector(".workshop-cover-preview").hidden,
    true,
  );
  Object.defineProperty(currentCover, "files", {
    configurable: true,
    value: [{ name: "replacement.png", type: "image/png", size: 100 }],
  });
  currentCover.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(
    removalForm.querySelector('[name="removeCover"]').value,
    "0",
    "choosing a replacement cancels removal",
  );
  assert.equal(
    removalForm.querySelector(".workshop-cover-preview").hidden,
    false,
  );
  click('#modal-root [data-action="close"]');
  click('[data-action="workshop-menu"][data-id="existing-editor"]');
  click('[data-action="edit-workshop"][data-id="existing-editor"]');
  removalForm = document.querySelector("#workshop-form");
  assert.equal(
    removalForm.querySelector(".workshop-cover-preview").getAttribute("src"),
    initial.cover,
    "canceling the editor keeps the saved cover",
  );
  click('[data-action="remove-workshop-cover"]');
  removalForm.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  click('[data-action="answer-yes"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    saved.workshops.find((item) => item.id === initial.id).cover,
    "",
    "saving removal clears the stored cover",
  );
  click('[data-action="workshop-menu"][data-id="existing-editor"]');
  click('[data-action="edit-workshop"][data-id="existing-editor"]');
  document
    .querySelector("#workshop-form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  click('[data-action="answer-yes"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    saved.workshops.find((item) => item.id === initial.id).cover,
    "",
    "a later edit must preserve an intentionally empty cover",
  );
});
