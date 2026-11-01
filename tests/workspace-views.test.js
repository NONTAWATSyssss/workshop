"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function views(role) {
  const { window, document } = parseHTML(
    '<html><body><div id="modal-root"></div></body></html>',
  );
  const runtime = vm.createContext({
    window,
    document,
    console,
    Date,
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
  assert.match(context.staffDashboard(), /staff-trend-panel/);
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
