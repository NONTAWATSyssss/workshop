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
} = {}) {
  const { window, document } = parseHTML(
    fs.readFileSync("public/index.html", "utf8"),
  );
  window.scrollTo = () => {};
  window.location = { hash: "#manage", hostname: "example.test" };
  let focused = document.body;
  if (simulateFocus)
    Object.defineProperty(document, "activeElement", { get: () => focused });
  window.HTMLElement.prototype.focus = function () {
    if (!simulateFocus || focused === this) return;
    focused = this;
    this.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  };
  const calls = [];
  let failed = false;
  const context = vm.createContext({
    window,
    document,
    console,
    Headers,
    URL,
    URLSearchParams,
    Date,
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
    setInterval: () => 1,
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
  return { window, document, calls };
}

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
    .querySelector('.sidebar-bottom [data-action="logout"]')
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
