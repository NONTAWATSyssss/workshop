import { createActivityViews } from "./views/activities.js";
import { createManagementViews } from "./views/management.js";
import { createMembershipViews } from "./views/membership.js";
import {
  createDateRangePicker,
  positionPickerPanel,
} from "./views/date-range.js";
import { createTimePicker } from "./views/time-picker.js";
import { createRecordViews } from "./views/records.js";

let workshopPreviewUrl = null;

let apiCsrf = null,
  apiSaving = Promise.resolve(),
  apiSaveCount = 0,
  apiSaveEpoch = 0,
  apiPollTimer = null,
  apiPolling = false;

let syncMessage = "กำลังเชื่อมต่อ…";

function updateSync(message) {
  syncMessage = message;
  document.querySelectorAll("[data-sync-status]").forEach((el) => {
    el.textContent = message;
  });
}

async function apiRequest(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (apiCsrf && options.method && options.method !== "GET")
    headers.set("X-CSRF-Token", apiCsrf);
  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok)
    throw Object.assign(
      new Error(payload.error || "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"),
      {
        status: response.status,
        field: payload.field,
        code: payload.code,
      },
    );
  return payload;
}

const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

const randomBytes = (n) => {
  const b = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues)
    return globalThis.crypto.getRandomValues(b);
  for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};

const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) +
    Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );

const LOGO = "/assets/images/bsru-workshop-logo.png";

const DEFAULT_WORKSHOP_COVER = "/assets/images/image-002.jpg";

const issues = [
  "อีเมลกับรหัสไม่ตรงกัน เข้าสู่ระบบไม่ได้",
  "จำนวนชั่วโมงอบรมไม่ถูกต้อง",
  "ยกเลิกอบรมไม่ได้",
  "เข้าอบรมแล้ว แต่ไปขึ้นที่สถานะว่าไม่ได้เข้าร่วม",
  "ไม่ได้เข้าร่วมงาน แต่ขึ้นว่าเข้าร่วมงาน",
  "ข้อมูลส่วนตัวที่กรอกตอนสมัครเข้าสู่ระบบไม่ตรงกับข้อมูลที่เจ้าหน้าที่ส่งมา",
  "แดชบอร์ดเข้าร่วมงานกับข้อมูลเข้าร่วมงานไม่ตรงกัน",
  "เลือกรอบเวลาหรือกลุ่มเวิร์กช็อปไม่ได้ / แสดงรอบไม่ตรง",
  "ข้อมูลสถานที่ / ห้องจัดเวิร์กช็อปในแอปไม่ถูกต้อง หรือแผนที่คลาดเคลื่อน",
  "ลงทะเบียนเวิร์กช็อปไม่ได้",
];

const labels = {
  PENDING: "รอดำเนินการ",
  ATTENDED: "เข้าร่วมงานแล้ว",
  ABSENT: "ไม่ได้เข้าร่วม",
  CANCELLED: "ยกเลิกการลงทะเบียน",
  APPROVED: "อนุมัติแล้ว",
  WAITING: "รอเจ้าหน้าที่อนุมัติ",
};

const store = {
  users: [],
  workshops: [],
  registrations: [],
  complaints: [],
  ratings: [],
  notifications: [],
  auditLog: [],
  revision: 0,
};

let state = {
    workshopMenuTrigger: null,
    participantWorkshop: "all",
    participantWorkshopQuery: "",
    participantWorkshopPage: 1,
    participantPage: 1,
    portal: "user",
    userId: null,
    page: "home",
    view: "open",
    search: "",
    filter: "all",
    dashboardMonths: 6,
    dashboardAgendaOpen: false,
    slide: 0,
    notificationFilter: "all",
    notificationQuery: "",
    complaintId: null,
    reportQuery: "",
    reportYear: "all",
    reportStatus: "all",
    reportPage: 1,
    complaintQuery: "",
    complaintStatus: "all",
    complaintPage: 1,
    complaintView: "inbox",
    complaintSelected: [],
    complaintSelecting: false,
    promoSlide: 0,
    approvalQuery: "",
    approvalStatus: "WAITING",
    participantQuery: "",
    participantStatus: "all",
    managePage: 1,
    manageView: "current",
    managePageSize: 10,
    manageSort: "priority",
    archiveYear: null,
    archiveMonth: "all",
    archiveQuery: "",
    archivePage: 1,
    archiveWorkshop: null,
    archiveParticipantQuery: "",
    archiveParticipantStatus: "all",
    archiveParticipantPage: 1,
  },
  ready = false,
  initializing = false,
  bootstrapError = false,
  bootstrapStage = "catalog",
  modalReturn = null,
  modalOverflow = "",
  toastTimer;

const user = () => store.users.find((u) => u.id === state.userId);

const staff = () => state.portal === "staff" && user()?.role === "staff";

const member = () =>
  state.portal === "user" &&
  user()?.role === "user" &&
  user()?.status === "APPROVED";

const badge = (s) =>
  `<span class="badge ${esc(s)}">${esc(labels[s] || s)}</span>`;

const fmt = (s) =>
  new Date(s).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const occupancy = (id) =>
  !staff() &&
  Number.isFinite(store.workshops.find((w) => w.id === id)?.occupancy)
    ? store.workshops.find((w) => w.id === id).occupancy
    : store.registrations.filter(
        (r) => r.workshopId === id && r.status !== "CANCELLED",
      ).length;

const scheduledPhase = (w) =>
  Date.now() < +new Date(w.start)
    ? "upcoming"
    : Date.now() <= +new Date(w.end)
      ? "ongoing"
      : "finished";

const phase = (w) =>
  w.cancelled ? "cancelled" : w.closed ? "closed" : scheduledPhase(w);

const phaseLabel = (w) =>
  ({
    upcoming: "เร็วๆ นี้",
    ongoing: "ดำเนินการอยู่",
    finished: "เสร็จสิ้นแล้ว",
    closed: "ปิดรับสมัคร",
    cancelled: "ยกเลิกกิจกรรม",
  })[phase(w)];

const buttonFeedbackDefaults = new WeakMap();
function buttonFeedback(button, phase, label = "กำลังดำเนินการ…") {
  if (!button) return;
  if (phase === "idle") {
    const saved = buttonFeedbackDefaults.get(button);
    if (saved) {
      button.innerHTML = saved.html;
      button.style.minWidth = saved.minWidth;
      buttonFeedbackDefaults.delete(button);
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.classList.remove("is-loading", "is-success");
    return;
  }
  if (!buttonFeedbackDefaults.has(button)) {
    buttonFeedbackDefaults.set(button, {
      html: button.innerHTML,
      minWidth: button.style.minWidth || "",
    });
    const width = button.getBoundingClientRect?.().width;
    if (width) button.style.minWidth = `${Math.ceil(width)}px`;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.classList.toggle("is-loading", phase === "loading");
  button.classList.toggle("is-success", phase === "success");
  button.innerHTML = `${phase === "success" ? '<i class="fa-solid fa-check button-check" aria-hidden="true"></i>' : '<span class="button-spinner" aria-hidden="true"></span>'}<span>${esc(label)}</span>`;
}

function toast(msg, tone = "info") {
  clearTimeout(toastTimer);
  const tones = {
    info: ["แจ้งให้ทราบ", "fa-circle-info"],
    success: ["ดำเนินการสำเร็จ", "fa-circle-check"],
    error: ["ดำเนินการไม่สำเร็จ", "fa-circle-exclamation"],
    warning: ["โปรดตรวจสอบ", "fa-triangle-exclamation"],
  };
  if (!tones[tone]) tone = "info";
  const [title, icon] = tones[tone];
  const root = $("#toast-root");
  root.setAttribute("role", tone === "error" ? "alert" : "status");
  root.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  const duration = tone === "error" ? 8000 : 5000;
  root.innerHTML = `<div class="toast alert-toast" data-tone="${tone}" style="--toast-duration:${duration}ms"><span class="alert-toast-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span><div class="alert-toast-copy"><strong>${title}</strong><p>${esc(msg)}</p></div><button type="button" class="alert-toast-close" data-toast-dismiss aria-label="ปิดข้อความแจ้งเตือน"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button><span class="alert-toast-timer" aria-hidden="true"></span></div>`;
  const notice = root.querySelector(".alert-toast");
  let remaining = duration,
    startedAt = 0,
    running = false,
    hovered = false,
    focused = false,
    timer = null;
  const resume = () => {
    if (running || hovered || focused || !notice.isConnected) return;
    running = true;
    startedAt = Date.now();
    notice.classList.remove("is-paused");
    timer = setTimeout(() => {
      if (notice.isConnected) notice.remove();
    }, remaining);
    toastTimer = timer;
  };
  const pause = () => {
    if (!running) return;
    clearTimeout(timer);
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
    running = false;
    notice.classList.add("is-paused");
  };
  notice.addEventListener("pointerenter", () => {
    hovered = true;
    pause();
  });
  notice.addEventListener("pointerleave", () => {
    hovered = false;
    resume();
  });
  notice.addEventListener("focusin", () => {
    focused = true;
    pause();
  });
  notice.addEventListener("focusout", (event) => {
    focused = Boolean(
      event.relatedTarget && notice.contains(event.relatedTarget),
    );
    if (!focused) resume();
  });
  notice.querySelector("[data-toast-dismiss]").addEventListener("click", () => {
    clearTimeout(timer);
    notice.remove();
  });
  resume();
}

function commit(msg) {
  store.revision++;
  render();
  if (apiCsrf && state.userId) {
    updateSync("กำลังบันทึก…");
    apiSaveCount++;
    const epoch = apiSaveEpoch,
      actor = state.userId;
    const snapshot = JSON.parse(JSON.stringify(store));
    apiSaving = apiSaving
      .then(() =>
        epoch === apiSaveEpoch && actor === state.userId
          ? apiRequest("/api/store", {
              method: "POST",
              body: JSON.stringify({ store: snapshot }),
            })
          : null,
      )
      .then((result) => {
        if (result && epoch === apiSaveEpoch && actor === state.userId) {
          store.revision = Math.max(store.revision, result.revision);
          if (apiSaveCount === 1) {
            Object.assign(store, result.store);
            render();
          }
          updateSync(
            "บันทึกแล้ว " +
              new Date().toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              }),
          );
          if (msg) toast(msg, "success");
        }
      })
      .catch(async (error) => {
        if (actor !== state.userId || epoch !== apiSaveEpoch) return;
        apiSaveEpoch++;
        updateSync("บันทึกไม่สำเร็จ · กำลังโหลดข้อมูลล่าสุด");
        toast(error.message, "error");
        try {
          const latest = await apiRequest("/api/store");
          if (actor !== state.userId) return;
          Object.assign(store, latest.store);
          render();
        } catch {
          updateSync("เชื่อมต่อขัดข้อง · โปรดตรวจสอบก่อนทำรายการต่อ");
        }
      })
      .finally(() => {
        apiSaveCount--;
        if (
          epoch === apiSaveEpoch &&
          actor === state.userId &&
          state.page === "participants"
        )
          render();
      });
  }
  return apiSaving;
}

