"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function views(role, clock = null) {
  const { window, document } = parseHTML(
    '<html><body><div id="modal-root"></div></body></html>',
  );
  const runtime = vm.createContext({
    window,
    document,
    console,
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
    URLSearchParams,
    Blob,
    URL,
  });
  const modules = [];
  for (const name of [
    "activities",
    "management",
    "date-range",
    "time-picker",
    "records",
  ]) {
    const module = new vm.SourceTextModule(
      fs.readFileSync(`public/assets/js/views/${name}.js`, "utf8"),
      { context: runtime },
    );
    await module.link(() => {
      throw Error("View factories must not import application state");
    });
    await module.evaluate();
    modules.push(module.namespace);
  }
  const account = {
    id: "person",
    role,
    status: "APPROVED",
    name: "Example",
    type: "นักศึกษา",
    code: "EXAMPLE",
    email: "example@example.test",
  };
  const state = {
    portal: role,
    userId: account.id,
    dashboardMonths: 6,
    manageView: "current",
    search: "",
    filter: "all",
    managePage: 1,
    managePageSize: 10,
    manageSort: "priority",
    archiveYear: 2020,
    archiveMonth: "all",
    archiveQuery: "",
    archivePage: 1,
  };
  const store = {
    users: [account],
    workshops: [],
    registrations: [],
    complaints: [],
    ratings: [],
    notifications: [],
    auditLog: [],
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const context = {
    state,
    store,
    issues: ["ปัญหากิจกรรม"],
    apiSaveCount: 0,
    syncMessage: "พร้อม",
    esc,
    $: (selector) => document.querySelector(selector),
    user: () => account,
    staff: () => role === "staff",
    member: () => role === "user",
    number: (value) => String(value),
    fmt: (value) => String(value),
    badge: (value) => `<span>${esc(value)}</span>`,
    input: (label, name) =>
      `<label>${esc(label)}<input name="${name}"></label>`,
    occupancy: () => 0,
    hoursOf: () => 0,
    scheduledPhase: (workshop) =>
      Date.parse(workshop.end) < Date.now() ? "finished" : "upcoming",
    phase: (workshop) =>
      workshop.closed ? "closed" : context.scheduledPhase(workshop),
    phaseLabel: () => "กิจกรรม",
    openModal: (_title, html) => {
      document.querySelector("#modal-root").innerHTML = html;
    },
  };
  context.dateRangeField = modules[2].createDateRangePicker({
    esc,
    getRange: () => [state.dateFrom || "", state.dateTo || ""],
    onChange(from, to) {
      state.dateFrom = from;
      state.dateTo = to;
    },
  }).field;
  context.workshopDateRangeField = modules[2].createDateRangePicker({
    esc,
    idPrefix: "editor-",
    getRange: () => ["", ""],
    onChange() {},
  }).field;
  context.workshopTimeField = modules[3].createTimePicker({
    esc,
    positionPanel: modules[2].positionPickerPanel,
    onChange() {},
  }).field;
  Object.assign(context, modules[0].createActivityViews(context));
  Object.assign(context, modules[4].createRecordViews(context));
  Object.assign(context, modules[1].createManagementViews(context));
  return { context, document };
}

test("retained complaint form renders its issue choices through the extracted view module", async () => {
  const { context, document } = await views("user");
  context.supportModal();
  assert.match(
    document.querySelector("#modal-root").textContent,
    /ปัญหากิจกรรม/,
  );
  assert.ok(document.querySelector("#support-form"));
});

test("retained management views render dashboard, bounded tables and activity archives", async () => {
  const { context, document } = await views("staff");
  context.store.workshops = Array.from({ length: 200 }, (_, i) => ({
    id: `w${i}`,
    title: `Activity ${i}`,
    description: "",
    start: "2099-11-01T09:00",
    end: "2099-11-01T12:00",
    place: "Room",
    capacity: 30,
    hours: 3,
    closed: false,
  }));
  const overview = context.staffDashboard();
  assert.match(overview, /staff-trend-panel/);
  document.body.innerHTML = overview;
  const agenda = document.querySelector("#staff-upcoming-details");
  assert.ok(agenda.querySelector(".staff-agenda-heading"));
  assert.equal(
    agenda.querySelector(".staff-activity-count b").textContent,
    "200",
  );
  assert.equal(agenda.querySelectorAll("tbody tr").length, 5);
  assert.equal(
    agenda.querySelectorAll('[data-action="participants-for"]').length,
    5,
  );
  assert.match(
    agenda.querySelector(".staff-activity-toolbar").textContent,
    /5.*200/,
  );
  assert.equal(agenda.querySelectorAll(".staff-agenda-thumb").length, 5);
  assert.match(agenda.querySelector(".staff-agenda-date").textContent, /ถึง/);
  assert.equal(
    agenda.querySelector('[data-id="manage"]').getAttribute("data-action"),
    "page",
  );
  document.body.innerHTML = context.managedWorkshops();
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 10);
  context.store.workshops.push({
    id: "archived",
    title: "Archived activity",
    start: "2020-11-01T09:00",
    end: "2020-11-01T12:00",
    place: "Room",
    capacity: 30,
    hours: 3,
    attendanceFinalizedAt: "2020-11-02T00:00:00Z",
  });
  assert.match(context.workshopArchive(), /Archived activity/);
});

