export function createRecordViews(context) {
  const {
    state,
    store,
    esc,
    fmt,
    number,
    hoursOf,
    badge,
    member,
    staff,
    user,
    openModal,
    closeModal,
    askConfirm,
    toast,
    phase,
    occupancy,
    $,
  } = context;
  const pageSize = 10;
  let busy = false;
  const statusLabels = {
    OPEN: "รอเจ้าหน้าที่ตอบ",
    REPLIED: "ตอบกลับแล้ว",
    CLOSED: "ปิดเรื่องแล้ว",
  };
  const registrationLabels = {
    ATTENDED: "เข้าร่วมแล้ว",
    PENDING: "รอเช็กชื่อ",
    ABSENT: "ไม่ได้เข้าร่วม",
    CANCELLED: "ยกเลิกแล้ว",
  };
  const icon = (name) =>
    `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
  const expired = (c) =>
    c.learnerDeletedAt ||
    (c.learnerTrashedAt &&
      Date.parse(c.learnerTrashedAt) + 15 * 86400000 <= Date.now());
  const staffList = () => store.complaints.filter((c) => !c.staffClearedAt);
  const memberList = () =>
    store.complaints.filter((c) => c.userId === state.userId && !expired(c));
  const updated = (c) =>
    Math.max(
      Date.parse(c.createdAt) || 0,
      ...(c.replies || []).map((r) => Date.parse(r.createdAt) || 0),
    );
  const complaintBadge = (c) =>
    `<span class="record-status status-${esc(c.status.toLowerCase())}"><span aria-hidden="true"></span>${statusLabels[c.status] || "รอตรวจสอบ"}</span>`;
  const resultBadge = (r) =>
    `<span class="record-status status-${esc(r.status.toLowerCase())}"><span aria-hidden="true"></span>${registrationLabels[r.status] || esc(r.status)}</span>`;
  const shortDate = (value) => {
    const date = new Date(value);
    return Number.isFinite(+date)
      ? date.toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
  };
  const empty = (heading, text) =>
    `<div class="record-empty">${icon("inbox")}<h3>${heading}</h3><p>${text}</p></div>`;
  const options = (items, selected) =>
    items
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${String(selected) === String(value) ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  function summary(items) {
    return `<dl class="record-summary">${items.map(([label, value, unit, symbol]) => `<div><dt>${icon(symbol)} ${label}</dt><dd>${number(value)}<span>${unit}</span></dd></div>`).join("")}</dl>`;
  }
  function paginate(items, key) {
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = (state[key] = Math.min(
      pages,
      Math.max(1, Number(state[key]) || 1),
    ));
    return {
      rows: items.slice((page - 1) * pageSize, page * pageSize),
      footer: `<div class="record-pagination"><span>${items.length ? `แสดง ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, items.length)} จาก ${number(items.length)} รายการ` : "0 รายการ"}</span><nav aria-label="เปลี่ยนหน้ารายการ"><button type="button" data-action="record-page" data-id="${page - 1}" aria-label="หน้าก่อนหน้า" ${page === 1 ? "disabled" : ""}>${icon("chevron-left")}</button>${Array.from(
        { length: pages },
        (_, i) => i + 1,
      )
        .filter((i) => i === 1 || i === pages || Math.abs(i - page) <= 1)
        .map(
          (i, index, array) =>
            `${index && i - array[index - 1] > 1 ? '<span class="record-page-gap">…</span>' : ""}<button type="button" data-action="record-page" data-id="${i}" ${i === page ? 'aria-current="page"' : ""}>${i}</button>`,
        )
        .join(
          "",
        )}<button type="button" data-action="record-page" data-id="${page + 1}" aria-label="หน้าถัดไป" ${page === pages ? "disabled" : ""}>${icon("chevron-right")}</button></nav></div>`,
    };
  }
  const searchField = (id, value, placeholder) =>
    `<label class="record-search">${icon("magnifying-glass")}<span class="sr-only">${placeholder}</span><input type="search" id="${id}" value="${esc(value || "")}" placeholder="${placeholder}"></label>`;

  function reports() {
    const regs = store.registrations.filter((r) => r.userId === state.userId);
    const workshop = (r) => store.workshops.find((w) => w.id === r.workshopId);
    const years = [
      ...new Set(
        regs.map((r) => workshop(r)?.start?.slice(0, 4)).filter(Boolean),
      ),
    ]
      .sort()
      .reverse();
    const filtered = regs
      .filter((r) => {
        const w = workshop(r);
        return (
          (state.reportStatus === "all" || r.status === state.reportStatus) &&
          (state.reportYear === "all" ||
            w?.start?.startsWith(state.reportYear)) &&
          (!state.reportQuery ||
            `${w?.title || ""} ${w?.place || ""}`
              .toLowerCase()
              .includes(state.reportQuery.toLowerCase()))
        );
      })
      .sort(
        (a, b) =>
          (Date.parse(workshop(b)?.start) || 0) -
          (Date.parse(workshop(a)?.start) || 0),
      );
    const { rows, footer } = paginate(filtered, "reportPage");
    return `${context.title("", "รายงานผลและชั่วโมงอบรม", "ตรวจสอบผลการเข้าร่วมและชั่วโมงที่ได้รับในแต่ละกิจกรรม")}<section class="record-page">${summary(
      [
        [
          "ชั่วโมงสะสมทั้งหมด",
          regs.reduce((sum, r) => sum + hoursOf(r), 0),
          "ชั่วโมง",
          "clock",
        ],
        [
          "เข้าร่วมแล้ว",
          regs.filter((r) => r.status === "ATTENDED").length,
          "กิจกรรม",
          "circle-check",
        ],
        [
          "รอเช็กชื่อ",
          regs.filter((r) => r.status === "PENDING").length,
          "กิจกรรม",
          "hourglass-half",
        ],
      ],
    )}<section class="record-surface"><div class="record-toolbar report-toolbar">${searchField("report-search", state.reportQuery, "ค้นหาชื่อเวิร์กช็อปหรือสถานที่")}<label class="record-filter"><span>ปีที่จัด</span><select id="report-year">${options([["all", "ทุกปี"], ...years.map((y) => [y, Number(y) + 543])], state.reportYear)}</select></label><label class="record-filter"><span>ผลการเข้าร่วม</span><select id="report-status">${options([["all", "ทุกสถานะ"], ...Object.entries(registrationLabels)], state.reportStatus)}</select></label></div><div class="record-section-heading"><h2>ประวัติการอบรม</h2><span>${number(filtered.length)} รายการ</span></div>${
      rows.length
        ? `<table class="report-table"><thead><tr><th scope="col">เวิร์กช็อป</th><th scope="col">วันที่จัด</th><th scope="col">ผลการเข้าร่วม</th><th scope="col">ชั่วโมงที่ได้รับ</th><th scope="col"><span class="sr-only">รายละเอียด</span></th></tr></thead><tbody>${rows
            .map((r) => {
              const w = workshop(r);
              return `<tr class="report-record-row"><td data-label="เวิร์กช็อป"><button type="button" class="record-title" data-action="report-detail" data-id="${esc(r.id)}">${esc(w?.title || "ไม่พบข้อมูลกิจกรรม")}</button><span class="record-subtext">${esc(w?.place || "—")}</span></td><td data-label="วันที่จัด"><time datetime="${esc(w?.start || "")}">${esc(shortDate(w?.start))}</time></td><td data-label="ผลการเข้าร่วม">${resultBadge(r)}</td><td data-label="ชั่วโมงที่ได้รับ" class="report-hours">${r.status === "ATTENDED" ? `${number(hoursOf(r))}<small> ชม.</small>` : '<span class="record-dash">—</span>'}</td><td><button type="button" class="record-open" data-action="report-detail" data-id="${esc(r.id)}" aria-label="ดูรายละเอียด ${esc(w?.title || "กิจกรรม")}">${icon("arrow-up-right-from-square")}</button></td></tr>`;
            })
            .join("")}</tbody></table>`
        : empty(
            "ไม่พบรายการอบรม",
            regs.length
              ? "ลองเปลี่ยนคำค้นหา ปี หรือสถานะที่เลือก"
              : "เริ่มต้นเข้าร่วมกิจกรรมได้ที่หน้าค้นหาเวิร์กช็อป",
          )
    }${footer}</section></section>`;
  }
  function reportDetail(id) {
    if (!member()) return;
    const r = store.registrations.find(
      (row) => row.id === id && row.userId === state.userId,
    );
    const w = r && store.workshops.find((row) => row.id === r.workshopId);
    if (!r || !w) return toast("ไม่พบข้อมูลกิจกรรมนี้");
    openModal(
      "รายละเอียดผลการอบรม",
      `<article class="record-dialog"><div class="record-detail-heading">${resultBadge(r)}<h3>${esc(w.title)}</h3><p>${esc(w.description || "ไม่มีรายละเอียดเพิ่มเติม")}</p></div><div class="record-earned"><span>ชั่วโมงที่ได้รับ</span><strong>${number(hoursOf(r))}<small> ชั่วโมง</small></strong></div><dl class="record-detail-grid"><div><dt>เริ่มกิจกรรม</dt><dd>${esc(fmt(w.start))}</dd></div><div><dt>สิ้นสุดกิจกรรม</dt><dd>${esc(fmt(w.end))}</dd></div><div><dt>สถานที่</dt><dd>${esc(w.place)}</dd></div><div><dt>ชั่วโมงอบรม</dt><dd>${number(w.hours)} ชั่วโมง</dd></div></dl>${r.status === "PENDING" ? '<p class="record-hint">ชั่วโมงจะเพิ่มเมื่อเจ้าหน้าที่บันทึกว่าเข้าร่วมแล้ว</p>' : ""}<p class="record-update">อัปเดต ${esc(fmt(r.updatedAt))}</p><div class="record-detail-actions">${r.status === "PENDING" ? `<button type="button" class="btn small danger" data-action="cancel" data-id="${esc(r.id)}">ยกเลิกการลงทะเบียน</button>` : ""}${r.status === "CANCELLED" ? `<button type="button" class="btn small primary" data-action="enroll" data-id="${esc(w.id)}" ${phase(w) !== "upcoming" || occupancy(w.id) >= w.capacity ? "disabled" : ""}>ลงทะเบียนอีกครั้ง</button>` : ""}${!store.ratings.some((x) => x.eventId === r.ratingEvent) ? `<button type="button" class="btn small" data-action="rate-open" data-id="${esc(r.id)}">ประเมินขั้นตอนลงทะเบียน</button>` : ""}</div></article>`,
    );
  }

  function complaintThread(c) {
    return `<div class="thread-original"><b>เรื่องที่แจ้ง: ${esc(c.issue)}</b><p style="white-space:pre-wrap">${esc(c.detail || "ไม่มีรายละเอียดเพิ่มเติม")}</p><div class="sub">ส่งเมื่อ ${esc(fmt(c.createdAt))}</div></div>${(
      c.replies || []
    )
      .slice()
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map(
        (r) =>
          `<div class="thread-reply"><b>คำตอบจาก ${esc(r.staffName)}</b><p style="white-space:pre-wrap">${esc(r.text)}</p><div class="sub">${esc(fmt(r.createdAt))}</div></div>`,
      )
      .join("")}`;
  }
  function trashDeadline(c) {
    const end = Date.parse(c.learnerTrashedAt) + 15 * 86400000;
    return `ลบจากบัญชีใน ${Math.max(1, Math.ceil((end - Date.now()) / 86400000))} วัน · ${shortDate(end)}`;
  }
  function complaintToolbar(isStaff, trash) {
    return `<div class="record-toolbar complaint-toolbar">${searchField("complaint-search", state.complaintQuery, "ค้นหาหัวข้อหรือข้อความในคำร้อง")}<label class="record-filter"><span>สถานะคำร้อง</span><select id="complaint-status">${options([["all", "ทุกสถานะ"], ...Object.entries(statusLabels)], state.complaintStatus)}</select></label>${!isStaff ? `<button type="button" class="btn record-trash-toggle ${trash ? "is-active" : ""}" data-action="complaint-view" data-id="${trash ? "inbox" : "trash"}">${icon(trash ? "inbox" : "trash-can")} ${trash ? "กลับกล่องคำร้อง" : "ถังขยะ"}${!trash ? `<span>${memberList().filter((c) => c.learnerTrashedAt).length}</span>` : ""}</button>` : ""}</div>`;
  }
  function selectedIds() {
    const allowed = new Set(staffList().map((c) => c.id));
    return (state.complaintSelected = (state.complaintSelected || []).filter(
      (id) => allowed.has(id),
    ));
  }
  function staffComplaintRow(c, selected, selecting) {
    const chosen = selecting && selected.includes(c.id);
    const name =
      c.name || store.users.find((u) => u.id === c.userId)?.name || "ผู้ใช้งาน";
    return `<li class="record-staff-row${chosen ? " is-selected" : ""}"><button type="button" class="complaint-row${c.status === "OPEN" ? " is-pending" : ""}${selecting ? " is-selectable" : ""}" data-action="${selecting ? "complaint-toggle-selection" : "complaint-open"}" data-id="${esc(c.id)}" ${selecting ? `aria-pressed="${chosen}" aria-label="${chosen ? "ยกเลิกเลือก" : "เลือกคำร้อง"} ${esc(c.issue)} จาก ${esc(name)}"` : ""} ${busy ? "disabled" : ""}><span class="complaint-sender"><span class="complaint-avatar" aria-hidden="true">${esc(Array.from(name)[0])}</span><span class="complaint-sender-name">${esc(name)}</span></span><span class="complaint-subject">${esc(c.issue)}</span><span class="complaint-row-status">${complaintBadge(c)}</span><time class="complaint-row-time" datetime="${esc(new Date(updated(c)).toISOString())}">${shortDate(updated(c))}</time>${icon("chevron-right")}${chosen ? `<span class="record-selection-mark" aria-hidden="true">${icon("check")}</span>` : ""}</button></li>`;
  }
  function complaintRows(isStaff) {
    const trash = !isStaff && state.complaintView === "trash";
    const all = isStaff
      ? staffList()
      : memberList().filter((c) => Boolean(c.learnerTrashedAt) === trash);
    const filtered = all
      .filter(
        (c) =>
          (state.complaintStatus === "all" ||
            c.status === state.complaintStatus) &&
          (!state.complaintQuery ||
            `${c.issue} ${c.detail} ${c.name || ""} ${(c.replies || []).map((r) => r.text).join(" ")}`
              .toLowerCase()
              .includes(state.complaintQuery.toLowerCase())),
      )
      .sort((a, b) => updated(b) - updated(a));
    const { rows, footer } = paginate(filtered, "complaintPage");
    const selected = isStaff ? selectedIds() : [];
    const selecting = isStaff && state.complaintSelecting;
    const selection = isStaff
      ? `<div class="record-selection${selecting ? " is-selecting" : ""}"><div class="record-selection-copy"><strong>${selecting ? "เลือกรายการที่ต้องการ Clear" : "จัดการคำร้อง"}</strong><span role="status">${selecting ? `เลือกแล้ว ${selected.length} รายการ · กดแถวเพื่อเลือกหรือยกเลิก` : "เลือกหลายรายการ หรือ Clear ทั้งหมดได้ที่นี่"}</span></div><div class="record-selection-actions">${selecting ? `<button type="button" class="btn small record-select-page" data-action="complaint-select-page" ${!rows.length || busy ? "disabled" : ""}>${rows.length && rows.every((c) => selected.includes(c.id)) ? "ยกเลิกเลือกทั้งหน้า" : "เลือกทั้งหมดในหน้านี้"}</button><button type="button" class="btn small" data-action="complaint-selection-cancel" ${busy ? "disabled" : ""}>ยกเลิก</button>` : ""}<button type="button" class="btn small ${selecting ? "primary" : ""}" data-action="complaint-clear-selected" ${busy || (selecting ? !selected.length : !staffList().length) ? "disabled" : ""}>${icon(selecting ? "check" : "trash-can")} Clear ที่เลือก${selecting ? ` (${selected.length})` : ""}</button><button type="button" class="btn small record-clear-all" data-action="complaint-clear-all" ${!staffList().length || busy ? "disabled" : ""}>Clear ทั้งหมด</button></div></div>`
      : "";
    const heading = `<div class="record-section-heading"><h2>${trash ? `${icon("trash-can")} ถังขยะ` : "กล่องคำร้อง"}</h2><span>${number(filtered.length)} รายการ</span></div>`;
    return `<section class="record-surface record-inbox">${complaintToolbar(isStaff, trash)}${trash ? '<p class="record-trash-note">กู้คืนได้ภายใน 15 วันนับจากวันที่ย้ายเข้าถังขยะ เมื่อครบกำหนดคำร้องจะหายจากบัญชีของคุณ</p>' : ""}${heading}${selection}${rows.length ? `<ul class="complaint-inbox-list record-inbox-list">${rows.map((c) => (isStaff ? staffComplaintRow(c, selected, selecting) : `<li class="member-complaint-row"><button type="button" class="member-complaint-main" data-action="member-complaint-open" data-id="${esc(c.id)}"><span class="record-ticket-icon">${icon(c.status === "OPEN" ? "comment-dots" : "comments")}</span><span class="record-ticket-copy"><strong>${esc(c.issue)}</strong><span>${esc(c.replies?.at(-1)?.text || c.detail || "ไม่มีรายละเอียดเพิ่มเติม")}</span>${trash ? `<small class="record-expiry">${trashDeadline(c)}</small>` : ""}</span></button><div class="record-ticket-meta">${complaintBadge(c)}<time datetime="${esc(new Date(updated(c)).toISOString())}">${shortDate(updated(c))}</time></div><button type="button" class="record-row-action ${trash ? "" : "record-row-trash"}" data-action="${trash ? "complaint-restore" : "complaint-trash"}" data-id="${esc(c.id)}" aria-label="${trash ? "กู้คืนคำร้อง" : "ย้ายคำร้องไปถังขยะ"} ${esc(c.issue)}" title="${trash ? "กู้คืนคำร้อง" : "ย้ายไปถังขยะ"}" ${busy ? "disabled" : ""}>${icon(trash ? "rotate-left" : "trash-can")}</button></li>`)).join("")}</ul>` : empty(trash ? "ถังขยะว่าง" : "ไม่พบคำร้อง", state.complaintQuery || state.complaintStatus !== "all" ? "ลองเปลี่ยนคำค้นหาหรือสถานะที่เลือก" : trash ? "คำร้องที่ลบจะอยู่ที่นี่ชั่วคราว 15 วัน" : "คำร้องและการตอบกลับจะแสดงที่นี่")}${footer}</section>`;
  }
  function myComplaints() {
    const list = memberList().filter((c) => !c.learnerTrashedAt);
    return `${context.title("", "คำร้องของฉัน", "ติดตามเรื่องที่ส่งและอ่านคำตอบจากเจ้าหน้าที่", '<button type="button" class="btn primary" data-action="support">ส่งคำร้องใหม่</button>')}<section class="record-page"><div class="record-counts"><span>ทั้งหมด <b>${list.length}</b></span>${Object.entries(
      statusLabels,
    )
      .map(
        ([value, label]) =>
          `<span><span class="record-count-dot status-${value.toLowerCase()}"></span>${label} <b>${list.filter((c) => c.status === value).length}</b></span>`,
      )
      .join("")}</div>${complaintRows(false)}</section>`;
  }
  function memberComplaintDetail(id) {
    if (!member()) return;
    const c = memberList().find((c) => c.id === id);
    if (!c) return toast("ไม่พบคำร้องนี้ หรือพ้นระยะกู้คืนแล้ว");
    openModal(
      "รายละเอียดคำร้อง",
      `<article class="record-dialog" id="record-complaint-detail" data-id="${esc(c.id)}"><div class="record-detail-heading">${complaintBadge(c)}<h3>${esc(c.issue)}</h3><p>ส่งเมื่อ ${esc(fmt(c.createdAt))}</p></div>${c.learnerTrashedAt ? `<p class="record-trash-note">${trashDeadline(c)} · กู้คืนเพื่อย้ายกลับไปยังกล่องคำร้อง</p>` : ""}${complaintThread(c)}<div class="record-detail-actions"><button type="button" class="btn small ${c.learnerTrashedAt ? "primary" : "danger"}" data-action="${c.learnerTrashedAt ? "complaint-restore" : "complaint-trash"}" data-id="${esc(c.id)}">${icon(c.learnerTrashedAt ? "rotate-left" : "trash-can")} ${c.learnerTrashedAt ? "กู้คืนคำร้อง" : "ย้ายไปถังขยะ"}</button></div></article>`,
    );
  }
  function complaints() {
    const back =
      '<button type="button" class="btn small complaint-back" data-action="complaints-back">' +
      icon("arrow-left") +
      " กลับกล่องคำร้อง</button>";
    if (state.complaintId) {
      const c = staffList().find((item) => item.id === state.complaintId);
      if (!c)
        return `${context.title("", "รายละเอียดคำร้องเรียน", "")}${back}${context.empty("ไม่พบคำร้องนี้ กรุณากลับไปตรวจสอบรายการล่าสุด")}`;
      return `<section class="complaint-detail">${context.title("", esc(c.issue), "รายละเอียดคำร้องและประวัติการตอบกลับ")}${back}<article class="panel complaint-message"><header class="complaint-message-heading"><div><strong>${esc(c.name || store.users.find((u) => u.id === c.userId)?.name || "ผู้ใช้งาน")}</strong><p>${esc(c.code || "—")} · ${esc(c.contact || "—")}</p></div>${complaintBadge(c)}</header>${complaintThread(c)}<button type="button" class="btn small primary space" data-action="reply-open" data-id="${esc(c.id)}">${icon("reply")} เขียนคำตอบกลับ</button></article></section>`;
    }
    const list = staffList();
    return `${context.title("", "รายการคำร้องเรียน", "อ่าน ตอบกลับ และจัดการคำร้องจากผู้ใช้งาน")}<section class="record-page"><div class="record-counts"><span>ทั้งหมด <b>${list.length}</b></span>${Object.entries(
      statusLabels,
    )
      .map(
        ([value, label]) =>
          `<span>${label} <b>${list.filter((c) => c.status === value).length}</b></span>`,
      )
      .join("")}</div>${complaintRows(true)}</section>`;
  }
  function replyModal(id) {
    if (!staff()) return;
    const c = staffList().find((c) => c.id === id);
    if (!c) return toast("ไม่พบคำร้องนี้");
    openModal(
      "ตอบกลับคำร้องเรียน",
      `<div class="record-dialog record-reply">${complaintThread(c)}<form id="reply-form" data-id="${esc(c.id)}" class="space"><div class="field"><label for="reply-text">ข้อความตอบกลับถึงผู้ใช้</label><textarea id="reply-text" name="reply" required minlength="1" maxlength="3000" placeholder="อธิบายการแก้ไข หรือแนะนำขั้นตอนให้ผู้ใช้งาน"></textarea></div><div class="field"><label for="reply-status">สถานะหลังตอบกลับ</label><select id="reply-status" name="status"><option value="REPLIED">ตอบกลับแล้ว / รอติดตามผล</option><option value="CLOSED">ตอบกลับและปิดเรื่อง</option></select></div><div class="error" role="alert"></div><button class="btn primary">ส่งคำตอบกลับ</button></form></div>`,
    );
  }
  const actions = new Set([
    "record-page",
    "report-detail",
    "member-complaint-open",
    "complaint-view",
    "complaint-trash",
    "complaint-restore",
    "complaint-clear-selected",
    "complaint-clear-all",
    "complaint-toggle-selection",
    "complaint-selection-cancel",
    "complaint-select-page",
  ]);
  async function handleAction(action, id) {
    if (action === "record-page") {
      state[state.page === "reports" ? "reportPage" : "complaintPage"] =
        Number(id) || 1;
      context.render();
      $(".record-pagination")
        ?.querySelector('[aria-current="page"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (action === "report-detail") return reportDetail(id);
    if (action === "member-complaint-open") return memberComplaintDetail(id);
    if (action === "complaint-view" && member()) {
      state.complaintView = id === "trash" ? "trash" : "inbox";
      state.complaintPage = 1;
      state.complaintQuery = "";
      state.complaintStatus = "all";
      return context.render();
    }
    if (busy || context.apiSaveCount)
      return toast("กำลังบันทึก กรุณารอสักครู่");
    if (
      staff() &&
      action === "complaint-clear-selected" &&
      !state.complaintSelecting
    ) {
      state.complaintSelecting = true;
      state.complaintSelected = [];
      context.render();
      $('[data-action="complaint-toggle-selection"]')?.focus({
        preventScroll: true,
      });
      return;
    }
    if (staff() && action === "complaint-selection-cancel") {
      state.complaintSelecting = false;
      state.complaintSelected = [];
      context.render();
      $('[data-action="complaint-clear-selected"]')?.focus({
        preventScroll: true,
      });
      return;
    }
    if (
      staff() &&
      state.complaintSelecting &&
      ["complaint-toggle-selection", "complaint-select-page"].includes(action)
    ) {
      const selected = new Set(selectedIds());
      if (action === "complaint-toggle-selection") {
        if (!staffList().some((c) => c.id === id)) return;
        selected.has(id) ? selected.delete(id) : selected.add(id);
      } else {
        const pageIds = [
          ...document.querySelectorAll(
            '[data-action="complaint-toggle-selection"]',
          ),
        ].map((item) => item.dataset.id);
        const all = pageIds.every((rowId) => selected.has(rowId));
        pageIds.forEach((rowId) =>
          all ? selected.delete(rowId) : selected.add(rowId),
        );
      }
      state.complaintSelected = [...selected];
      context.render();
      const control =
        action === "complaint-select-page"
          ? $('[data-action="complaint-select-page"]')
          : [
              ...document.querySelectorAll(
                '[data-action="complaint-toggle-selection"]',
              ),
            ].find((item) => item.dataset.id === id);
      control?.focus({ preventScroll: true });
      return;
    }
    const isClear = action.startsWith("complaint-clear-");
    if (!isClear && !["complaint-trash", "complaint-restore"].includes(action))
      return;
    if (isClear ? !staff() : !member()) return;
    const actor = state.userId,
      revision = store.revision;
    const ids = isClear ? selectedIds().slice() : [];
    const count =
      action === "complaint-clear-all" ? staffList().length : ids.length;
    const modal = $("#record-complaint-detail");
    busy = true;
    try {
      if (
        isClear &&
        (!count ||
          !(await askConfirm(
            `Clear ${action === "complaint-clear-all" ? "คำร้องทั้งหมด" : "คำร้องที่เลือก"} ${count} รายการจากฝั่งเจ้าหน้าที่หรือไม่? คำร้องฝั่งผู้เรียนจะยังอยู่ตามเดิม`,
            "danger",
          )))
      )
        return;
      if (actor !== state.userId || (isClear ? !staff() : !member())) return;
      const data = isClear
        ? {
            revision,
            ...(action === "complaint-clear-all" ? { all: true } : { ids }),
          }
        : { id, revision };
      const result = await context.saveComplaintAction(
        isClear ? "clear" : action === "complaint-trash" ? "trash" : "restore",
        data,
      );
      if (!result || actor !== state.userId) return;
      if (modal?.isConnected && modal.dataset.id === id) closeModal();
      if (isClear) {
        state.complaintSelected = [];
        state.complaintSelecting = false;
      }
      toast(
        isClear
          ? "Clear คำร้องจากฝั่งเจ้าหน้าที่แล้ว"
          : action === "complaint-trash"
            ? "ย้ายไปถังขยะแล้ว · กู้คืนได้ภายใน 15 วัน"
            : "กู้คืนคำร้องแล้ว",
        "success",
      );
    } catch (error) {
      if (actor === state.userId) toast(error.message, "error");
    } finally {
      busy = false;
      if (actor === state.userId) context.render();
    }
  }
  function change(e) {
    const target = e.target;
    const keys = {
      "report-year": "reportYear",
      "report-status": "reportStatus",
      "complaint-status": "complaintStatus",
    };
    if (keys[target.id]) {
      state[keys[target.id]] = target.value;
      state[target.id.startsWith("report-") ? "reportPage" : "complaintPage"] =
        1;
      context.render();
      document.getElementById(target.id)?.focus();
      return true;
    }
    return false;
  }
  function input(e) {
    if (!["report-search", "complaint-search"].includes(e.target.id))
      return false;
    const report = e.target.id === "report-search",
      position = e.target.selectionStart,
      id = e.target.id;
    state[report ? "reportQuery" : "complaintQuery"] = e.target.value;
    state[report ? "reportPage" : "complaintPage"] = 1;
    context.render();
    const field = document.getElementById(id);
    field?.focus();
    field?.setSelectionRange?.(position, position);
    return true;
  }
  return {
    reports,
    reportDetail,
    complaints,
    myComplaints,
    complaintThread,
    replyModal,
    isAction: (a) => actions.has(a),
    handleAction,
    change,
    input,
  };
}