function saveNotificationAction(action, data = {}) {
  const epoch = apiSaveEpoch,
    actor = state.userId;
  if (!apiCsrf || !member()) return Promise.resolve(null);
  apiSaveCount++;
  const request = apiSaving.then(async () => {
    if (epoch !== apiSaveEpoch || actor !== state.userId) return null;
    const result = await apiRequest(`/api/notifications/${action}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (epoch !== apiSaveEpoch || actor !== state.userId) return null;
    Object.assign(store, result.store);
    render();
    return result;
  });
  // Keep subsequent saves usable even when an individual notification action fails.
  apiSaving = request.catch(() => {});
  return request.finally(() => {
    apiSaveCount--;
  });
}

function saveComplaintAction(action, data) {
  const epoch = apiSaveEpoch,
    actor = state.userId;
  apiSaveCount++;
  const request = apiSaving.then(async () => {
    if (epoch !== apiSaveEpoch || actor !== state.userId || !apiCsrf)
      return null;
    try {
      const result = await apiRequest(`/api/complaints/${action}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (epoch !== apiSaveEpoch || actor !== state.userId) return null;
      Object.assign(store, result.store);
      render();
      return result;
    } catch (error) {
      if (
        error.status === 409 &&
        epoch === apiSaveEpoch &&
        actor === state.userId
      ) {
        const latest = await apiRequest("/api/store");
        if (epoch === apiSaveEpoch && actor === state.userId) {
          Object.assign(store, latest.store);
          render();
        }
      }
      throw error;
    }
  });
  apiSaving = request.catch(() => {});
  return request.finally(() => {
    apiSaveCount--;
  });
}

const hoursOf = (r) =>
  r.status === "ATTENDED"
    ? store.workshops.find((w) => w.id === r.workshopId)?.hours || 0
    : 0;

const number = (n) =>
  Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

const input = (label, name, type = "text", extra = "") =>
  `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" ${extra} required></div>`;

function shell(content) {
  const u = user(),
    a = staff();
  const icons = {
    dashboard: "fa-chart-pie",
    manage: "fa-layer-group",
    workshops: "fa-compass",
    mine: "fa-bookmark",
    approvals: "fa-user-check",
    participants: "fa-users",
    archive: "fa-clock-rotate-left",
    complaints: "fa-comments",
    "my-complaints": "fa-comment-dots",
    reports: "fa-chart-simple",
  };
  const nav = u
    ? a
      ? [
          ["dashboard", "ภาพรวม"],
          ["manage", "จัดการเวิร์กช็อป"],
          ["approvals", "อนุมัติผู้ใช้งาน"],
          ["participants", "ผู้เข้าร่วมอบรม"],
          ["archive", "เวิร์กช็อปย้อนหลัง"],
          ["complaints", "แจ้งปัญหาและความช่วยเหลือ"],
        ]
      : [
          ["dashboard", "ภาพรวมของฉัน"],
          ["workshops", "ค้นหาเวิร์กช็อป"],
          ["mine", "กิจกรรมของฉัน"],
          ["reports", "ผลการอบรม"],
          ["my-complaints", "คำร้องของฉัน"],
        ]
    : [["workshops", "กิจกรรมทั้งหมด"]];
  const active =
    nav.find(([id]) => id === state.page)?.[1] || "พื้นที่การเรียนรู้";
  const unread = u
    ? store.notifications.filter((n) => n.userId === u.id && !n.readAt).length
    : 0;
  return `<a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหา</a><div class="app-frame ${u ? "is-authenticated" : "is-public"}">
      <header class="nav"><div class="wrap navin">
        <a class="brand" href="${u ? "#dashboard" : "#home"}" data-action="${u ? "page" : "public-page"}" data-id="${u ? "dashboard" : "home"}"><div class="brandmark app-logo"><img src="${LOGO}" alt="BSRU Workshop"></div><div class="brand-copy"><b class="brand-title">ระบบจัดการอบรมและเวิร์กช็อป</b><div class="brand-institution">มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</div></div></a>
        ${u ? `<div class="workspace-label">พื้นที่ทำงาน <span>/</span> <b>${esc(active)}</b></div>` : '<span class="header-motto"><span class="status-dot"></span> เรียนรู้วันนี้ เติบโตได้ทุกวัน</span>'}
        <div class="header-actions">
        ${member() ? `<button type="button" class="btn icon-button notification-trigger" data-action="notification-open" aria-haspopup="dialog" aria-label="การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน"><i class="fa-regular fa-bell" aria-hidden="true"></i>${unread ? `<span class="notification-count" aria-hidden="true">${unread > 99 ? "99+" : unread}</span>` : ""}</button>` : ""}
        ${u ? membershipUi.accountMenu(u) : `<nav class="public-nav" aria-label="เมนูหลัก"><button type="button" data-action="public-page" data-id="home" aria-current="page">หน้าแรก</button></nav><button type="button" class="btn primary public-login" data-action="login"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Login</button>`}
        </div>
      </div></header>
      ${
        u
          ? `<aside class="sidebar"><div class="sidebar-label">${a ? "จัดการพื้นที่การเรียนรู้" : "พื้นที่การเรียนรู้ของคุณ"}</div><nav class="side-nav" aria-label="เมนูหลัก">${nav.map(([id, label]) => `<button data-action="page" data-id="${id}" class="${state.page === id ? "active" : ""}" ${state.page === id ? 'aria-current="page"' : ""}><i class="fa-solid ${icons[id]}" aria-hidden="true"></i><span>${label}</span>${id === "notifications" && unread ? `<span class="nav-count">${unread}</span>` : ""}</button>`).join("")}</nav>
        <div class="sidebar-note"><span class="note-spark"><i class="fa-solid fa-sparkles fa-star" aria-hidden="true"></i></span><b>ก้าวเล็ก ๆ สู่โอกาสใหม่</b><p>ทุกการเรียนรู้ คืออีกก้าวของการเติบโต</p>${member() ? '<button class="btn small" data-action="page" data-id="workshops">สำรวจเวิร์กช็อป <span aria-hidden="true">↗</span></button>' : '<span class="sub">สร้างประสบการณ์ที่ดีไปด้วยกัน</span>'}</div>
        <div class="sidebar-bottom">${member() ? '<button data-action="support"><i class="fa-regular fa-circle-question" aria-hidden="true"></i> แจ้งปัญหาการใช้งาน</button>' : ""}<div class="profile-card">${membershipUi.avatar(u, "profile-avatar")}<div><b>${esc(u.name)}</b><span>${a ? "เจ้าหน้าที่ดูแลระบบ" : "สมาชิก BSRU Workshop"}</span></div></div></div>
      </aside>`
          : ""
      }
      <main id="main-content" class="wrap main" tabindex="-1"><div class="page-stage">${content}</div><footer class="foot" aria-label="ข้อมูลเว็บไซต์"><div class="footer-main"><div class="footer-brand"><img src="${LOGO}" alt="" width="48" height="52" loading="lazy" decoding="async"><div><strong>BSRU Workshop<span class="brand-dot">.</span></strong><p>พื้นที่แห่งการเรียนรู้และพัฒนาทักษะ</p></div></div><div class="footer-institution"><span>ระบบจัดการอบรมและเวิร์กช็อป</span><p>มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</p></div></div><div class="footer-bottom"><small>© ${new Date().getFullYear()} BSRU Workshop</small><p class="footer-motto">เรียนรู้ <span aria-hidden="true">·</span> สร้างสรรค์ <span aria-hidden="true">·</span> เติบโตไปด้วยกัน</p></div></footer></main></div>`;
}

let pendingConfirm = null,
  confirmReturn = null;