test("participant export rows stay workshop-scoped and include all filtered pages", async () => {
  const { context } = await views("staff");
  context.store.workshops = [
    { id: "one", title: "One" },
    { id: "two", title: "Two" },
  ];
  context.store.registrations = Array.from({ length: 60 }, (_, i) => ({
    id: "r" + i,
    userId: "person",
    workshopId: i < 35 ? "one" : "two",
    status: i % 2 ? "ATTENDED" : "PENDING",
  }));
  context.state.participantQuery = "";
  context.state.participantStatus = "all";
  context.state.participantWorkshop = "all";
  assert.equal(context.participantRows().length, 0);
  context.state.participantWorkshop = "one";
  assert.equal(context.participantRows().length, 35);
  assert.ok(context.participantRows().every((r) => r.workshopId === "one"));
  context.state.participantStatus = "ATTENDED";
  assert.equal(context.participantRows().length, 17);
  context.state.participantQuery = "missing person";
  assert.equal(context.participantRows().length, 0);
});

test("staff summary, monthly bars and attendance rate share the selected Bangkok-time period", async () => {
  const { context, document } = await views("staff", {
    now: Date.parse("2026-11-01T12:00:00Z"),
  });
  context.store.registrations = [
    { status: "ATTENDED", createdAt: "2026-11-01T09:00:00+07:00" },
    { status: "ABSENT", createdAt: "2026-06-01T00:00:00" },
    { status: "PENDING", createdAt: "2026-05-31T17:00:00Z" },
    { status: "ATTENDED", createdAt: "2026-05-31T16:59:59Z" },
    { status: "CANCELLED", createdAt: "2026-11-01T09:00:00+07:00" },
    { status: "ATTENDED", createdAt: "2026-11-02T09:00:00+07:00" },
    { status: "ATTENDED", createdAt: "2025-11-30T16:59:59Z" },
  ];
  const metric = (key) =>
    document.querySelector(`[data-metric="${key}"] dd strong`).textContent;
  const counts = () =>
    [...document.querySelectorAll(".staff-month-bar")].map((bar) =>
      Number(bar.dataset.count),
    );
  document.body.innerHTML = context.staffDashboard();
  assert.equal(metric("registrations"), "3");
  assert.equal(metric("recorded"), "2");
  assert.equal(metric("pending"), "1");
  assert.deepEqual(counts(), [2, 0, 0, 0, 0, 1]);
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "50%",
  );
  assert.deepEqual(
    [...document.querySelectorAll(".staff-chart-axis span")].map(
      (span) => span.textContent,
    ),
    ["4", "2", "0"],
  );
  context.state.dashboardMonths = 12;
  document.body.innerHTML = context.staffDashboard();
  assert.equal(metric("registrations"), "4");
  assert.equal(metric("recorded"), "3");
  assert.equal(metric("pending"), "1");
  assert.equal(counts().length, 12);
  assert.equal(
    counts().reduce((total, count) => total + count, 0),
    4,
  );
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "66.7%",
  );
});

test("staff overview shows an uncalculated rate for pending-only and empty data", async () => {
  const { context, document } = await views("staff", {
    now: Date.parse("2026-11-01T12:00:00Z"),
  });
  context.store.registrations = [
    { status: "PENDING", createdAt: "2026-11-01T09:00:00+07:00" },
  ];
  document.body.innerHTML = context.staffDashboard();
  assert.equal(
    document.querySelector('[data-metric="recorded"] dd strong').textContent,
    "0",
  );
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "—",
  );
  assert.ok(document.querySelector(".staff-outcome-pending"));
  context.store.registrations = [];
  document.body.innerHTML = context.staffDashboard();
  assert.equal(
    document.querySelector('[data-metric="registrations"] dd strong')
      .textContent,
    "0",
  );
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "—",
  );
  assert.ok(document.querySelector(".staff-trend-panel .staff-empty"));
  assert.equal(document.querySelectorAll(".staff-month-bar").length, 0);
});
