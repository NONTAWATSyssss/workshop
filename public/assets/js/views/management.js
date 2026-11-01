export function createManagementViews(context) {
  const {
    state,
    store,
    $,
    badge,
    esc,
    dateRangeField,
    workshopDateRangeField,
    workshopTimeField,
    fmt,
    input,
    number,
    occupancy,
    openModal,
    phase,
    scheduledPhase,
    staff,
    toast,
  } = context;
  const complaints = (...args) => context.complaints(...args);
  const empty = (...args) => context.empty(...args);
  const title = (...args) => context.title(...args);
  const workshops = (...args) => context.workshops(...args);
  function staffDashboard() {
    const now = Date.now();
    const campusToday = new Date(now + 7 * 3600000);
    const year = campusToday.getUTCFullYear(),
      month = campusToday.getUTCMonth();
    const months = state.dashboardMonths;
    const calendarStart = Date.UTC(year, month - months + 1, 1);
    const from = calendarStart - 7 * 3600000;
    const monthLabel = (value, full = false) =>
      new Date(value).toLocaleDateString("th-TH", {
        timeZone: "UTC",
        month: full ? "long" : "short",
        year: full ? "numeric" : "2-digit",
      });
    const periodLabel = `${monthLabel(calendarStart)} – ${monthLabel(Date.UTC(year, month, 1))}`;
    // Both graphs use registrations created in the same campus-time window.
    const registrations = store.registrations.filter((r) => {
      const created = +archiveDate(r.createdAt);
      return r.status !== "CANCELLED" && created >= from && created <= now;
    });
    const byMonth = new Map();
    for (const r of registrations) {
      const key = new Date(+archiveDate(r.createdAt) + 7 * 3600000)
        .toISOString()
        .slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    }
    const trend = Array.from({ length: months }, (_, i) => {
      const date = new Date(Date.UTC(year, month - months + i + 1, 1));
      const key = date.toISOString().slice(0, 7);
      return {
        key,
        label: date.toLocaleDateString("th-TH", {
          timeZone: "UTC",
          month: "short",
        }),
        year: date.toLocaleDateString("th-TH", {
          timeZone: "UTC",
          year: "2-digit",
        }),
        fullLabel: monthLabel(+date, true),
        value: byMonth.get(key) || 0,
      };
    });
    const maxValue = Math.max(1, ...trend.map((item) => item.value));
    const ceiling =
      maxValue <= 5
        ? 5
        : Math.ceil(maxValue / Math.pow(10, Math.floor(Math.log10(maxValue)))) *
          Math.pow(10, Math.floor(Math.log10(maxValue)));
    const attended = registrations.filter(
      (r) => r.status === "ATTENDED",
    ).length;
    const absent = registrations.filter((r) => r.status === "ABSENT").length;
    const pending = registrations.filter((r) => r.status === "PENDING").length;
    const recorded = attended + absent;
    const percent = recorded ? (attended / recorded) * 100 : null;
    const percentLabel =
      percent === null
        ? "—"
        : percent.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "%";
    const tasks = attendanceTasks();
    const openComplaints = store.complaints.filter(
      (c) => c.status === "OPEN",
    ).length;
    const taskButton = (action, id, icon, label, count, unit) =>
      `<button type="button" class="staff-task" data-action="${action}" data-id="${esc(id)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span><b>${number(count)}</b><span>${unit}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
    const taskItems = [
      tasks.length
        ? taskButton(
            "participants-for",
            tasks[0].id,
            "fa-clipboard-check",
            "บันทึก / ยืนยันผล",
            tasks.length,
            "กิจกรรม",
          )
        : "",
      openComplaints
        ? taskButton(
            "page",
            "complaints",
            "fa-comments",
            "ตอบคำร้อง",
            openComplaints,
            "เรื่อง",
          )
        : "",
    ].join("");
    const taskSection = taskItems
      ? `<section class="staff-tasks" aria-label="งานค้างปัจจุบัน"><h2>งานค้างปัจจุบัน</h2><div class="staff-task-list">${taskItems}</div></section>`
      : '<div class="staff-all-clear"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ไม่มีงานค้าง</div>';
    const ongoing = (w) =>
      +archiveDate(w.start) <= now && +archiveDate(w.end) > now;
    const current = store.workshops
      .filter(
        (w) =>
          !w.cancelled &&
          !w.attendanceFinalizedAt &&
          +archiveDate(w.end) > now &&
          (ongoing(w) || +archiveDate(w.start) > now),
      )
      .sort(
        (a, b) =>
          Number(ongoing(b)) - Number(ongoing(a)) ||
          archiveDate(a.start) - archiveDate(b.start) ||
          a.id.localeCompare(b.id),
      );
    const table = current
      .slice(0, 5)
      .map((w) => {
        const status = ongoing(w)
          ? "ongoing"
          : w.closed
            ? "closed"
            : "upcoming";
        const label = {
          ongoing: "กำลังดำเนินการ",
          closed: "ปิดรับสมัคร",
          upcoming: "กำลังจะมาถึง",
        }[status];
        return `<tr data-workshop-id="${esc(w.id)}"><td data-label="กิจกรรม"><strong>${esc(w.title)}</strong></td><td data-label="วันเวลา"><time datetime="${esc(w.start)}">${esc(archiveDateLabel(w.start))}</time></td><td data-label="ผู้ลงทะเบียน / ที่นั่ง">${number(occupancy(w.id))} / ${number(w.capacity)}</td><td data-label="สถานะ"><span class="staff-phase is-${status}">${label}</span></td><td><button type="button" class="btn small" data-action="participants-for" data-id="${esc(w.id)}" aria-label="ดูผู้เข้าร่วม ${esc(w.title)}">ดูผู้เข้าร่วม</button></td></tr>`;
      })
      .join("");
    const bars = trend
      .map(
        (item) =>
          `<div class="staff-trend-item ${item.value ? "" : "is-zero"}"><button type="button" class="staff-month-bar" data-action="dashboard-month-info" data-label="${esc(item.fullLabel)}" data-count="${item.value}" aria-label="${esc(item.fullLabel)}: ${number(item.value)} รายการ"><span class="staff-trend-bar"><span class="staff-bar-fill" style="height:${(item.value / ceiling) * 100}%"><span class="staff-bar-value">${number(item.value)}</span></span></span></button><span class="staff-month-label">${esc(item.label)}<small>${esc(item.year)}</small></span></div>`,
      )
      .join("");
    const graph = registrations.length
      ? `<div class="staff-trend-plot" data-months="${months}"><div class="staff-chart-axis" aria-hidden="true"><span>${number(ceiling)}</span><span>${number(ceiling / 2)}</span><span>0</span></div><div class="staff-trend-chart" style="--trend-count:${months}" role="group" aria-label="รายการลงทะเบียนรายเดือน">${bars}</div></div><p class="staff-chart-footnote">แตะหรือชี้แท่งกราฟเพื่อดูจำนวนรายการ</p>`
      : '<div class="staff-empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><strong>ยังไม่มีรายการลงทะเบียนในช่วงนี้</strong><span>ข้อมูลจะแสดงเมื่อมีการลงทะเบียน</span></div>';
    const ring = `<div class="staff-donut" role="img" aria-label="${recorded ? `เข้าร่วมแล้ว ${number(attended)} จาก ${number(recorded)} รายการ คิดเป็น ${percentLabel}` : "ยังไม่มีรายการที่บันทึกผลแล้ว"}" style="background:${recorded ? `conic-gradient(var(--staff-attended) 0% ${percent}%, var(--staff-absent) ${percent}% 100%)` : "var(--staff-chart-track)"}"><div class="staff-donut-value"><strong>${percentLabel}</strong><span>${recorded ? "เข้าร่วมจริง" : "ยังไม่มีผล"}</span></div></div>`;
    return `<div class="staff-dashboard"><div class="staff-dashboard-head"><div>${title("STAFF OVERVIEW", "ภาพรวมการอบรม", "ติดตามการลงทะเบียน ผลการเข้าร่วม และงานที่ต้องดำเนินการ")}</div><div class="staff-dashboard-meta"><span class="live-dot" aria-hidden="true"></span><span class="sync" data-sync-status role="status">${esc(context.syncMessage)}</span></div></div>
      ${taskSection}
      <section class="staff-report" aria-label="สรุปการลงทะเบียนและผลเข้าร่วม"><div class="staff-report-heading"><div><h2>สรุปการอบรม</h2><p>${esc(periodLabel)} · นับตามวันที่ลงทะเบียน · ไม่รวมรายการที่ยกเลิก</p></div><label class="staff-period-label" for="dashboard-period">ช่วงข้อมูลของทั้ง 2 กราฟ<select id="dashboard-period"><option value="6" ${months === 6 ? "selected" : ""}>6 เดือนล่าสุด</option><option value="12" ${months === 12 ? "selected" : ""}>12 เดือนล่าสุด</option></select></label></div>
      <div class="staff-dashboard-grid"><section class="panel staff-trend-panel" aria-labelledby="staff-trend-heading"><div class="staff-panel-heading"><div><h3 id="staff-trend-heading">การลงทะเบียนรายเดือน</h3><p>รวม <strong class="staff-registration-total">${number(registrations.length)}</strong> รายการในช่วงที่เลือก</p></div><span class="staff-chart-unit">หน่วย: รายการ</span></div>${graph}</section>
      <section class="panel staff-donut-panel" aria-labelledby="staff-outcome-heading"><div class="staff-panel-heading"><div><h3 id="staff-outcome-heading">ผลการเข้าร่วม</h3><p>เฉพาะรายการที่บันทึกผลแล้ว</p></div></div>${ring}${recorded ? `<dl class="staff-outcome-legend"><div><dt><i class="is-attended" aria-hidden="true"></i>เข้าร่วมแล้ว</dt><dd>${number(attended)} <small>รายการ</small></dd></div><div><dt><i class="is-absent" aria-hidden="true"></i>ไม่เข้าร่วม</dt><dd>${number(absent)} <small>รายการ</small></dd></div></dl><p class="staff-chart-footnote">คำนวณจาก ${number(recorded)} รายการที่มีผลแล้ว</p>` : '<p class="staff-outcome-empty">ยังคำนวณอัตราเข้าร่วมไม่ได้</p>'}${pending ? `<p class="staff-outcome-pending">ยังไม่มีผลการเข้าร่วม ${number(pending)} รายการ<br><span>ไม่นำมาคำนวณเปอร์เซ็นต์</span></p>` : ""}</section></div></section>
      <details class="staff-activity-details" id="staff-upcoming-details" ${state.dashboardAgendaOpen ? "open" : ""}><summary><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> กิจกรรมปัจจุบันและกิจกรรมถัดไป</span><span class="staff-activity-count">${number(current.length)} กิจกรรม</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="staff-activity-content"><div class="staff-activity-toolbar"><span>ข้อมูลปัจจุบัน${current.length > 5 ? ` · แสดง 5 จาก ${number(current.length)} กิจกรรม` : ""}</span><button class="btn small" data-action="page" data-id="manage">จัดการเวิร์กช็อปทั้งหมด</button></div>${table ? `<div class="staff-table-wrap"><table class="staff-table"><thead><tr><th scope="col">กิจกรรม</th><th scope="col">วันเวลา</th><th scope="col">ผู้ลงทะเบียน / ที่นั่ง</th><th scope="col">สถานะ</th><th scope="col"><span class="staff-sr-only">เปิดรายชื่อ</span></th></tr></thead><tbody>${table}</tbody></table></div>` : '<p class="staff-empty-note">ยังไม่มีกิจกรรมปัจจุบันหรือกิจกรรมถัดไป</p>'}</div></details></div>`;
  }

  function downloadCsv(filename, rows) {
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const managementStatuses = [
    ["ongoing", "กำลังดำเนินการ"],
    ["upcoming", "กำลังจะมาถึง"],
    ["closed", "ปิดรับสมัคร"],
    ["finished", "เสร็จสิ้นแล้ว"],
  ];

  const managementStatusLabel = (status) =>
    status === "cancelled"
      ? "ยกเลิกกิจกรรม"
      : managementStatuses.find(([value]) => value === status)?.[1] ||
        "ทุกสถานะ";

  function deletedWorkshopRecords() {
    if (!staff()) return [];
    const calendar = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return (store.auditLog || [])
      .filter(
        (entry) => entry.action === "delete" && entry.entity === "workshops",
      )
      .map((entry) => ({
        id: entry.id || `deleted-${entry.entityId}-${entry.createdAt}`,
        workshopId: entry.entityId,
        title:
          entry.workshop?.title ||
          `เวิร์กช็อปที่ลบแล้ว (รหัส ${entry.entityId})`,
        place: entry.workshop?.place || "",
        deletedAt: entry.createdAt || "",
        deletedDate: Number.isFinite(Date.parse(entry.createdAt))
          ? calendar.format(new Date(entry.createdAt))
          : "",
        deletedBy: entry.actorName || "ไม่ทราบผู้ดำเนินการ",
        workshop: entry.workshop || null,
      }));
  }

  function deletedWorkshopsTable(list) {
    return `<div class="manage-table-wrap"><table class="manage-table manage-deleted-table"><caption class="sr-only">ประวัติกิจกรรมที่ลบไปแล้ว สำหรับแอดมิน</caption><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">ลบเมื่อ</th><th scope="col">ลบโดย</th><th scope="col"><span class="sr-only">รายละเอียดประวัติ</span></th></tr></thead><tbody>${list.map((record) => `<tr class="manage-workshop-row manage-deleted-row" data-workshop-id="${esc(record.workshopId)}"><td><button class="manage-workshop-title" data-action="deleted-workshop-detail" data-id="${esc(record.id)}">${esc(record.title)}</button>${!record.workshop ? '<span class="manage-time">บันทึกเก่า · มีเฉพาะรหัสกิจกรรม</span>' : ""}</td><td>${record.deletedAt ? `<time datetime="${esc(record.deletedAt)}">${esc(fmt(record.deletedAt))}</time>` : "ไม่ทราบวันที่"}</td><td><span class="manage-deleted-actor">${esc(record.deletedBy)}</span></td><td><div class="manage-row-actions"><button class="btn small manage-participants" data-action="deleted-workshop-detail" data-id="${esc(record.id)}">ดูประวัติ</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function deletedWorkshopDetail(id) {
    const record = deletedWorkshopRecords().find((entry) => entry.id === id);
    if (!record) return toast("ไม่พบประวัติกิจกรรมนี้");
    const w = record.workshop;
    const fields = [
      ["รหัสกิจกรรม", record.workshopId],
      ["ลบเมื่อ", record.deletedAt ? fmt(record.deletedAt) : "ไม่ทราบวันที่"],
      ["ลบโดย", record.deletedBy],
      ...(w
        ? [
            ["วันจัดกิจกรรมเดิม", `${fmt(w.start)} – ${fmt(w.end)}`],
            ["สถานที่เดิม", w.place],
            [
              "ผู้สมัครก่อนลบ",
              `${w.registrationCount} / ${w.capacity} ที่นั่ง`,
            ],
            ["จำนวนชั่วโมงเดิม", `${w.hours} ชั่วโมง`],
          ]
        : []),
    ];
    openModal(
      "ประวัติกิจกรรมที่ลบไปแล้ว",
      `<p class="manage-deleted-title">${esc(record.title)}</p><dl class="account-details">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value || "—")}</dd></div>`).join("")}</dl>${w ? '<p class="sub">เก็บไว้เป็นประวัติการลบสำหรับแอดมิน</p>' : '<div class="notice">บันทึกเก่านี้ไม่ได้เก็บชื่อและรายละเอียดกิจกรรมไว้ จึงแสดงได้เฉพาะรหัสและข้อมูลการลบที่มีอยู่</div>'}<button type="button" class="btn" data-action="close">ปิด</button>`,
    );
  }

  function managementTable(list, grouped, showRowStatus) {
    let lastStatus = null;
    const rows = list
      .map((w) => {
        const status = phase(w);
        const group =
          grouped && status !== lastStatus
            ? `<tr class="manage-group-row"><th colspan="4" scope="colgroup"><span class="manage-status manage-status-${status}">${managementStatusLabel(status)}</span></th></tr>`
            : "";
        lastStatus = status;
        const starts = new Date(w.start);
        const date = starts.toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const time = starts.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const enrolled = occupancy(w.id);
        return `${group}<tr class="manage-workshop-row" data-workshop-id="${esc(w.id)}">
        <td><button class="manage-workshop-title" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.title)}</button>${+archiveDate(w.end) < Date.now() ? `<span class="manage-time">${w.attendanceFinalizedAt ? "ยืนยันผลแล้ว" : attendanceStats(w).pending ? `รอบันทึกผล ${number(attendanceStats(w).pending)} คน` : "บันทึกครบแล้ว · รอยืนยันผล"}</span>` : ""}${showRowStatus ? `<span class="manage-status manage-status-${status} manage-row-status">${managementStatusLabel(status)}</span>` : ""}</td>
        <td><time datetime="${esc(w.start)}">${esc(date)}</time><span class="manage-time">${esc(time)} น.</span></td>
        <td><span class="manage-seat-count" aria-label="ผู้สมัคร ${enrolled} จาก ${w.capacity} ที่นั่ง"><b>${number(enrolled)}</b><span> / ${number(w.capacity)}</span></span>${enrolled >= w.capacity ? '<small class="manage-full">เต็มแล้ว</small>' : ""}</td>
        <td><div class="manage-row-actions"><button class="btn small manage-participants" data-action="participants-for" data-id="${esc(w.id)}" aria-label="ดูผู้เข้าร่วม ${esc(w.title)}">ผู้เข้าร่วม</button><button class="manage-more" data-action="workshop-menu" data-id="${esc(w.id)}" aria-label="จัดการเวิร์กช็อป ${esc(w.title)}" aria-haspopup="menu" aria-expanded="false" aria-controls="workshop-actions-menu"><span aria-hidden="true">⋯</span></button></div></td>
      </tr>`;
      })
      .join("");
    return `<div class="manage-table-wrap"><table class="manage-table"><caption class="sr-only">รายการเวิร์กช็อปตามตัวกรองที่เลือก</caption><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">วันจัด</th><th scope="col">ผู้สมัคร / ที่นั่ง</th><th scope="col"><span class="sr-only">จัดการ</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function managementPagination(total, pages) {
    if (total <= 10 && state.managePageSize === 10) return "";
    const current = state.managePage;
    const first = (current - 1) * state.managePageSize + 1;
    const last = Math.min(current * state.managePageSize, total);
    const choices = [...new Set([1, pages, current - 1, current, current + 1])]
      .filter((page) => page > 0 && page <= pages)
      .sort((a, b) => a - b);
    let previous = 0;
    const links = choices
      .map((page) => {
        const gap =
          previous && page - previous > 1
            ? '<span class="manage-page-gap" aria-hidden="true">…</span>'
            : "";
        previous = page;
        return `${gap}<button type="button" data-action="manage-page" data-id="${page}" aria-label="หน้า ${page}" ${page === current ? 'aria-current="page"' : ""}>${page}</button>`;
      })
      .join("");
    return `<div class="manage-pagination"><span class="manage-range" role="status">แสดง ${number(first)}–${number(last)} จาก ${number(total)} รายการ</span><label class="manage-page-size">ต่อหน้า <select id="manage-page-size" aria-label="จำนวนเวิร์กช็อปต่อหน้า">${[10, 25, 50].map((size) => `<option value="${size}" ${size === state.managePageSize ? "selected" : ""}>${size}</option>`).join("")}</select></label><nav class="manage-page-links" aria-label="หน้ารายการเวิร์กช็อป"><button type="button" data-action="manage-page" data-id="${current - 1}" aria-label="หน้าก่อนหน้า" ${current === 1 ? "disabled" : ""}>‹</button>${links}<button type="button" data-action="manage-page" data-id="${current + 1}" aria-label="หน้าถัดไป" ${current === pages ? "disabled" : ""}>›</button></nav></div>`;
  }

  function managedWorkshops() {
    const viewingDeleted = state.manageView === "deleted";
    const query = state.search.trim().toLowerCase();
    const history = deletedWorkshopRecords();
    const deleted = history.filter(
      (record) =>
        (!query ||
          `${record.title} ${record.place} ${record.deletedBy} ${record.workshopId}`
            .toLowerCase()
            .includes(query)) &&
        (!state.dateFrom || record.deletedDate >= state.dateFrom) &&
        (!state.dateTo || record.deletedDate <= state.dateTo),
    );
    const base = store.workshops.filter(
      (w) =>
        (!query || `${w.title} ${w.place}`.toLowerCase().includes(query)) &&
        (!state.dateFrom || w.start.slice(0, 10) >= state.dateFrom) &&
        (!state.dateTo || w.start.slice(0, 10) <= state.dateTo),
    );
    const filtered = viewingDeleted
      ? deleted
      : base.filter((w) => state.filter === "all" || phase(w) === state.filter);
    const rank = Object.fromEntries(
      managementStatuses.map(([value], index) => [value, index]),
    );
    filtered.sort((a, b) => {
      if (viewingDeleted) {
        const difference =
          (Date.parse(a.deletedAt) || 0) - (Date.parse(b.deletedAt) || 0);
        return (
          (state.manageSort === "oldest" ? difference : -difference) ||
          a.id.localeCompare(b.id)
        );
      }
      const dateDifference = +new Date(a.start) - +new Date(b.start);
      const tie =
        a.title.localeCompare(b.title, "th") || a.id.localeCompare(b.id);
      if (state.manageSort === "newest") return -dateDifference || tie;
      if (state.manageSort === "oldest") return dateDifference || tie;
      return (
        (rank[phase(a)] ?? 4) - (rank[phase(b)] ?? 4) ||
        (["ongoing", "upcoming"].includes(phase(a))
          ? dateDifference
          : -dateDifference) ||
        tie
      );
    });
    const pages = Math.max(
      1,
      Math.ceil(filtered.length / state.managePageSize),
    );
    state.managePage = Math.max(1, Math.min(state.managePage, pages));
    const shown = filtered.slice(
      (state.managePage - 1) * state.managePageSize,
      state.managePage * state.managePageSize,
    );
    const grouped =
      !viewingDeleted &&
      state.filter === "all" &&
      state.manageSort === "priority";
    const hasFilters = Boolean(
      query ||
      (!viewingDeleted && state.filter !== "all") ||
      state.dateFrom ||
      state.dateTo,
    );
    const dateLabel = (date) =>
      new Date(`${date}T00:00`).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    const context = [
      query ? `ค้นหา “${state.search.trim()}”` : "",
      state.dateFrom
        ? `${viewingDeleted ? "ลบตั้งแต่" : "เริ่มตั้งแต่"} ${dateLabel(state.dateFrom)}`
        : "",
      state.dateTo ? `ถึง ${dateLabel(state.dateTo)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const sortOptions = viewingDeleted
      ? [
          ["priority", "วันที่ลบล่าสุดก่อน"],
          ["oldest", "วันที่ลบเก่าสุดก่อน"],
        ]
      : [
          ["priority", "สถานะและวันเริ่ม"],
          ["newest", "วันเริ่มล่าสุดก่อน"],
          ["oldest", "วันเริ่มเก่าสุดก่อน"],
        ];
    const selectedSort =
      viewingDeleted && state.manageSort === "newest"
        ? "priority"
        : state.manageSort;
    const emptyTitle = viewingDeleted
      ? hasFilters && history.length
        ? "ไม่พบประวัติที่ตรงกับตัวกรอง"
        : "ยังไม่มีประวัติการลบ"
      : store.workshops.length
        ? "ไม่พบเวิร์กช็อปที่ตรงกับตัวกรอง"
        : "ยังไม่มีเวิร์กช็อป";
    return `<section class="manage-view" data-management-view="${viewingDeleted ? "deleted" : "current"}">
      ${title("WORKSHOP MANAGEMENT", "จัดการเวิร์กช็อป", "ค้นหา ติดตามสถานะ และจัดการกิจกรรมของคุณ", '<button class="btn primary" data-action="add-workshop"><i class="fa-solid fa-plus" aria-hidden="true"></i> เพิ่มเวิร์กช็อป</button>')}
      <nav class="manage-view-switch" aria-label="มุมมองรายการเวิร์กช็อป"><button type="button" data-action="manage-view" data-id="current" aria-pressed="${!viewingDeleted}">กิจกรรมปัจจุบัน</button><button type="button" data-action="manage-view" data-id="deleted" aria-pressed="${viewingDeleted}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ประวัติการลบ</button></nav>
      <section class="manage-filters" aria-label="ค้นหาและกรองเวิร์กช็อป"><div class="manage-filter-row"><div class="manage-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="search" type="search" aria-label="ค้นหาเวิร์กช็อป" placeholder="${viewingDeleted ? "ค้นหาชื่อกิจกรรม รหัส หรือผู้ลบ" : "ค้นหาชื่อเวิร์กช็อปหรือสถานที่"}" value="${esc(state.search)}"></div>${viewingDeleted ? "" : `<select id="phase-filter" aria-label="สถานะกิจกรรม"><option value="all" ${state.filter === "all" ? "selected" : ""}>ทุกสถานะ</option>${managementStatuses.map(([value, label]) => `<option value="${value}" ${state.filter === value ? "selected" : ""}>${label}</option>`).join("")}</select>`}
      <div id="manage-date-panel" class="manage-date-panel" role="group" aria-label="${viewingDeleted ? "กรองตามวันที่ลบ" : "กรองตามวันเริ่มกิจกรรม"}">${dateRangeField()}</div></div></section>
      <section class="manage-results" id="manage-results" tabindex="-1" aria-label="ผลการค้นหาเวิร์กช็อป"><div class="manage-results-heading"><div><h2>${viewingDeleted ? "กิจกรรมที่ลบไปแล้ว" : state.filter === "all" ? "รายการเวิร์กช็อป" : `<span class="manage-status manage-status-${esc(state.filter)}">${managementStatusLabel(state.filter)}</span>`}<span class="manage-result-count">${number(filtered.length)} รายการ</span></h2><p class="manage-result-context">${esc(context)}</p></div><div class="manage-results-tools">${hasFilters ? '<button class="manage-reset" data-action="reset-manage-filters">ล้างตัวกรอง</button>' : ""}<label class="manage-sort-label">เรียงตาม <select id="manage-sort" aria-label="เรียงลำดับเวิร์กช็อป">${sortOptions
        .map(
          ([value, label]) =>
            `<option value="${value}" ${selectedSort === value ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label></div></div>
      ${filtered.length ? (viewingDeleted ? deletedWorkshopsTable(shown) : managementTable(shown, grouped, state.filter === "all" && !grouped)) + managementPagination(filtered.length, pages) : `<div class="manage-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><h3>${emptyTitle}</h3><p>${viewingDeleted ? "รายการที่ลบจะถูกเก็บเป็นประวัติสำหรับแอดมิน" : store.workshops.length ? "ลองเปลี่ยนคำค้นหา สถานะ หรือช่วงวันที่" : "เพิ่มเวิร์กช็อปแรกเพื่อเริ่มรับผู้เข้าร่วม"}</p>${hasFilters ? '<button class="btn" data-action="reset-manage-filters">ล้างตัวกรอง</button>' : ""}</div>`}
      </section></section>`;
  }

  function closeWorkshopMenu(returnFocus = false) {
    $("#workshop-actions-menu")?.remove();
    if (state.workshopMenuTrigger) {
      state.workshopMenuTrigger.setAttribute("aria-expanded", "false");
      if (returnFocus && state.workshopMenuTrigger.isConnected)
        state.workshopMenuTrigger.focus();
    }
    state.workshopMenuTrigger = null;
  }

  function mountActionMenu(button, content, label) {
    const menu = document.createElement("div");
    menu.id = "workshop-actions-menu";
    menu.className = "workshop-actions-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    menu.innerHTML = content;
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect?.() || {
      right: 230,
      bottom: 100,
      top: 56,
    };
    const height =
      menu.getBoundingClientRect?.().height ||
      menu.querySelectorAll("button").length * 44 + 16;
    menu.style.left = `${Math.max(12, Math.min(rect.right - 224, (window.innerWidth || 1024) - 236))}px`;
    menu.style.top = `${Math.max(12, rect.bottom + height + 8 > (window.innerHeight || 768) ? rect.top - height - 8 : rect.bottom + 8)}px`;
    state.workshopMenuTrigger = button;
    button.setAttribute("aria-expanded", "true");
    menu.querySelector("button:not([disabled])")?.focus();
    return menu;
  }

  function openWorkshopMenu(button) {
    if (state.workshopMenuTrigger === button) return closeWorkshopMenu(true);
    closeWorkshopMenu();
    const w = store.workshops.find((item) => item.id === button.dataset.id);
    if (!w || !staff()) return;
    const item = (action, icon, label, danger = false) =>
      `<button type="button" role="menuitem" class="${danger ? "is-danger" : ""}" data-action="${action}" data-id="${esc(w.id)}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}</button>`;
    const content =
      (w.attendanceFinalizedAt
        ? ""
        : item("edit-workshop", "fa-pen", "แก้ไขเวิร์กช็อป")) +
      (!w.closed && !w.cancelled && scheduledPhase(w) !== "finished"
        ? item("close-workshop", "fa-pause", "ปิดรับสมัคร")
        : "") +
      item("delete-workshop", "fa-trash-can", "ลบเวิร์กช็อป", true);
    mountActionMenu(button, content, `จัดการ ${w.title}`);
  }

  function openAttendanceMenu(button) {
    if (state.workshopMenuTrigger === button) return closeWorkshopMenu(true);
    closeWorkshopMenu();
    const r = store.registrations.find((item) => item.id === button.dataset.id);
    const w = r && store.workshops.find((item) => item.id === r.workshopId);
    if (
      !staff() ||
      !r ||
      !w ||
      r.status === "CANCELLED" ||
      w.attendanceFinalizedAt ||
      context.apiSaveCount
    )
      return;
    const name =
      store.users.find((item) => item.id === r.userId)?.name || "ผู้เข้าร่วม";
    const content = [
      ["attend", "ATTENDED", "circle-check", "เข้าร่วมงาน"],
      ["absent", "ABSENT", "circle-xmark", "ไม่เข้าร่วม"],
    ]
      .map(
        ([action, status, symbol, label]) =>
          `<button type="button" role="menuitemradio" aria-checked="${r.status === status}" class="attendance-menu-item ${status === "ABSENT" ? "is-absent" : ""}" data-action="${action}" data-id="${esc(r.id)}" ${r.status === status ? "disabled" : ""}><i class="fa-regular fa-${symbol}" aria-hidden="true"></i><span>${label}</span>${r.status === status ? '<i class="fa-solid fa-check attendance-current" aria-hidden="true"></i>' : ""}</button>`,
      )
      .join("");
    mountActionMenu(button, content, `บันทึกผลการเข้าร่วม ${name}`);
  }

  function participantsV2() {
    const selectedWorkshop = store.workshops.find(
      (w) => w.id === state.participantWorkshop,
    );
    const query = state.participantQuery.toLowerCase();
    const list = store.registrations.filter((r) => {
      const u = store.users.find((x) => x.id === r.userId);
      return (
        (state.participantWorkshop === "all" ||
          r.workshopId === state.participantWorkshop) &&
        (state.participantStatus === "all" ||
          r.status === state.participantStatus) &&
        (!query ||
          `${u?.name || ""} ${u?.code || ""} ${u?.email || ""}`
            .toLowerCase()
            .includes(query))
      );
    });
    return `${title("PARTICIPANT LIST", "รายชื่อผู้เข้าร่วมอบรม", "ค้นหา กรอง และบันทึกผลการเข้าร่วมจากรายการจริง")}${attendancePanel(selectedWorkshop)}<div class="staff-work-toolbar staff-filter-grid participants-filter-grid"><input id="participant-search" type="search" aria-label="ค้นหาผู้เข้าร่วม" placeholder="ค้นหาชื่อหรือรหัสนักศึกษา" value="${esc(state.participantQuery)}"><select id="participant-filter" aria-label="เลือกเวิร์กช็อป"><option value="all">ทุกเวิร์กช็อป</option>${store.workshops.map((w) => `<option value="${w.id}" ${state.participantWorkshop === w.id ? "selected" : ""}>${esc(w.title)} · ${esc(fmt(w.start))}${w.attendanceFinalizedAt ? " · ยืนยันผลแล้ว" : ""}</option>`).join("")}</select><select id="participant-status" aria-label="กรองสถานะ"><option value="all" ${state.participantStatus === "all" ? "selected" : ""}>ทุกสถานะ</option><option value="PENDING" ${state.participantStatus === "PENDING" ? "selected" : ""}>รอบันทึกผล</option><option value="ATTENDED" ${state.participantStatus === "ATTENDED" ? "selected" : ""}>เข้าร่วมแล้ว</option><option value="ABSENT" ${state.participantStatus === "ABSENT" ? "selected" : ""}>ไม่เข้าร่วม</option><option value="CANCELLED" ${state.participantStatus === "CANCELLED" ? "selected" : ""}>ยกเลิก</option></select><button class="btn small staff-filter-export" data-action="export-participants"><i class="fa-solid fa-download" aria-hidden="true"></i> Export CSV</button></div>${
      list.length
        ? `<div class="panel tablewrap participants-table-wrap"><table class="participants-table"><caption class="sr-only">รายชื่อผู้เข้าร่วม กดป้ายสถานะเพื่อเลือกผลการเข้าร่วม</caption><thead><tr><th>ลำดับ</th><th>ชื่อ-นามสกุล</th><th>รหัสประจำตัว</th><th>สถานะ <span class="participant-status-hint">กดเพื่อบันทึกผล</span></th></tr></thead><tbody>${list
            .map((r, i) => {
              const u = store.users.find((x) => x.id === r.userId);
              const finalized = store.workshops.find(
                (w) => w.id === r.workshopId,
              )?.attendanceFinalizedAt;
              const status =
                finalized || r.status === "CANCELLED"
                  ? `${badge(r.status)}${finalized ? '<span class="participant-locked"><i class="fa-solid fa-lock" aria-hidden="true"></i> ยืนยันผลแล้ว</span>' : ""}`
                  : `<button type="button" class="participant-status-trigger" data-action="attendance-menu" data-id="${esc(r.id)}" aria-label="บันทึกผลการเข้าร่วม ${esc(u?.name || "ผู้เข้าร่วม")}" aria-haspopup="menu" aria-expanded="false" aria-controls="workshop-actions-menu" ${context.apiSaveCount ? "disabled" : ""}>${badge(r.status)}<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>`;
              return `<tr><td>${i + 1}</td><td><b>${esc(u?.name || "ไม่พบข้อมูล")}</b></td><td>${esc(u?.code || "—")}</td><td>${status}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : empty("ยังไม่มีรายชื่อที่ตรงกับตัวกรอง")
    }`;
  }

  const archiveMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];

  function attendanceStats(w) {
    const rows = store.registrations.filter(
      (r) => r.workshopId === w.id && r.status !== "CANCELLED",
    );
    const pending = rows.filter(
      (r) => !["ATTENDED", "ABSENT"].includes(r.status),
    ).length;
    return { total: rows.length, pending, completed: rows.length - pending };
  }

  function attendanceTasks() {
    return pastWorkshops()
      .filter((w) => !w.attendanceFinalizedAt)
      .reverse();
  }

  function attendancePanel(w) {
    if (w?.attendanceFinalizedAt)
      return `<section class="attendance-panel is-complete"><div><h2>ยืนยันผลและเก็บเข้าประวัติแล้ว</h2><p>${esc(w.title)} · ${esc(archiveDateLabel(w.start))} · อ่านอย่างเดียว</p></div></section>`;
    if (w && +archiveDate(w.end) <= Date.now()) {
      const { total, pending, completed } = attendanceStats(w);
      return `<section class="attendance-panel"><div><h2>${pending ? `รอบันทึกผลอีก ${number(pending)} คน` : "บันทึกผลครบแล้ว รอยืนยัน"}</h2><p>${esc(w.title)} · ${esc(archiveDateLabel(w.start))}</p><p>บันทึกแล้ว ${number(completed)} / ${number(total)} คน · ไม่นับรายการที่ยกเลิกลงทะเบียน${!total ? " · ไม่มีผู้ลงทะเบียนที่ต้องบันทึกผล" : ""}</p></div><div class="attendance-actions">${pending ? `<button class="btn small" data-action="attendance-pending" data-id="${esc(w.id)}">ดูรายชื่อที่ยังค้าง</button>` : ""}<button class="btn small primary" data-action="finalize-attendance" data-id="${esc(w.id)}" ${pending || context.apiSaveCount ? "disabled" : ""}>ยืนยันผลและเก็บเข้าประวัติ</button></div></section>`;
    }
    const tasks = attendanceTasks();
    return tasks.length
      ? `<section class="attendance-panel"><div><h2>มี ${number(tasks.length)} เวิร์กช็อปรอบันทึกหรือยืนยันผล</h2><p>กิจกรรมที่จบแล้วต้องระบุผลให้ครบทุกคนก่อนเก็บเข้าประวัติ</p></div><button class="btn small" data-action="participants-for" data-id="${esc(tasks[0].id)}">เปิดงานที่รอดำเนินการ</button></section>`
      : "";
  }

  function archivedWorkshops() {
    return pastWorkshops().filter(
      (w) => w.attendanceFinalizedAt && attendanceStats(w).pending === 0,
    );
  }

  function archiveDate(value) {
    const text = String(value || "");
    return new Date(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)
        ? text + "+07:00"
        : text,
    );
  }

  function archivePeriod(w) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "numeric",
    }).formatToParts(archiveDate(w.start));
    return Object.fromEntries(
      parts
        .filter((p) => ["year", "month"].includes(p.type))
        .map((p) => [p.type, Number(p.value)]),
    );
  }

  function archiveDateLabel(value) {
    return archiveDate(value).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function pastWorkshops() {
    return store.workshops
      .filter(
        (w) =>
          !w.cancelled &&
          Number.isFinite(+archiveDate(w.start)) &&
          +archiveDate(w.end) < Date.now(),
      )
      .sort(
        (a, b) =>
          archiveDate(b.start) - archiveDate(a.start) ||
          a.id.localeCompare(b.id),
      );
  }

  function archiveHash() {
    const params = new URLSearchParams();
    if (state.archiveYear) params.set("year", state.archiveYear);
    if (state.archiveMonth !== "all") params.set("month", state.archiveMonth);
    if (state.archiveWorkshop) params.set("workshop", state.archiveWorkshop);
    return "#archive" + (params.size ? "?" + params : "");
  }

  function archiveReplaceRoute() {
    window.history?.replaceState?.(null, "", archiveHash());
  }

  function archivePagination(total, roster = false) {
    const key = roster ? "archiveParticipantPage" : "archivePage";
    const pages = Math.max(1, Math.ceil(total / 10));
    state[key] = Math.max(1, Math.min(state[key], pages));
    const current = state[key];
    if (!total) return "";
    return `<div class="manage-pagination"><span class="manage-range" role="status">แสดง ${number((current - 1) * 10 + 1)}–${number(Math.min(current * 10, total))} จาก ${number(total)} รายการ</span><nav class="manage-page-links" aria-label="หน้ารายการย้อนหลัง"><button type="button" data-action="archive-page" data-id="${current - 1}" aria-label="หน้าก่อนหน้า" ${current === 1 ? "disabled" : ""}>‹</button><span class="archive-page-number">หน้า ${number(current)} / ${number(pages)}</span><button type="button" data-action="archive-page" data-id="${current + 1}" aria-label="หน้าถัดไป" ${current === pages ? "disabled" : ""}>›</button></nav></div>`;
  }

  function archiveRegistrations(workshopId) {
    const query = state.archiveParticipantQuery.trim().toLowerCase();
    const users = new Map(store.users.map((u) => [u.id, u]));
    return store.registrations
      .filter((r) => {
        const u = users.get(r.userId);
        return (
          r.workshopId === workshopId &&
          (state.archiveParticipantStatus === "all" ||
            r.status === state.archiveParticipantStatus) &&
          (!query ||
            `${u?.name || ""} ${u?.code || ""} ${u?.email || ""}`
              .toLowerCase()
              .includes(query))
        );
      })
      .sort((a, b) => {
        const name = (id) => users.get(id)?.name || "";
        return (
          name(a.userId).localeCompare(name(b.userId), "th") ||
          a.id.localeCompare(b.id)
        );
      });
  }

  function archiveRoster(w) {
    const rows = archiveRegistrations(w.id);
    const pagination = archivePagination(rows.length, true);
    const offset = (state.archiveParticipantPage - 1) * 10;
    const period = archivePeriod(w);
    return `<section class="manage-view archive-view archive-roster"><button type="button" class="archive-back" data-action="archive-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> กลับไปรายการย้อนหลัง</button>
      ${title("WORKSHOP ARCHIVE", esc(w.title), `${archiveMonths[period.month - 1]} พ.ศ. ${period.year + 543} · รายชื่อผู้เข้าร่วมอบรม`, '<span class="archive-readonly"><i class="fa-solid fa-lock" aria-hidden="true"></i> อ่านอย่างเดียว</span>')}
      <div class="archive-context"><div><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${esc(archiveDateLabel(w.start))} – ${esc(archiveDateLabel(w.end))}<br><span class="muted">${esc(w.place || "ไม่ระบุสถานที่")}</span></span></div><button class="btn small" data-action="archive-detail" data-id="${esc(w.id)}">รายละเอียดกิจกรรม</button></div>
      <div class="manage-filters archive-roster-filters"><label class="manage-search"><span class="sr-only">ค้นหาผู้เข้าร่วมย้อนหลัง</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="archive-participant-search" type="search" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value="${esc(state.archiveParticipantQuery)}"></label><label class="archive-field"><span>สถานะการเข้าร่วม</span><select id="archive-participant-status">${[
        ["all", "ทุกสถานะ"],
        ["ATTENDED", "เข้าร่วมแล้ว"],
        ["ABSENT", "ไม่เข้าร่วม"],
        ["CANCELLED", "ยกเลิกการลงทะเบียน"],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${value === state.archiveParticipantStatus ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="btn small" data-action="archive-export" ${!rows.length ? "disabled" : ""}><i class="fa-solid fa-download" aria-hidden="true"></i> ส่งออก CSV</button></div>
      <div class="manage-results-heading"><p>${number(rows.length)} รายชื่อ${state.archiveParticipantStatus !== "all" || state.archiveParticipantQuery ? "ที่ตรงกับตัวกรอง" : ""}</p></div>
      ${
        rows.length
          ? `<div class="panel tablewrap"><table class="archive-roster-table"><thead><tr><th scope="col">ลำดับ</th><th scope="col">ชื่อ–นามสกุล</th><th scope="col">รหัสประจำตัว</th><th scope="col">สถานะการเข้าร่วม</th></tr></thead><tbody>${rows
              .slice(offset, offset + 10)
              .map((r, i) => {
                const u = store.users.find((u) => u.id === r.userId);
                return `<tr><td>${offset + i + 1}</td><td><b>${esc(u?.name || "ไม่พบข้อมูลผู้ใช้งาน")}</b></td><td>${esc(u?.code || "—")}</td><td>${badge(r.status)}</td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : empty("ไม่พบรายชื่อที่ตรงกับตัวกรอง")
      }${pagination}</section>`;
  }

  function workshopArchive() {
    const all = archivedWorkshops();
    const years = [...new Set(all.map((w) => archivePeriod(w).year))].sort(
      (a, b) => b - a,
    );
    const selected = all.find((w) => w.id === state.archiveWorkshop);
    if (selected) return archiveRoster(selected);
    const unfinished = pastWorkshops().find(
      (w) => w.id === state.archiveWorkshop,
    );
    if (unfinished)
      return `<section class="manage-view archive-view">${title("WORKSHOP RESULTS", "กิจกรรมนี้ยังไม่พร้อมเก็บเข้าประวัติ", "กรุณาบันทึกผลให้ครบและยืนยันผลก่อน")}${attendancePanel(unfinished)}<button class="btn" data-action="participants-for" data-id="${esc(unfinished.id)}">ไปหน้าบันทึกผล</button></section>`;
    const missingSelection = !!state.archiveWorkshop;
    state.archiveWorkshop = null;
    if (!years.includes(state.archiveYear)) {
      const currentYear = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
        }).format(new Date()),
      );
      state.archiveYear =
        years.find((year) => year < currentYear) || years[0] || null;
    }
    const yearRows = all.filter(
      (w) => archivePeriod(w).year === state.archiveYear,
    );
    const query = state.archiveQuery.trim().toLowerCase();
    const rows = yearRows.filter(
      (w) =>
        (state.archiveMonth === "all" ||
          archivePeriod(w).month === Number(state.archiveMonth)) &&
        (!query || `${w.title} ${w.place || ""}`.toLowerCase().includes(query)),
    );
    const pagination = archivePagination(rows.length);
    const offset = (state.archivePage - 1) * 10;
    const period = state.archiveYear
      ? `${state.archiveMonth === "all" ? "ทุกเดือน" : archiveMonths[Number(state.archiveMonth) - 1]} · พ.ศ. ${state.archiveYear + 543}`
      : "ยังไม่มีข้อมูลย้อนหลัง";
    const counts = new Map();
    for (const r of store.registrations)
      counts.set(r.workshopId, (counts.get(r.workshopId) || 0) + 1);
    return `<section class="manage-view archive-view">${title("WORKSHOP ARCHIVE", "เวิร์กช็อปย้อนหลัง", "กิจกรรมที่บันทึกผลครบและยืนยันเก็บเข้าประวัติแล้ว")}${attendancePanel()}
      <div class="manage-filters archive-filters"><label class="archive-field"><span>ปีที่จัดกิจกรรม (พ.ศ.)</span><select id="archive-year" ${!years.length ? "disabled" : ""}>${years.length ? years.map((year) => `<option value="${year}" ${year === state.archiveYear ? "selected" : ""}>พ.ศ. ${year + 543}</option>`).join("") : '<option value="">ยังไม่มีข้อมูล</option>'}</select></label><label class="archive-field"><span>เดือนที่เริ่มกิจกรรม</span><select id="archive-month" ${!years.length ? "disabled" : ""}><option value="all" ${state.archiveMonth === "all" ? "selected" : ""}>ทุกเดือน</option>${archiveMonths.map((month, index) => `<option value="${index + 1}" ${state.archiveMonth === String(index + 1) ? "selected" : ""}>${month}</option>`).join("")}</select></label><label class="manage-search"><span class="sr-only">ค้นหาเวิร์กช็อปย้อนหลัง</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="archive-search" type="search" placeholder="ค้นหาชื่อเวิร์กช็อป หรือสถานที่" value="${esc(state.archiveQuery)}"></label></div>
      ${missingSelection ? '<p class="notice" role="status">ไม่พบกิจกรรมย้อนหลังนี้ อาจถูกลบหรือเปลี่ยนแปลงแล้ว</p>' : ""}
      <div class="manage-results-heading"><div><h2>${period}</h2><p>${number(rows.length)} กิจกรรม · เรียงจากวันที่จัดล่าสุด</p></div>${state.archiveMonth !== "all" || query ? '<button class="btn small" data-action="archive-clear">ล้างตัวกรอง</button>' : ""}</div>
      ${
        rows.length
          ? `<div class="panel tablewrap"><table class="manage-table archive-table"><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">วันที่เริ่มกิจกรรม</th><th scope="col">รายชื่อ</th><th scope="col"><span class="sr-only">เปิดรายชื่อ</span></th></tr></thead><tbody>${rows
              .slice(offset, offset + 10)
              .map((w) => {
                const count = counts.get(w.id) || 0;
                return `<tr class="manage-workshop-row" data-workshop-id="${esc(w.id)}"><td><button class="manage-workshop-title" data-action="archive-detail" data-id="${esc(w.id)}">${esc(w.title)}</button><div class="sub">${esc(w.place || "ไม่ระบุสถานที่")}</div></td><td>${esc(archiveDateLabel(w.start))}</td><td>${number(count)} คน</td><td><button class="btn small" data-action="archive-roster" data-id="${esc(w.id)}">ดูรายชื่อ <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : `<div class="archive-empty">${empty(all.length ? "ไม่พบกิจกรรมในช่วงเวลาหรือคำค้นนี้" : "ยังไม่มีเวิร์กช็อปที่ยืนยันผลแล้ว")}${all.length ? '<p class="muted">ลองเลือกปี เดือน หรือเปลี่ยนคำค้นหา</p>' : ""}</div>`
      }${pagination}<p class="archive-footnote">จัดกลุ่มตามวันที่เริ่มกิจกรรม · เวิร์กช็อปที่ถูกลบอยู่ในเมนูจัดการเวิร์กช็อป › ประวัติการลบ</p></section>`;
  }

  function workshopModal(id) {
    if (!staff()) return;
    const w = store.workshops.find((w) => w.id === id);
    openModal(
      w ? "แก้ไขเวิร์กช็อป" : "เพิ่มเวิร์กช็อปใหม่",
      `<form id="workshop-form" class="workshop-editor" data-id="${esc(w?.id || "")}">
        ${input("ชื่อกิจกรรม", "title", "text", `maxlength="180" value="${esc(w?.title || "")}"`)}
        ${input("สถานที่ / ห้องจัดเวิร์กช็อป", "place", "text", `maxlength="180" value="${esc(w?.place || "")}"`)}
        <div class="workshop-numbers-row">
          ${input("จำนวนที่นั่ง", "capacity", "number", `min="1" max="10000" step="1" value="${w?.capacity || 30}"`)}
          ${input("จำนวนชั่วโมงอบรม (หักเวลาพักแล้ว)", "hours", "number", `min="0.5" max="1000" step="0.5" value="${w?.hours || 3}"`)}
        </div>
        <div class="workshop-media-row">
          <div class="workshop-schedule">
            <div class="field"><label for="editor-date-range-trigger">ช่วงวันที่อบรม</label><div class="workshop-range-field">${workshopDateRangeField([w?.start?.slice(0, 10) || "", w?.end?.slice(0, 10) || ""])}</div></div>
            <div class="workshop-time-fields">${workshopTimeField("startTime", "เวลาเริ่ม", w?.start?.slice(11, 16) || "09:00")}${workshopTimeField("endTime", "เวลาสิ้นสุด", w?.end?.slice(11, 16) || "12:00")}</div>
            <input type="hidden" name="startDate" value="${esc(w?.start?.slice(0, 10) || "")}"><input type="hidden" name="endDate" value="${esc(w?.end?.slice(0, 10) || "")}">
            <input type="hidden" name="start" value="${esc(w?.start || "")}"><input type="hidden" name="end" value="${esc(w?.end || "")}">
          </div>
          <div class="field workshop-cover-field"><label for="cover">รูปภาพปก</label><div class="workshop-upload${w?.cover ? " has-preview" : ""}">
            <label class="workshop-cover-image" for="cover"><img class="workshop-cover-preview" alt="ตัวอย่างรูปภาพปก" ${w?.cover ? `src="${esc(w.cover)}"` : "hidden"}></label>
            <label class="workshop-upload-placeholder" for="cover"><i class="fa-regular fa-image" aria-hidden="true"></i><span class="workshop-upload-name">เพิ่มรูปภาพ</span><small>JPG / PNG / WebP<br>ไม่เกิน 3 MB</small></label>
            <div class="workshop-cover-actions"><button type="button" class="workshop-cover-change" data-action="change-workshop-cover" aria-label="เปลี่ยนรูปภาพปก"><i class="fa-solid fa-camera" aria-hidden="true"></i><span>เปลี่ยนรูป</span></button><button type="button" class="workshop-cover-remove" data-action="remove-workshop-cover" aria-label="ลบรูปภาพปก"><i class="fa-regular fa-trash-can" aria-hidden="true"></i><span>ลบรูป</span></button></div>
            <input type="hidden" name="removeCover" value="0"><input type="file" name="cover" id="cover" class="sr-only" accept="image/jpeg,image/png,image/webp">
          </div></div>
        </div>
        <div class="field"><label for="description">คำอธิบายกิจกรรม</label><textarea name="description" id="description" maxlength="1000">${esc(w?.description || "")}</textarea></div>
        <div class="error" id="form-error" role="alert"></div><button class="btn primary" type="submit">บันทึกเวิร์กช็อป</button>
      </form>`,
    );
  }
  function approvalsV2() {
    const query = state.approvalQuery.toLowerCase();
    const list = store.users.filter(
      (u) =>
        u.role === "user" &&
        (state.approvalStatus === "all" || u.status === state.approvalStatus) &&
        (!query ||
          `${u.name} ${u.code} ${u.email} ${u.phone}`
            .toLowerCase()
            .includes(query)),
    );
    return `${title("USER APPROVAL", "อนุมัติผู้ใช้งาน", "ตรวจสอบข้อมูลผู้สมัครใหม่ก่อนเปิดสิทธิ์เข้าใช้งาน")}<div class="staff-work-toolbar staff-filter-grid approvals-filter-grid"><input id="approval-search" type="search" aria-label="ค้นหาผู้สมัคร" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value="${esc(state.approvalQuery)}"><select id="approval-status" aria-label="กรองสถานะ"><option value="WAITING" ${state.approvalStatus === "WAITING" ? "selected" : ""}>รออนุมัติ</option><option value="APPROVED" ${state.approvalStatus === "APPROVED" ? "selected" : ""}>อนุมัติแล้ว</option><option value="REJECTED" ${state.approvalStatus === "REJECTED" ? "selected" : ""}>ปฏิเสธแล้ว</option><option value="all" ${state.approvalStatus === "all" ? "selected" : ""}>ทั้งหมด</option></select><span class="muted staff-filter-summary">${number(list.length)} รายการ</span></div><div class="panel space tablewrap"><table><thead><tr><th>ผู้สมัคร</th><th>ประเภท / รหัส</th><th>ช่องทางติดต่อ</th><th>คณะ / สาขา</th><th>สถานะ / จัดการ</th></tr></thead><tbody>${list.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.type)}<br>${esc(u.code)}</td><td>${esc(u.email || "—")}<br>${esc(u.phone || "—")}</td><td>${esc(u.faculty)}<br><span class="muted">${esc(u.major || "—")}</span></td><td>${badge(u.status)}${u.status === "WAITING" ? `<div class="staff-row-actions"><button class="btn small primary" data-action="approve" data-id="${u.id}">อนุมัติ</button><button class="btn small danger" data-action="reject" data-id="${u.id}">ปฏิเสธ</button></div>` : ""}</td></tr>`).join("") || `<tr><td colspan="5">${empty("ไม่พบผู้สมัครที่ตรงกับตัวกรอง")}</td></tr>`}</tbody></table></div>`;
  }

  return {
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
    staffDashboard,
    workshopArchive,
    workshopModal,
  };
}