function askConfirm(message, tone = "info", labels = {}) {
  if (pendingConfirm) return Promise.resolve(false);
  const danger = tone === "danger";
  const title =
    labels.title || (danger ? "ยืนยันการลบข้อมูล" : "ยืนยันการดำเนินการ");
  const icon =
    labels.icon ||
    (danger ? "fa-regular fa-trash-can" : "fa-regular fa-circle-question");
  confirmReturn = document.activeElement;
  return new Promise((resolve) => {
    pendingConfirm = resolve;
    $("#confirm-root").innerHTML =
      `<div class="dialog-back confirm-back"><section class="dialog confirm-dialog" data-tone="${danger ? "danger" : "info"}" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><span class="confirm-symbol" aria-hidden="true"><i class="${esc(icon)}"></i></span><h2 id="confirm-title">${esc(title)}</h2><p id="confirm-message" class="confirm-message">${esc(message)}</p><div class="confirm-actions"><button class="btn" data-action="answer-no">${esc(labels.cancelLabel || "ไม่ใช่ / กลับไปแก้ไข")}</button><button class="btn primary ${danger ? "danger" : ""}" data-action="answer-yes">${esc(labels.confirmLabel || "ใช่ ยืนยัน")}</button></div></section></div>`;
    $('#confirm-root [data-action="answer-no"]')?.focus();
  });
}

function finishConfirm(answer) {
  const resolve = pendingConfirm;
  pendingConfirm = null;
  $("#confirm-root").innerHTML = "";
  confirmReturn?.focus?.();
  if (resolve) resolve(answer);
}

let previousView = null;

let restoringNavigation = false;

const routePages = [
  "dashboard",
  "workshops",
  "mine",
  "reports",
  "notifications",
  "my-complaints",
  "manage",
  "approvals",
  "participants",
  "archive",
  "complaints",
];

const requestedPage = () => {
  const [page, query = ""] = (window.location?.hash || "").slice(1).split("?");
  if (page === "complaints")
    state.complaintId = new URLSearchParams(query).get("id") || null;
  if (page === "participants") {
    state.participantWorkshop =
      new URLSearchParams(query).get("workshop") || "all";
    state.participantQuery = "";
    state.participantStatus = "all";
    state.participantPage = 1;
  }
  if (page === "archive") {
    const params = new URLSearchParams(query);
    state.archiveYear = Number(params.get("year")) || null;
    const month = Number(params.get("month"));
    state.archiveMonth = month >= 1 && month <= 12 ? String(month) : "all";
    state.archiveWorkshop = params.get("workshop") || null;
    state.archiveParticipantQuery = "";
    state.archiveParticipantStatus = "all";
    state.archiveParticipantPage = 1;
  }
  return page === "notifications"
    ? "dashboard"
    : routePages.includes(page)
      ? page
      : "dashboard";
};

const dateRangePicker = createDateRangePicker({
  esc,
  getRange: () => [state.dateFrom || "", state.dateTo || ""],
  onChange(from, to) {
    state.dateFrom = from;
    state.dateTo = to;
    state.managePage = 1;
    render();
  },
});

function syncWorkshopSchedule() {
  const form = $("#workshop-form");
  if (!form) return;
  for (const edge of ["start", "end"]) {
    const day = form.querySelector(`[name="${edge}Date"]`).value;
    const time = form.querySelector(`[name="${edge}Time"]`).value;
    form.querySelector(`[name="${edge}"]`).value =
      day && time ? `${day}T${time}` : "";
  }
}

function releaseWorkshopPreview() {
  if (workshopPreviewUrl) URL.revokeObjectURL(workshopPreviewUrl);
  workshopPreviewUrl = null;
}

function showWorkshopCover(form, src, title = "รูปภาพปกปัจจุบัน") {
  const image = form.querySelector(".workshop-cover-preview");
  image.hidden = !src;
  if (src) image.src = src;
  else image.removeAttribute("src");
  image.title = title;
  form
    .querySelector(".workshop-upload")
    .classList.toggle("has-preview", Boolean(src));
  form.querySelector(".workshop-upload-name").textContent = src
    ? "เปลี่ยนรูปภาพ"
    : "เพิ่มรูปภาพ";
}

function updateWorkshopCoverPreview(input) {
  const form = input.closest("#workshop-form");
  if (!form) return;
  let file = input.files?.[0];
  let error = "";
  if (
    file &&
    (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 3 * 1024 * 1024)
  ) {
    error = "ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB";
    input.value = "";
    file = null;
  }
  releaseWorkshopPreview();
  const existing = store.workshops.find((item) => item.id === form.dataset.id);
  const removal = form.querySelector('[name="removeCover"]');
  if (file) removal.value = "0";
  const src = file
    ? (workshopPreviewUrl = URL.createObjectURL(file))
    : removal.value === "1"
      ? ""
      : existing?.cover || "";
  showWorkshopCover(form, src, file?.name);
  form.querySelector("#form-error").textContent = error;
}

const workshopDateRangePicker = createDateRangePicker({
  esc,
  idPrefix: "editor-",
  floating: true,
  getRange: () =>
    ["start", "end"].map(
      (edge) =>
        $("#workshop-form")?.querySelector(`[name="${edge}Date"]`)?.value || "",
    ),
  onChange(from, to) {
    const form = $("#workshop-form");
    if (!form) return;
    form.querySelector('[name="startDate"]').value = from;
    form.querySelector('[name="endDate"]').value = to;
    syncWorkshopSchedule();
    form.querySelector(".workshop-range-field").innerHTML =
      workshopDateRangePicker.field();
  },
});

const workshopTimePicker = createTimePicker({
  esc,
  positionPanel: positionPickerPanel,
  onChange: syncWorkshopSchedule,
  onOpen() {
    workshopDateRangePicker.close();
    dateRangePicker.close();
  },
});

const viewContext = {
  state,
  store,
  badge,
  closeModal,
  commit,
  askConfirm,
  saveNotificationAction,
  saveComplaintAction,
  render,
  esc,
  dateRangeField: dateRangePicker.field,
  workshopDateRangeField: workshopDateRangePicker.field,
  workshopTimeField: workshopTimePicker.field,
  fmt,
  hoursOf,
  input,
  issues,
  member,
  number,
  occupancy,
  openModal,
  phase,
  phaseLabel,
  scheduledPhase,
  staff,
  toast,
  uid,
  user,
  get managedWorkshops() {
    return managedWorkshops;
  },
  get syncMessage() {
    return syncMessage;
  },
  get apiSaveCount() {
    return apiSaveCount;
  },
  $,
  get complaints() {
    return complaints;
  },
  get complaintThread() {
    return complaintThread;
  },
  get empty() {
    return empty;
  },
  get title() {
    return title;
  },
  get workshops() {
    return workshops;
  },
};
const {
  home,
  announcementDetail,
  updatePublicCarousel,
  scrollPublicWorkshops,
  scrollPublicSection,
  empty,
  enroll,
  learnerDashboard,
  openNotifications,
  refreshNotifications,
  notificationBack,
  clearNotificationHistory,
  notifyUser,
  ratingModal,
  readNotification,
  supportModal,
  title,
  workshopDetail,
  workshops,
} = createActivityViews(viewContext);
const recordsUi = createRecordViews(viewContext);
const { complaints, myComplaints, reports, replyModal, complaintThread } =
  recordsUi;
const {
  approvalsV2,
  archiveDate,
  archiveDateLabel,
  archiveHash,
  archiveMonths,
  archivePeriod,
  archiveRegistrations,
  archiveReplaceRoute,
  archivedWorkshops,
  attendanceStats,
  closeWorkshopMenu,
  deletedWorkshopDetail,
  downloadCsv,
  managedWorkshops,
  openWorkshopMenu,
  openAttendanceMenu,
  participantsV2,
  participantRows,
  staffDashboard,
  workshopArchive,
  workshopModal,
} = createManagementViews(viewContext);
const membershipUi = createMembershipViews({
  $,
  esc,
  input,
  user,
  openModal,
  closeModal,
  apiRequest,
  toast,
  buttonFeedback,
  askConfirm,
  onAuthenticated: acceptSession,
  onLoggedOut: showPublicHome,
  onAccount(result) {
    Object.assign(store, result.store);
    render();
  },
});
window.addEventListener?.("popstate", () => {
  if (!user()) {
    state.page = "home";
    return render();
  }
  restoringNavigation = true;
  const notificationsRoute = window.location?.hash === "#notifications";
  closeModal();
  state.page = requestedPage();
  state.view = state.page === "mine" ? "mine" : "open";
  render();
  if (notificationsRoute) openNotifications();
  restoringNavigation = false;
});

function renderBootstrap() {
  let screen = $(".app-bootstrap");
  // Change only the status text so the logo animation stays steady.
  if (!screen || screen.dataset.bootstrapError !== String(bootstrapError)) {
    $("#app").innerHTML =
      `<main class="app-bootstrap" data-bootstrap-error="${bootstrapError}">
        <section class="app-bootstrap-content" ${bootstrapError ? 'role="alert"' : 'role="status" aria-live="polite" aria-busy="true"'}>
          <div class="app-bootstrap-emblem" aria-hidden="true">
            <span class="app-bootstrap-shadow"></span>
            <div class="app-bootstrap-scene">
              <span class="app-bootstrap-orbit"></span>
              <span class="app-bootstrap-orbit app-bootstrap-orbit-secondary"></span>
              <div class="app-bootstrap-core"><img class="app-bootstrap-logo" src="${LOGO}" alt="" width="90" height="92"></div>
            </div>
          </div>
          <h1>${bootstrapError ? "ขอเวลาเชื่อมต่ออีกครั้ง" : "กำลังเตรียมพื้นที่การเรียนรู้"}</h1>
          <p id="bootstrap-message"></p>
          <div class="app-bootstrap-progress" aria-hidden="true"><span></span></div>
          ${bootstrapError ? '<button class="btn primary app-bootstrap-retry" type="button" data-action="retry-bootstrap">ลองเชื่อมต่ออีกครั้ง <span aria-hidden="true">↗</span></button>' : ""}
        </section>
      </main>`;
    screen = $(".app-bootstrap");
  }
  screen.dataset.bootstrapStage = bootstrapStage;
  $("#bootstrap-message").textContent = bootstrapError
    ? "ยังโหลดข้อมูลไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
    : "กำลังโหลดรายการเวิร์กช็อป";
}

function render() {
  closeWorkshopMenu();
  if (!staff() || state.page !== "complaints" || state.complaintId) {
    state.complaintSelecting = false;
    state.complaintSelected = [];
  }
  // Keep the neutral loading screen until the public catalogue is ready.
  if (!ready) {
    return renderBootstrap();
  }
  let content;
  if (!user()) content = home();
  else if (state.page === "dashboard")
    content = staff() ? staffDashboard() : learnerDashboard();
  else if (staff())
    content = (
      {
        manage: workshops,
        approvals: approvalsV2,
        participants: participantsV2,
        archive: workshopArchive,
        complaints,
      }[state.page] || learnerDashboard
    )();
  else if (state.page === "mine") {
    state.view = "mine";
    content = workshops();
  } else
    content = (
      { workshops, reports, "my-complaints": myComplaints }[state.page] ||
      learnerDashboard
    )();
  const view = [
    state.portal,
    state.userId,
    state.page,
    state.page === "archive" ? state.archiveWorkshop || "list" : "",
    state.page === "complaints" ? state.complaintId || "list" : "",
    state.page === "participants" ? state.participantWorkshop : "",
  ].join(":");
  const changed = view !== previousView;
  const hadView = previousView !== null;
  $("#app").innerHTML = shell(content);
  updatePublicCarousel();

  if (changed) {
    $(".page-stage")?.classList.add("is-entering");
    if (hadView) {
      window.scrollTo({ top: 0, behavior: "auto" });
      $("#main-content")?.focus({ preventScroll: true });
    }
  }
  if (changed && !restoringNavigation && window.history?.pushState) {
    const hash =
      state.page === "archive" && staff()
        ? archiveHash()
        : state.page === "complaints" && staff() && state.complaintId
          ? `#complaints?id=${encodeURIComponent(state.complaintId)}`
          : state.page === "participants" &&
              staff() &&
              state.participantWorkshop !== "all"
            ? `#participants?workshop=${encodeURIComponent(state.participantWorkshop)}`
            : "#" + state.page;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  }
  previousView = view;
}

function openModal(title, body) {
  membershipUi.releasePhoto();
  releaseWorkshopPreview();
  workshopTimePicker.close();
  workshopDateRangePicker.close();
  if (!$("#modal-root .dialog")) {
    modalReturn = document.activeElement;
    modalOverflow = document.body.style.overflow;
  }
  document.body.style.overflow = "hidden";
  $("#modal-root").innerHTML =
    `<div class="dialog-back"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="top"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="ปิดหน้าต่าง">✕</button></div>${body}</section></div>`;
  $("#modal-root input, #modal-root select, #modal-root button")?.focus();
}

function closeModal() {
  membershipUi.releasePhoto();
  const notificationsOpen = Boolean($("#notification-center"));
  workshopTimePicker.close();
  workshopDateRangePicker.close();
  releaseWorkshopPreview();
  $("#modal-root").innerHTML = "";
  document.body.style.overflow = modalOverflow || "";
  if (notificationsOpen && member())
    $('[data-action="notification-open"]')?.focus();
  else if (modalReturn?.isConnected) modalReturn.focus();
  else $("#app button")?.focus();
}

function confirmModal(msg, action, id, workshop = null) {
  const selectedWorkshop = workshop
    ? `<section class="confirm-workshop" aria-labelledby="confirm-workshop-title"><img class="confirm-workshop-cover ${workshop.cover ? "" : "is-placeholder"}" src="${esc(workshop.cover || LOGO)}" alt="" width="80" height="88" decoding="async"><div class="confirm-workshop-info"><span class="confirm-workshop-label">เวิร์คช็อปที่เลือก</span><h3 id="confirm-workshop-title">${esc(workshop.title)}</h3><div class="confirm-workshop-meta"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${esc(fmt(workshop.start))}<span class="confirm-workshop-end">ถึง ${esc(fmt(workshop.end))}</span></span></span><span><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${esc(workshop.place || "ยังไม่ระบุสถานที่")}</span></span></div></div></section>`
    : "";
  openModal(
    workshop ? "ยืนยันการลงทะเบียน" : "ยืนยันการดำเนินการ",
    `<div class="action-confirm-body">${workshop ? selectedWorkshop : '<span class="confirm-symbol" aria-hidden="true"><i class="fa-regular fa-circle-question"></i></span>'}<p id="action-confirm-message" class="confirm-message">${esc(msg)}</p><div class="confirm-actions"><button class="btn" data-action="close">ไม่ใช่</button><button class="btn primary" data-action="${esc(action)}" data-id="${esc(id)}">ใช่ ยืนยัน</button></div></div>`,
  );
  const dialog = $("#modal-root .dialog");
  dialog.classList.add("action-confirm-dialog");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute(
    "aria-describedby",
    workshop
      ? "action-confirm-message confirm-workshop-title"
      : "action-confirm-message",
  );
}

const validContact = (c) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) || /^0\d{8,9}$/.test(c);

const normalize = (c) => c.trim().toLowerCase();

document.addEventListener("focusin", (e) => {
  if (!e.target.closest(".account-menu"))
    if (
      !e.target.closest(
        '#workshop-actions-menu, [data-action="workshop-menu"], [data-action="attendance-menu"]',
      )
    )
      closeWorkshopMenu();
});

window.addEventListener?.("resize", () => {
  closeWorkshopMenu();
  updatePublicCarousel();
});

document.addEventListener(
  "scroll",
  (e) => {
    if (e.target.id === "public-workshop-track") updatePublicCarousel();
    if (!e.target.closest?.("#workshop-actions-menu")) closeWorkshopMenu();
  },
  true,
);

document.addEventListener("click", async (e) => {
  if (
    workshopTimePicker.click(e) ||
    workshopDateRangePicker.click(e) ||
    dateRangePicker.click(e)
  )
    return;
  if (!e.target.closest(".account-menu"))
    if (
      !e.target.closest(
        '#workshop-actions-menu, [data-action="workshop-menu"], [data-action="attendance-menu"]',
      )
    )
      closeWorkshopMenu();
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  if (b.tagName === "A") e.preventDefault();
  let a = b.dataset.action;
  if (membershipUi.isAction(a)) {
    await membershipUi.handleAction(a, b);
    return;
  }
  if (a === "public-page") {
    state.page = "home";
    state.view = "open";
    state.search = "";
    state.filter = "all";
    render();
    if (b.dataset.id === "workshops") scrollPublicSection();
    else window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  if (a === "public-section") return scrollPublicSection();
  if (a === "public-carousel") return scrollPublicWorkshops(b.dataset.id);
  if (a === "announcement") return announcementDetail(b.dataset.id);
  if (!user() && !["workshop-detail", "close", "retry-bootstrap"].includes(a))
    return;
  const id = b.dataset.id;
  if (a === "answer-yes" || a === "answer-no")
    return finishConfirm(a === "answer-yes");
  if (pendingConfirm) return;
  if (a === "participants-back" && staff()) {
    const selected = state.participantWorkshop;
    state.participantWorkshop = "all";
    state.participantQuery = "";
    state.participantStatus = "all";
    state.participantPage = 1;
    render();
    [...document.querySelectorAll(".participant-workshop-open")]
      .find((button) => button.dataset.id === selected)
      ?.focus();
    return;
  }
  if (
    ["participant-workshop-page", "participant-page"].includes(a) &&
    staff()
  ) {
    const page = Number(id);
    if (!Number.isSafeInteger(page) || page < 1) return;
    if (a === "participant-workshop-page") state.participantWorkshopPage = page;
    else state.participantPage = page;
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
    $("#main-content")?.focus({ preventScroll: true });
    return;
  }
  if (recordsUi.isAction(a)) return recordsUi.handleAction(a, id);
  if (staff() && a === "attendance-pending") {
    state.participantWorkshop = id;
    state.page = "participants";
    state.participantQuery = "";
    state.participantStatus = "PENDING";
    state.participantPage = 1;
    return render();
  }
  if (staff() && a === "finalize-attendance") {
    if (apiSaveCount) return toast("กำลังบันทึกผล กรุณารอสักครู่");
    const w = store.workshops.find((w) => w.id === id);
    if (!w || w.attendanceFinalizedAt || +archiveDate(w.end) > Date.now())
      return;
    if (attendanceStats(w).pending)
      return toast("กรุณาบันทึกผลเข้าร่วมหรือไม่เข้าร่วมให้ครบทุกคนก่อน");
    if (
      !(await askConfirm(
        `ยืนยันผล “${w.title}” และเก็บเข้าประวัติหรือไม่? หลังยืนยันแล้วจะเป็นแบบอ่านอย่างเดียว`,
      ))
    )
      return;
    if (!staff() || apiSaveCount) return;
    const actor = state.userId,
      epoch = apiSaveEpoch;
    apiSaveCount++;
    render();
    try {
      const result = await apiRequest("/api/workshops/finalize-attendance", {
        method: "POST",
        body: JSON.stringify({ workshopId: id, revision: store.revision }),
      });
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      Object.assign(store, result.store);
      state.archiveWorkshop = id;
      state.archiveYear = archivePeriod(w).year;
      state.archiveMonth = String(archivePeriod(w).month);
      state.archiveParticipantQuery = "";
      state.archiveParticipantStatus = "all";
      state.archiveParticipantPage = 1;
      state.page = "archive";
      toast("ยืนยันผลและเก็บเข้าประวัติแล้ว", "success");
    } catch (error) {
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      toast(error.message, "error");
      if (error.status === 409) {
        const latest = await apiRequest("/api/store").catch(() => null);
        if (latest && actor === state.userId && epoch === apiSaveEpoch) {
          Object.assign(store, latest.store);
        }
      }
    } finally {
      apiSaveCount--;
      if (actor === state.userId && epoch === apiSaveEpoch) render();
    }
    return;
  }
  if (staff() && state.page === "archive" && a.startsWith("archive-")) {
    const w = archivedWorkshops().find(
      (w) => w.id === (id || state.archiveWorkshop),
    );
    if (a === "archive-roster" && w) {
      state.archiveWorkshop = w.id;
      state.archiveParticipantQuery = "";
      state.archiveParticipantStatus = "all";
      state.archiveParticipantPage = 1;
      return render();
    }
    if (a === "archive-back") {
      state.archiveWorkshop = null;
      return render();
    }
    if (a === "archive-detail" && w)
      return openModal(
        esc(w.title),
        `<p class="activity-description">${esc(w.description || "ยังไม่มีรายละเอียดเพิ่มเติม")}</p><p>${esc(archiveDateLabel(w.start))} – ${esc(archiveDateLabel(w.end))}</p><p class="muted">${esc(w.place || "ไม่ระบุสถานที่")} · ${number(w.hours || 0)} ชั่วโมง</p><button class="btn" data-action="close">ปิดรายละเอียด</button>`,
      );
    if (a === "archive-page") {
      state[state.archiveWorkshop ? "archiveParticipantPage" : "archivePage"] =
        Math.max(1, Number(id) || 1);
      render();
      document
        .querySelector(".archive-view table")
        ?.scrollIntoView?.({ block: "start", behavior: "auto" });
      document.querySelector(".archive-view h1")?.focus?.();
      return;
    }
    if (a === "archive-clear") {
      state.archiveMonth = "all";
      state.archiveQuery = "";
      state.archivePage = 1;
      render();
      return archiveReplaceRoute();
    }
    if (a === "archive-export" && w) {
      // Keep spreadsheet formulas inert even if a member's display name starts with '='.
      const safe = (value) =>
        /^[\s]*[=+@-]/.test(String(value || "")) ? "'" + value : value;
      const period = archivePeriod(w);
      return downloadCsv(
        `bsru-archive-${period.year + 543}-${String(period.month).padStart(2, "0")}-${w.id.replace(/[^a-zA-Z0-9_-]/g, "")}.csv`,
        [
          [
            "ชื่อ–นามสกุล",
            "รหัสประจำตัว",
            "อีเมล",
            "เวิร์กช็อป",
            "วันที่เริ่มกิจกรรม",
            "ปี พ.ศ.",
            "เดือนที่จัดกิจกรรม",
            "สถานะการเข้าร่วม",
          ],
          ...archiveRegistrations(w.id).map((r) => {
            const u = store.users.find((u) => u.id === r.userId);
            return [
              u?.name || "ไม่พบข้อมูลผู้ใช้งาน",
              u?.code || "",
              u?.email || "",
              w.title,
              archiveDateLabel(w.start),
              period.year + 543,
              archiveMonths[period.month - 1],
              labels[r.status] || r.status,
            ].map(safe);
          }),
        ],
      );
    }
    return;
  }
  if (b.closest("#workshop-actions-menu")) closeWorkshopMenu(true);
  if (staff() && a === "workshop-menu") return openWorkshopMenu(b);
  if (staff() && a === "attendance-menu") return openAttendanceMenu(b);
  if (staff() && state.page === "manage") {
    if (a === "manage-view") {
      state.manageView = id === "deleted" ? "deleted" : "current";
      state.filter = "all";
      state.search = "";
      state.dateFrom = "";
      state.dateTo = "";
      state.managePage = 1;
      state.manageSort = "priority";
      render();
      $(`[data-action="manage-view"][data-id="${state.manageView}"]`)?.focus();
      return;
    }
    if (a === "manage-page") {
      state.managePage = Math.max(1, Number(id) || 1);
      render();
      $("#manage-results")?.focus({ preventScroll: true });
      $("#manage-results")?.scrollIntoView?.({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
      return;
    }
    if (a === "reset-manage-filters") {
      state.dateFrom = "";
      state.dateTo = "";
      state.managePage = 1;
      state.search = "";
      state.filter = "all";
      return render();
    }
  }
  if (a === "retry-bootstrap") return initializeLocalApp();
  if (a === "toggle-account-menu") {
    const dropdown = $("#account-dropdown");
    dropdown.hidden = !dropdown.hidden;
    b.setAttribute("aria-expanded", String(!dropdown.hidden));
    return;
  }
  if (a === "notification-open") return openNotifications();
  if (a === "notification-history") return openNotifications("history");
  if (a === "notification-current") return openNotifications();
  if (a === "notification-back") return notificationBack();
  if (a === "notification-clear") return clearNotificationHistory();
  if (a === "notification-read") return readNotification(id);
  if (a === "notification-filter" && member()) {
    state.notificationFilter = ["all", "general", "activity"].includes(id)
      ? id
      : "all";
    return refreshNotifications();
  }
  if (a === "clear-notification-search") {
    state.notificationQuery = "";
    return refreshNotifications();
  }
  if (a === "export-participants" && staff()) {
    const workshop = store.workshops.find(
      (w) => w.id === state.participantWorkshop,
    );
    if (!workshop)
      return toast("กรุณาเลือกเวิร์คช็อปก่อน Export รายชื่อ", "warning");
    const users = new Map(store.users.map((u) => [u.id, u]));
    const rows = participantRows().map((r) => {
      const u = users.get(r.userId);
      return [
        u?.name || "",
        u?.code || "",
        u?.email || "",
        workshop.title,
        labels[r.status] || r.status,
      ];
    });
    downloadCsv("bsru-participants.csv", [
      ["ชื่อ", "รหัสประจำตัว", "อีเมล", "เวิร์กช็อป", "สถานะ"],
      ...rows,
    ]);
    return;
  }

  if (a === "notification-go" && member()) {
    closeModal();
    state.page = id;
    return render();
  }
  if (a === "complaint-open" && staff()) {
    if (!store.complaints.some((item) => item.id === id))
      return toast("ไม่พบคำร้องนี้");
    state.page = "complaints";
    state.complaintId = id;
    return render();
  }
  if (a === "complaints-back" && staff()) {
    const selected = state.complaintId;
    state.complaintId = null;
    render();
    [...document.querySelectorAll('[data-action="complaint-open"]')]
      .find((item) => item.dataset.id === selected)
      ?.focus();
    return;
  }
  if (a === "reply-open") return replyModal(id);
  if (["logout", "switch", "approve", "attend", "absent"].includes(a)) {
    if (["approve", "attend", "absent"].includes(a) && !staff()) return;
    if (["logout", "switch"].includes(a) && !user()) {
    } else
      return confirmModal(
        {
          logout: "ต้องการออกจากระบบจริงใช่ไหม?",
          switch:
            "ต้องการออกจากบัญชีนี้เพื่อเข้าสู่ระบบด้วยบัญชีอื่นใช่หรือไม่?",
          approve: "ต้องการอนุมัติสิทธิ์ผู้ใช้งานนี้จริงใช่ไหม?",
          attend:
            "ต้องการยืนยันว่าผู้ใช้นี้เข้าร่วมงานและบันทึกชั่วโมงอบรมจริงใช่ไหม?",
          absent:
            "ต้องการบันทึกว่าผู้ใช้นี้ไม่ได้เข้าร่วมงานจริงใช่ไหม? ชั่วโมงของรายการนี้จะไม่นับรวม",
        }[a],
        "confirmed-" + a,
        id || "",
      );
  }
  if (a.startsWith("confirmed-")) {
    const next = a.slice(10);
    if (!["logout", "switch", "approve", "attend", "absent"].includes(next))
      return;
    a = next;
    closeModal();
  }

  if (a === "close") {
    return closeModal();
  }

  if (a === "workshop-detail") return workshopDetail(id);
  if (a === "page") {
    if (id === "notifications") return openNotifications();
    state.page = id;
    if (id === "participants") {
      state.participantWorkshop = "all";
      state.participantWorkshopQuery = "";
      state.participantWorkshopPage = 1;
      state.participantPage = 1;
      state.participantQuery = "";
      state.participantStatus = "all";
    }
    state.complaintId = null;
    if (id === "archive") state.archiveWorkshop = null;
    state.view = id === "mine" ? "mine" : "open";
    state.search = "";
    state.filter = "all";
    state.dateFrom = "";
    state.dateTo = "";
    state.managePage = 1;
    state.manageView = "current";
    return render();
  }

  if (a === "support" && member()) return supportModal();

  if (a === "slide") {
    state.slide =
      id === "prev"
        ? (state.slide - 1 + store.workshops.length) % store.workshops.length
        : id === "next"
          ? (state.slide + 1) % store.workshops.length
          : Number(id);
    return render();
  }
  if (a === "promo-slide") {
    const total = promotionItems().length;
    state.promoSlide =
      id === "prev"
        ? (state.promoSlide - 1 + total) % total
        : id === "next"
          ? (state.promoSlide + 1) % total
          : Number(id);
    return render();
  }
  if (a === "dashboard-month-info" && staff())
    return toast(
      `${b.dataset.label}: ${number(Number(b.dataset.count))} รายการลงทะเบียน`,
    );
  if (a === "view") {
    state.view = id;
    state.page = id === "mine" ? "mine" : "workshops";
    return render();
  }
  if (a === "rate-open" && member()) return ratingModal(id);
  if (a === "rate" && member()) {
    if (!(await askConfirm("ต้องการส่งคะแนนประเมินนี้จริงใช่ไหม?"))) return;
    const r = store.registrations.find(
        (r) => r.id === id && r.userId === state.userId,
      ),
      score = Number(b.dataset.score);
    if (!r || !Number.isInteger(score) || score < 1 || score > 5) return;
    const old = store.ratings.find(
      (x) => x.registrationId === r.id || x.eventId === r.ratingEvent,
    );
    if (old) {
      old.score = score;
      old.eventId = r.id;
      old.registrationId = r.id;
    } else
      store.ratings.push({
        id: uid(),
        eventId: r.id,
        userId: state.userId,
        registrationId: id,
        workshopId: r.workshopId,
        score,
        createdAt: new Date().toISOString(),
      });
    closeModal();
    return commit("ขอบคุณสำหรับการประเมินความรู้สึกหลังใช้งาน");
  }
  if (a === "enroll" && member()) {
    const workshop = store.workshops.find((item) => item.id === id);
    if (!workshop)
      return toast("ไม่พบเวิร์คช็อปที่เลือก กรุณาลองใหม่", "warning");
    const r = store.registrations.find(
      (r) => r.userId === state.userId && r.workshopId === id,
    );
    return confirmModal(
      r
        ? "ต้องการลงทะเบียนเวิร์กช็อปนี้อีกครั้งหรือไม่?"
        : "ยืนยันการลงทะเบียนเวิร์กช็อปนี้หรือไม่?",
      "confirm-enroll",
      id,
      workshop,
    );
  }
  if (a === "confirm-enroll") return enroll(id);
  if (a === "cancel" && member())
    return confirmModal(
      "ต้องการยกเลิกการลงทะเบียนนี้หรือไม่?",
      "confirm-cancel",
      id,
    );
  if (a === "confirm-cancel" && member()) {
    const r = store.registrations.find(
      (r) => r.id === id && r.userId === state.userId,
    );
    if (r?.status !== "PENDING")
      return toast("สถานะเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง");
    r.status = "CANCELLED";
    r.updatedAt = new Date().toISOString();
    closeModal();
    return commit("ยกเลิกการลงทะเบียนแล้ว");
  }
  if (!staff()) return;
  if (a === "deleted-workshop-detail") return deletedWorkshopDetail(id);
  if (a === "delete-workshop") {
    const w = store.workshops.find((w) => w.id === id);
    if (!w) return toast("ไม่พบเวิร์กช็อป");
    openModal(
      "ลบเวิร์กช็อป",
      `<div class="action-confirm-body"><span class="confirm-symbol" aria-hidden="true"><i class="fa-regular fa-trash-can"></i></span><p id="delete-workshop-message" class="confirm-message">ต้องการลบเวิร์กช็อป “${esc(w.title)}” หรือไม่?</p><p class="notice">รายชื่อผู้ลงทะเบียน ผลประเมิน และชั่วโมงอบรมของกิจกรรมนี้จะถูกลบถาวร และไม่สามารถกู้คืนได้</p><p class="sub">ระบบจะเก็บชื่อกิจกรรม วันจัด และผู้ลบไว้ใน “กิจกรรมที่ลบไปแล้ว” สำหรับแอดมิน</p><div class="confirm-actions"><button class="btn" data-action="close">ยกเลิก</button><button class="btn primary danger" data-action="confirm-delete-workshop" data-id="${esc(id)}">ยืนยันลบ</button></div></div>`,
    );
    const dialog = $("#modal-root .dialog");
    dialog.classList.add("action-confirm-dialog");
    dialog.dataset.tone = "danger";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-describedby", "delete-workshop-message");
    return;
  }
  if (a === "confirm-delete-workshop") {
    if (b.disabled) return;
    const buttons = [...document.querySelectorAll("#modal-root button")];
    buttons.forEach((button) => (button.disabled = true));
    buttonFeedback(b, "loading", "กำลังลบ…");
    const actor = state.userId,
      epoch = apiSaveEpoch;
    apiSaveCount++;
    try {
      await apiSaving;
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      updateSync("กำลังลบเวิร์กช็อป…");
      const result = await apiRequest("/api/workshops/delete", {
        method: "POST",
        body: JSON.stringify({ workshopId: id, revision: store.revision }),
      });
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      Object.assign(store, result.store);
      closeModal();
      render();
      updateSync("บันทึกแล้ว");
      toast("ลบเวิร์กช็อปแล้ว", "success");
    } catch (error) {
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      updateSync("ลบไม่สำเร็จ");
      toast(error.message, "error");
      if (error.status === 409) {
        const latest = await apiRequest("/api/store").catch(() => null);
        if (latest && actor === state.userId && epoch === apiSaveEpoch) {
          Object.assign(store, latest.store);
          closeModal();
          render();
        }
      }
    } finally {
      apiSaveCount--;
      buttons.forEach((button) => (button.disabled = false));
      if (b.isConnected) buttonFeedback(b, "idle");
    }
    return;
  }
  if (a === "close-workshop") {
    const w = store.workshops.find((w) => w.id === id);
    if (!w || w.closed || scheduledPhase(w) === "finished")
      return toast("ไม่สามารถปิดเวิร์กช็อปที่เสร็จสิ้นหรือปิดไปแล้ว");
    return confirmModal(
      "ปิดเวิร์กช็อปนี้หรือไม่? จะหยุดรับลงทะเบียนใหม่ และคงรายชื่อกับชั่วโมงที่ยืนยันไว้เดิม",
      "confirm-close-workshop",
      id,
    );
  }
  if (a === "confirm-close-workshop") {
    const w = store.workshops.find((w) => w.id === id);
    if (!w || w.closed || scheduledPhase(w) === "finished")
      return toast("ไม่สามารถปิดเวิร์กช็อปที่เสร็จสิ้นหรือปิดไปแล้ว");
    w.closed = true;
    w.closedAt = new Date().toISOString();

    closeModal();
    return commit("ปิดเวิร์กช็อปแล้ว ฝั่งผู้ใช้ไม่สามารถลงทะเบียนเพิ่มได้");
  }
  if (a === "add-workshop") return workshopModal();
  if (
    ["change-workshop-cover", "remove-workshop-cover"].includes(a) &&
    staff()
  ) {
    const form = b.closest("#workshop-form");
    if (!form) return;
    const cover = form.querySelector('[name="cover"]');
    if (a === "change-workshop-cover") cover.click();
    else {
      cover.value = "";
      form.querySelector('[name="removeCover"]').value = "1";
      releaseWorkshopPreview();
      showWorkshopCover(form, "");
    }
    return;
  }
  if (a === "edit-workshop") {
    if (store.workshops.find((w) => w.id === id)?.attendanceFinalizedAt)
      return toast("กิจกรรมนี้ยืนยันผลแล้ว ไม่สามารถแก้ไขได้");
    return workshopModal(id);
  }
  if (a === "participants-for") {
    if (!store.workshops.some((w) => w.id === id))
      return toast("ไม่พบเวิร์คช็อปที่เลือก กรุณาเลือกรายการใหม่", "warning");
    state.participantWorkshop = id;
    state.page = "participants";
    state.participantQuery = "";
    state.participantStatus = "all";
    state.participantPage = 1;
    return render();
  }

  if (a === "approve") {
    const u = store.users.find((u) => u.id === id && u.role === "user");
    if (u?.status === "WAITING") {
      u.status = "APPROVED";

      notifyUser(
        u.id,
        "บัญชีของคุณได้รับอนุมัติแล้ว",
        "คุณสามารถเข้าสู่ระบบและลงทะเบียนเวิร์กช็อปได้แล้ว",
        "account",
        u.id,
      );
      commit("อนุมัติแล้ว ผู้ใช้เข้าสู่ระบบได้ทันที");
    }
    return;
  }

  const r = store.registrations.find((r) => r.id === id);
  if (!r || r.status === "CANCELLED") return;
  if (store.workshops.find((w) => w.id === r.workshopId)?.attendanceFinalizedAt)
    return toast("กิจกรรมนี้ยืนยันผลแล้ว ไม่สามารถแก้ไขผลได้");
  const previous = r.status;
  if (
    ["ATTENDED", "ABSENT"].includes(previous) &&
    ((a === "attend" && previous !== "ATTENDED") ||
      (a === "absent" && previous !== "ABSENT"))
  ) {
    if (
      !(await askConfirm(
        "เปลี่ยนผลการเข้าร่วมที่บันทึกไว้แล้วหรือไม่? ชั่วโมงสะสมจะเปลี่ยนตามผลใหม่",
      ))
    )
      return;
    if (r.status !== previous || !staff()) return;
  }
  if (a === "attend") r.status = "ATTENDED";
  else if (a === "absent") r.status = "ABSENT";
  else return;
  if (previous !== r.status) {
    const w = store.workshops.find((w) => w.id === r.workshopId);
    notifyUser(
      r.userId,
      a === "attend" ? "ยืนยันการเข้าร่วมงานแล้ว" : "อัปเดตสถานะการเข้าร่วมงาน",
      `${w.title} · ${labels[r.status]} · ชั่วโมงที่ได้รับ ${number(hoursOf(r))} ชั่วโมง`,
      "attendance",
      r.id,
    );
  }
  r.updatedAt = new Date().toISOString();

  commit("อัปเดตสถานะและชั่วโมงอบรมของผู้ใช้งานแล้ว");
});

document.addEventListener(
  "toggle",
  (e) => {
    if (e.target.id === "staff-upcoming-details")
      state.dashboardAgendaOpen = e.target.open;
  },
  true,
);

document.addEventListener("change", (e) => {
  if (recordsUi.change(e)) return;
  if (workshopDateRangePicker.change(e) || dateRangePicker.change(e)) return;
  if (e.target.closest("#workshop-form")) {
    if (["startTime", "endTime"].includes(e.target.name))
      syncWorkshopSchedule();
    if (e.target.id === "cover") {
      updateWorkshopCoverPreview(e.target);
    }
  }
  if (e.target.id === "mine-status") {
    state.mineStatus = e.target.value;
    render();
    $("#mine-status")?.focus();
    return;
  }
  if (e.target.id === "dashboard-period" && staff()) {
    state.dashboardMonths = Number(e.target.value) === 12 ? 12 : 6;
    render();
    $("#dashboard-period")?.focus();
    return;
  }
  if (staff() && state.page === "archive") {
    if (e.target.id === "archive-year") {
      state.archiveYear = Number(e.target.value);
      state.archiveMonth = "all";
      state.archivePage = 1;
      render();
      return archiveReplaceRoute();
    }
    if (e.target.id === "archive-month") {
      state.archiveMonth = e.target.value;
      state.archivePage = 1;
      render();
      return archiveReplaceRoute();
    }
    if (e.target.id === "archive-participant-status") {
      state.archiveParticipantStatus = e.target.value;
      state.archiveParticipantPage = 1;
      return render();
    }
  }
  if (e.target.id === "phase-filter") {
    state.filter = e.target.value;
    state.managePage = 1;
    render();
  }
  if (e.target.id === "manage-sort" && staff()) {
    state.manageSort = ["priority", "newest", "oldest"].includes(e.target.value)
      ? e.target.value
      : "priority";
    state.managePage = 1;
    render();
  }
  if (e.target.id === "manage-page-size" && staff()) {
    const size = Number(e.target.value);
    state.managePageSize = [10, 25, 50].includes(size) ? size : 10;
    state.managePage = 1;
    render();
  }
  if (e.target.id === "approval-status") {
    state.approvalStatus = e.target.value;
    render();
  }
  if (e.target.id === "participant-status") {
    state.participantStatus = e.target.value;
    state.participantPage = 1;
    render();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "participant-workshop-search" && staff()) {
    const pos = e.target.selectionStart;
    state.participantWorkshopQuery = e.target.value;
    state.participantWorkshopPage = 1;
    render();
    $("#participant-workshop-search")?.focus();
    $("#participant-workshop-search")?.setSelectionRange?.(pos, pos);
    return;
  }
  if (recordsUi.input(e)) return;
  if (
    staff() &&
    state.page === "archive" &&
    ["archive-search", "archive-participant-search"].includes(e.target.id)
  ) {
    const field = e.target.id;
    const pos = e.target.selectionStart;
    state[
      field === "archive-search" ? "archiveQuery" : "archiveParticipantQuery"
    ] = e.target.value;
    state[
      field === "archive-search" ? "archivePage" : "archiveParticipantPage"
    ] = 1;
    render();
    document.getElementById(field)?.focus();
    document.getElementById(field)?.setSelectionRange?.(pos, pos);
    return;
  }
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    state.search = e.target.value;
    state.managePage = 1;
    render();
    $("#search").focus();
    $("#search").setSelectionRange?.(pos, pos);
  }
  if (e.target.id === "notification-search") {
    const pos = e.target.selectionStart;
    state.notificationQuery = e.target.value;
    refreshNotifications();
    const search = $("#notification-search");
    search?.focus();
    search?.setSelectionRange?.(pos, pos);
  }
  if (e.target.id === "approval-search") {
    const pos = e.target.selectionStart;
    state.approvalQuery = e.target.value;
    render();
    $("#approval-search")?.focus();
    $("#approval-search")?.setSelectionRange?.(pos, pos);
  }
  if (e.target.id === "participant-search") {
    const pos = e.target.selectionStart;
    state.participantQuery = e.target.value;
    state.participantPage = 1;
    render();
    $("#participant-search")?.focus();
    $("#participant-search")?.setSelectionRange?.(pos, pos);
  }
});

document.addEventListener("keydown", (e) => {
  if (
    workshopTimePicker.keydown(e) ||
    workshopDateRangePicker.keydown(e) ||
    dateRangePicker.keydown(e)
  )
    return;
  if (
    e.target.closest?.("#public-workshop-track") &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  ) {
    e.preventDefault();
    return scrollPublicWorkshops(
      { ArrowLeft: "prev", ArrowRight: "next", Home: "first", End: "last" }[
        e.key
      ],
    );
  }
  const attendanceTrigger = e.target.closest?.(
    '[data-action="attendance-menu"]',
  );
  if (
    staff() &&
    attendanceTrigger &&
    !attendanceTrigger.disabled &&
    ["ArrowDown", "ArrowUp"].includes(e.key)
  ) {
    e.preventDefault();
    if (state.workshopMenuTrigger !== attendanceTrigger)
      openAttendanceMenu(attendanceTrigger);
    const choices = [
      ...document.querySelectorAll(
        "#workshop-actions-menu button:not([disabled])",
      ),
    ];
    (e.key === "ArrowUp" ? choices.at(-1) : choices[0])?.focus();
    return;
  }
  const workshopMenu = $("#workshop-actions-menu");
  if (workshopMenu) {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      closeWorkshopMenu(true);
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
      e.target.closest?.("#workshop-actions-menu")
    ) {
      e.preventDefault();
      const items = [...workshopMenu.querySelectorAll("button")].filter(
        (item) => !item.disabled,
      );
      if (!items.length) return;
      const index = items.indexOf(e.target);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
              items.length;
      items[next]?.focus();
      return;
    }
  }
  const dropdown = $("#account-dropdown");
  const trigger = e.target.closest?.('[data-action="toggle-account-menu"]');
  if (dropdown && (trigger || !dropdown.hidden)) {
    if (e.key === "Escape" && !dropdown.hidden) {
      e.preventDefault();
      membershipUi.closeAccountMenu(true);
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
      e.target.closest?.(".account-menu")
    ) {
      e.preventDefault();
      dropdown.hidden = false;
      $('[data-action="toggle-account-menu"]').setAttribute(
        "aria-expanded",
        "true",
      );
      const items = [...dropdown.querySelectorAll("button")];
      const index = items.indexOf(e.target);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : e.key === "ArrowUp"
              ? index < 0
                ? items.length - 1
                : (index - 1 + items.length) % items.length
              : (index + 1) % items.length;
      items[next]?.focus();
      return;
    }
  }
  if (pendingConfirm) {
    if (e.key === "Escape") {
      e.preventDefault();
      finishConfirm(false);
    } else if (e.key === "Tab") {
      const no = $('#confirm-root [data-action="answer-no"]'),
        yes = $('#confirm-root [data-action="answer-yes"]');
      e.preventDefault();
      (document.activeElement === no ? yes : no)?.focus();
    }
    return;
  }
  const dialog = $(".dialog");
  if (!dialog) return;
  if (e.key === "Escape") {
    closeModal();
    return;
  }
  if (e.key === "Tab") {
    const f = [
      ...dialog.querySelectorAll("button,input,select,textarea"),
    ].filter((x) => !x.disabled);
    if (e.shiftKey && document.activeElement === f[0]) {
      e.preventDefault();
      f.at(-1).focus();
    } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
      e.preventDefault();
      f[0].focus();
    }
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (
    !["support-form", "workshop-form", "reply-form", "reject-form"].includes(
      f.id,
    )
  )
    return;
  e.preventDefault();
  if (!user()) return;
  if (f.id === "workshop-form") syncWorkshopSchedule();
  const formData = new FormData(f),
    d = Object.fromEntries(formData);
  for (const k of Object.keys(d))
    if (typeof d[k] === "string") d[k] = d[k].trim();
  const submit = f.querySelector('button[type="submit"],button:not([type])');
  if (submit?.disabled) return;
  buttonFeedback(submit, "loading", "กำลังตรวจสอบข้อมูล…");
  const err = f.querySelector(".error");
  if (err) err.textContent = "";
  const portalAtSubmit = state.portal,
    actorAtSubmit = state.userId;
  try {
    if (f.id === "reject-form") {
      if (!staff() || !d.reason || d.reason.length > 500)
        throw Error("กรุณาระบุเหตุผลการปฏิเสธไม่เกิน 500 ตัวอักษร");
      const target = store.users.find(
        (u) => u.id === f.dataset.id && u.role === "user",
      );
      if (!target || target.status !== "WAITING")
        throw Error("ผู้สมัครรายการนี้เปลี่ยนสถานะแล้ว");
      if (!(await askConfirm("ยืนยันการปฏิเสธผู้สมัครรายนี้ใช่หรือไม่?")))
        return;
      target.status = "REJECTED";

      notifyUser(
        target.id,
        "บัญชีผู้ใช้ยังไม่ได้รับการอนุมัติ",
        `เหตุผล: ${d.reason}`,
        "account",
        target.id,
      );
      closeModal();
      commit("ปฏิเสธผู้ใช้งานและบันทึกเหตุผลแล้ว");
    }

    if (f.id === "reply-form") {
      if (!staff()) throw Error("เฉพาะเจ้าหน้าที่เท่านั้น");
      const c = store.complaints.find((c) => c.id === f.dataset.id);
      if (
        !c ||
        !d.reply ||
        d.reply.length > 3000 ||
        !["REPLIED", "CLOSED"].includes(d.status)
      )
        throw Error("กรุณากรอกข้อความตอบกลับและเลือกสถานะให้ถูกต้อง");
      if (
        !(await askConfirm("ต้องการส่งคำตอบนี้กลับไปยังผู้ใช้งานจริงใช่ไหม?"))
      )
        return;
      if (!staff() || state.userId !== actorAtSubmit || !f.isConnected) return;
      const reply = {
        id: uid(),
        text: d.reply,
        staffName: user().name,
        staffId: state.userId,
        createdAt: new Date().toISOString(),
      };
      (c.replies ||= []).push(reply);
      c.status = d.status;
      c.updatedAt = reply.createdAt;

      notifyUser(
        c.userId,
        "เจ้าหน้าที่ตอบกลับคำร้องของคุณแล้ว",
        c.issue + " · " + d.reply,
        "complaint",
        c.id,
      );
      closeModal();
      commit("ส่งคำตอบแล้ว ผู้ใช้ได้รับแจ้งเตือนในแอป");
    }

    if (f.id === "support-form") {
      if (!member()) throw Error("เฉพาะผู้ใช้งานที่เข้าสู่ระบบเท่านั้น");
      if (
        !issues.includes(d.issue) ||
        !validContact(d.contact) ||
        !d.name ||
        !d.code
      )
        throw Error("กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง");
      if (
        !(await askConfirm(
          "ต้องการส่งเรื่องร้องเรียนนี้ถึงเจ้าหน้าที่จริงใช่ไหม?",
        ))
      )
        return;
      if (!member() || state.userId !== actorAtSubmit || !f.isConnected) return;
      const complaint = {
        id: uid(),
        userId: state.userId,
        issue: d.issue,
        name: d.name,
        type: d.type,
        code: d.code,
        contact: d.contact,
        detail: d.detail,
        replies: [],
        status: "OPEN",
        createdAt: new Date().toISOString(),
      };
      store.complaints.push(complaint);
      notifyUser(
        state.userId,
        "ส่งคำร้องเรียนสำเร็จ",
        `รับเรื่อง “${d.issue}” แล้ว รอเจ้าหน้าที่ตอบกลับ คุณสามารถติดตามคำตอบในคำร้องของฉัน`,
        "complaint",
        complaint.id,
      );
      closeModal();
      commit("ส่งเรื่องถึงเจ้าหน้าที่แล้ว");
    }
    if (f.id === "workshop-form") {
      if (!staff()) throw Error("กรุณาเข้าสู่ระบบเจ้าหน้าที่");
      if (!d.title || !d.place) throw Error("กรุณากรอกชื่อกิจกรรมและสถานที่");
      if (!d.start || !d.end)
        throw Error("กรุณาเลือกช่วงวันที่และเวลาเริ่ม–สิ้นสุดให้ครบ");
      const elapsed = (new Date(d.end) - new Date(d.start)) / 3600000;
      if (!Number.isFinite(elapsed) || elapsed <= 0)
        throw Error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
      const capacity = Number(d.capacity),
        hours = Number(d.hours);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
        throw Error("จำนวนที่นั่งต้องเป็นจำนวนเต็ม 1–10,000");
      if (
        !Number.isFinite(hours) ||
        hours < 0.5 ||
        hours > 1000 ||
        (hours * 2) % 1 !== 0 ||
        hours > elapsed
      )
        throw Error(
          "ชั่วโมงอบรมต้องเพิ่มทีละ 0.5 ชั่วโมง และไม่เกินช่วงเวลาเริ่ม–สิ้นสุด",
        );
      const existing = store.workshops.find((w) => w.id === f.dataset.id);
      if (existing && capacity < occupancy(existing.id))
        throw Error("จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ลงทะเบียน");
      let cover =
        d.removeCover === "1"
          ? ""
          : (existing?.cover ?? DEFAULT_WORKSHOP_COVER);
      if (d.removeCover !== "1" && d.cover?.size) {
        if (
          d.cover.size > 3 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(d.cover.type)
        )
          throw Error("ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB");
        cover = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(Error("อ่านรูปภาพไม่สำเร็จ"));
          reader.readAsDataURL(d.cover);
        });
      }
      if (!staff() || !f.isConnected)
        throw Error("สิทธิ์เจ้าหน้าที่เปลี่ยนไป กรุณาเข้าสู่ระบบใหม่");
      if (existing && capacity < occupancy(existing.id))
        throw Error("จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ลงทะเบียน");
      if (
        !(await askConfirm(
          existing
            ? "ต้องการบันทึกการแก้ไขเวิร์กช็อปนี้จริงใช่ไหม?"
            : "ต้องการสร้างเวิร์กช็อปนี้จริงใช่ไหม?",
        ))
      )
        return;
      if (!staff() || state.userId !== actorAtSubmit || !f.isConnected) return;
      const w = {
        id: existing?.id || uid(),
        title: d.title,
        start: d.start,
        end: d.end,
        place: d.place,
        capacity,
        hours,
        cover,
        description: d.description,
        category: "BSRU WORKSHOP",
        icon: "fa-graduation-cap",
        closed: existing?.closed || false,
        photoSource: cover ? existing?.photoSource : undefined,
      };
      if (existing) Object.assign(existing, w);
      else store.workshops.unshift(w);
      closeModal();
      commit("บันทึกแล้ว · เวิร์กช็อปและชั่วโมงอัปเดตในฝั่งผู้ใช้งานทันที");
    }
  } catch (error) {
    if (err?.isConnected) err.textContent = error.message;
    else toast(error.message, "error");
  } finally {
    if (submit?.isConnected) buttonFeedback(submit, "idle");
  }
});

async function initializeLocalApp() {
  if (initializing) return;
  initializing = true;
  ready = false;
  bootstrapError = false;
  bootstrapStage = "catalog";
  render();
  try {
    const session = await apiRequest("/api/session");
    membershipUi.configure(session);
    if (session.user) await acceptSession(session, true);
    else {
      const result = await apiRequest("/api/workshops");
      store.workshops = result.workshops;
      state.userId = null;
      state.portal = "user";
      state.page = "home";
      state.view = "open";
      ready = true;
      render();
    }
  } catch (error) {
    bootstrapError = true;
    render();
  } finally {
    initializing = false;
  }
}

async function acceptSession(session, restoreRoute = false) {
  const epoch = ++apiSaveEpoch;
  apiCsrf = session.csrf;
  const latest = session.store
    ? { store: session.store }
    : await apiRequest("/api/store");
  if (epoch !== apiSaveEpoch) return;
  Object.assign(store, latest.store);
  updateSync("เชื่อมต่อแล้ว");
  state.userId = session.user.id;
  state.portal = session.user.role;
  const notificationsRoute =
    restoreRoute && window.location?.hash === "#notifications";
  state.page = restoreRoute ? requestedPage() : "dashboard";
  state.view = state.page === "mine" ? "mine" : "open";
  ready = true;
  render();
  if (notificationsRoute) openNotifications();
  startApiPolling();
}

async function showPublicHome() {
  closeModal();
  apiSaveEpoch++;
  apiCsrf = null;
  if (apiPollTimer) clearInterval(apiPollTimer);
  apiPollTimer = null;
  state.userId = null;
  state.portal = "user";
  state.page = "home";
  state.view = "open";
  for (const key of [
    "users",
    "registrations",
    "complaints",
    "ratings",
    "notifications",
    "auditLog",
  ])
    store[key] = [];
  ready = true;
  render();
  try {
    store.workshops = (await apiRequest("/api/workshops")).workshops;
    render();
    return true;
  } catch {
    toast("โหลดกิจกรรมล่าสุดไม่สำเร็จ กรุณาลองอีกครั้ง", "error");
    return false;
  }
}

function startApiPolling() {
  if (apiPollTimer) return;
  apiPollTimer = setInterval(async () => {
    if (
      apiPolling ||
      document.visibilityState === "hidden" ||
      !apiCsrf ||
      apiSaveCount ||
      pendingConfirm ||
      (document.querySelector("#modal-root .dialog") &&
        !$("#notification-center")) ||
      document.activeElement?.matches?.("input,textarea,select")
    )
      return;
    const actor = state.userId,
      epoch = apiSaveEpoch;
    apiPolling = true;
    try {
      const latest = await apiRequest("/api/store");
      if (
        actor !== state.userId ||
        epoch !== apiSaveEpoch ||
        !apiCsrf ||
        apiSaveCount ||
        document.activeElement?.matches?.("input,textarea,select")
      )
        return;
      if (latest.store.revision > store.revision) {
        const account = latest.store.users.find((item) => item.id === actor);
        const roleChanged = account && account.role !== state.portal;
        Object.assign(store, latest.store);
        if (roleChanged) {
          closeModal();
          apiSaveEpoch++;
          state.portal = account.role;
          state.page = "dashboard";
          state.view = "open";
        }
        render();
      }
      refreshNotifications({ background: true });
    } catch (error) {
      if (actor !== state.userId || epoch !== apiSaveEpoch) return;
      if (error.status === 401) {
        await showPublicHome();
        toast("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", "warning");
      } else updateSync("เชื่อมต่อขัดข้อง · กำลังลองใหม่");
    } finally {
      apiPolling = false;
    }
  }, 15000);
}

initializeLocalApp();
