export function createActivityViews(context) {
  const {
    state,
    store,
    badge,
    closeModal,
    commit,
    esc,
    dateRangeField,
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
  } = context;
  const managedWorkshops = (...args) => context.managedWorkshops(...args);
  // Edit public announcements here; no separate announcement manager is needed.
  const announcements = [
    {
      id: "membership",
      label: "เริ่มต้นใช้งาน",
      title: "สมัครสมาชิกเพื่อเข้าร่วมกิจกรรม",
      text: "ใช้อีเมลที่คุณใช้งานสมัครสมาชิก แล้วเข้าสู่ระบบเพื่อเลือกเวิร์กช็อปที่สนใจ",
      icon: "fa-user-plus",
    },
    {
      id: "preparation",
      label: "ก่อนเข้าอบรม",
      title: "ตรวจสอบกำหนดการก่อนเข้าร่วม",
      text: "อ่านรายละเอียด วัน เวลา และสถานที่ของแต่ละกิจกรรม วางแผนการเข้าร่วมให้ตรงกับตารางของคุณ",
      icon: "fa-calendar-check",
    },
    {
      id: "results",
      label: "หลังเข้าอบรม",
      title: "ติดตามผลและชั่วโมงการอบรม",
      text: "ดูผลการเข้าร่วมและชั่วโมงสะสมในบัญชีของคุณ หลังเจ้าหน้าที่ยืนยันผลการเข้าร่วมกิจกรรม",
      icon: "fa-graduation-cap",
    },
  ];

  function home() {
    const upcoming = store.workshops
      .filter(
        (workshop) =>
          !workshop.closed && scheduledPhase(workshop) !== "finished",
      )
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 3);
    return `<div class="public-home"><section class="public-hero" aria-labelledby="public-title"><div class="public-hero-copy"><p class="public-institution">พื้นที่การเรียนรู้ของชาว BSRU</p><h1 id="public-title">รู้ข่าวก่อน<br>ไม่พลาดทุกการเรียนรู้</h1><p class="public-hero-description">ติดตามประกาศ ข่าวประชาสัมพันธ์ และกิจกรรมอบรมของมหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</p><div class="public-hero-actions"><button class="btn primary" data-action="public-page" data-id="workshops">สำรวจกิจกรรมอบรม</button><button class="btn" data-action="login">เข้าสู่ระบบสมาชิก</button></div></div><figure class="public-hero-photo"><img src="/assets/images/image-002.jpg" alt="ภาพประกอบการเรียนรู้และแลกเปลี่ยนความคิดร่วมกัน" fetchpriority="high"><figcaption>เรียนรู้ แลกเปลี่ยน และเติบโตไปด้วยกัน</figcaption></figure></section><section class="public-announcements" aria-labelledby="public-news-title"><div class="public-section-heading"><div><p>ติดตามข่าวสารจากเรา</p><h2 id="public-news-title">ประกาศและประชาสัมพันธ์</h2></div><span class="public-section-note">ข้อมูลสำหรับผู้เรียนและบุคลากร</span></div><div class="public-news-list">${announcements.map((item) => `<article class="public-news-item"><span class="public-news-icon" aria-hidden="true"><i class="fa-solid ${item.icon}"></i></span><div><span class="public-news-label">${item.label}</span><h3><button data-action="announcement" data-id="${item.id}">${item.title}</button></h3><p>${item.text}</p></div><button class="public-news-open" data-action="announcement" data-id="${item.id}" aria-label="อ่านประกาศ ${item.title}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></article>`).join("")}</div></section><section class="public-workshops" aria-labelledby="public-workshops-title"><div class="public-section-heading"><div><p>เรียนรู้สิ่งใหม่ในกิจกรรมถัดไป</p><h2 id="public-workshops-title">กิจกรรมที่กำลังมาถึง</h2></div><button class="btn small" data-action="public-page" data-id="workshops">ดูกิจกรรมทั้งหมด</button></div>${upcoming.length ? `<div class="grid three">${upcoming.map(card).join("")}</div>` : empty("ยังไม่พบเวิร์กช็อปที่กำลังเปิดรับ ติดตามประกาศใหม่ได้ที่หน้านี้")}</section></div>`;
  }

  function announcementDetail(id) {
    const item = announcements.find((announcement) => announcement.id === id);
    if (!item) return;
    openModal(
      item.title,
      `<p class="public-announcement-detail">${item.text}</p><button class="btn primary" data-action="${id === "membership" ? "register" : "close"}">${id === "membership" ? "สมัครสมาชิก" : "ปิดประกาศ"}</button>`,
    );
  }
  function workshopMeta(w) {
    return `<div class="meta"><span><i class="fa-regular fa-calendar"></i>เริ่ม ${esc(fmt(w.start))}</span><span><i class="fa-regular fa-clock"></i>สิ้นสุด ${esc(fmt(w.end))}</span><span><i class="fa-solid fa-location-dot"></i>${esc(w.place)}</span><span><i class="fa-solid fa-users"></i>เหลือ ${Math.max(0, w.capacity - occupancy(w.id))} จาก ${w.capacity} ที่นั่ง</span><span><i class="fa-solid fa-hourglass-half"></i>จำนวนชั่วโมงอบรม <b>${number(w.hours)} ชั่วโมง</b></span></div>`;
  }

  function title(eyebrow, heading, desc, action = "") {
    return `<div class="row between page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p class="muted" style="margin:0">${desc}</p></div>${action}</div>`;
  }

  function workshopDetail(id) {
    const w = store.workshops.find((item) => item.id === id);
    if (!w) return;
    const registered = store.registrations.some(
      (r) => r.workshopId === id && r.status !== "CANCELLED",
    );
    openModal(
      esc(w.title),
      '<p class="activity-description">' +
        esc(
          w.description ||
            "ยังไม่มีรายละเอียดเพิ่มเติม กรุณาติดต่อผู้จัดกิจกรรม",
        ) +
        "</p>" +
        workshopMeta(w) +
        '<p class="notice">ชั่วโมงอบรมจะได้รับเมื่อเจ้าหน้าที่ยืนยันการเข้าร่วมแล้ว</p>' +
        (member() &&
        !registered &&
        phase(w) === "upcoming" &&
        occupancy(id) < w.capacity
          ? '<button class="btn primary space" data-action="enroll" data-id="' +
            w.id +
            '">ลงทะเบียนกิจกรรมนี้</button>'
          : '<p class="muted">' +
            (registered ? "คุณลงทะเบียนกิจกรรมนี้แล้ว" : phaseLabel(w)) +
            "</p>"),
    );
  }

  function learnerDashboard() {
    const regs = store.registrations.filter((r) => r.userId === state.userId);
    const upcoming = regs
      .filter((r) => r.status === "PENDING")
      .map((r) => store.workshops.find((w) => w.id === r.workshopId))
      .filter((w) => w && new Date(w.end) > new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const next = upcoming[0];
    const unread = store.notifications.filter(
      (n) => n.userId === state.userId && !n.readAt,
    ).length;
    return (
      title(
        "พื้นที่การเรียนรู้",
        "สวัสดี, " + esc(user().name),
        "กิจกรรมและสิ่งที่ต้องทำของคุณ",
        '<span class="sync" data-sync-status role="status">' +
          esc(context.syncMessage) +
          "</span>",
      ) +
      '<section class="panel next-activity"><span class="eyebrow">กิจกรรมถัดไปของฉัน</span>' +
      (next
        ? "<h2>" +
          esc(next.title) +
          "</h2>" +
          workshopMeta(next) +
          '<button class="btn primary" data-action="workshop-detail" data-id="' +
          next.id +
          '">ดูรายละเอียดกิจกรรม</button>'
        : '<h2>ยังไม่มีกิจกรรมที่กำลังจะเข้าร่วม</h2><p class="muted">เลือกกิจกรรมที่สนใจเพื่อเริ่มต้นการเรียนรู้</p><button class="btn primary" data-action="page" data-id="workshops">ค้นหากิจกรรม</button>') +
      "</section>" +
      '<div class="grid three space"><section class="panel"><h3>กำลังจะเข้าร่วม</h3><strong class="metric">' +
      upcoming.length +
      '</strong><p>กิจกรรม</p></section><section class="panel"><h3>ชั่วโมงสะสม</h3><strong class="metric">' +
      number(regs.reduce((sum, r) => sum + hoursOf(r), 0)) +
      '</strong><p>ยืนยันการเข้าร่วมแล้ว</p></section><section class="panel"><h3>สิ่งที่ต้องตรวจสอบ</h3><p>แจ้งเตือนที่ยังไม่อ่าน ' +
      unread +
      ' รายการ</p><button class="btn" data-action="page" data-id="notifications">ดูการแจ้งเตือน</button></section></div>' +
      '<div class="row between space"><h2>กิจกรรมที่เปิดรับสมัคร</h2><button class="btn" data-action="page" data-id="workshops">ดูทั้งหมด</button></div><div class="grid three space">' +
      (store.workshops
        .filter((w) => phase(w) === "upcoming" && occupancy(w.id) < w.capacity)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 3)
        .map(card)
        .join("") || empty("ยังไม่มีกิจกรรมเปิดรับสมัคร")) +
      "</div>"
    );
  }

  function card(w) {
    const r = store.registrations.find(
        (r) => r.workshopId === w.id && r.userId === state.userId,
      ),
      n = occupancy(w.id),
      a = staff(),
      available = phase(w) === "upcoming" && n < w.capacity;
    return `<article class="card"><div class="cover">${w.cover ? `<img src="${esc(w.cover)}" alt="ภาพประกอบ ${esc(w.title)}" loading="lazy">` : `<i class="fa-solid ${esc(w.icon || "fa-graduation-cap")}"></i>`}<span class="tag">${esc(w.category || "BSRU WORKSHOP")}</span></div><div class="cardbody">${w.photoSource ? `<a class="photo-credit" href="${esc(w.photoSource.url)}" target="_blank" rel="noopener">ภาพประกอบ: ${esc(w.photoSource.credit)}</a>` : ""}<div class="row between"><span class="badge phase-${phase(w)}">${phaseLabel(w)}</span>${r ? badge(r.status) : ""}</div><h3 style="margin-top:14px;min-height:50px"><button class="activity-title" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.title)}</button></h3>${workshopMeta(w)}<div class="row between" style="font-size:11px"><span class="muted">จำนวนผู้ลงทะเบียน</span><b>${n} / ${w.capacity} ที่นั่ง</b></div><div class="progress"><span style="width:${Math.min(100, (n / w.capacity) * 100)}%"></span></div>${!user() ? `<button class="btn primary" data-action="login">เข้าสู่ระบบเพื่อสมัครกิจกรรม</button>` : a ? `<button class="btn primary" style="width:100%" data-action="participants-for" data-id="${esc(w.id)}">จัดการผู้เข้าร่วม</button><div class="row space"><button class="btn small" data-action="edit-workshop" data-id="${esc(w.id)}">แก้ไขกิจกรรม</button>${!w.closed && scheduledPhase(w) !== "finished" ? `<button class="btn small danger" data-action="close-workshop" data-id="${esc(w.id)}">ปิดเวิร์กช็อป</button>` : ""}</div>` : r && r.status !== "CANCELLED" ? `<button class="btn" style="width:100%" data-action="page" data-id="mine">ดูกิจกรรมของฉัน →</button>` : `<button class="btn primary" style="width:100%" data-action="enroll" data-id="${esc(w.id)}" ${!available ? "disabled" : ""}>${!available ? (n >= w.capacity ? "ที่นั่งเต็ม" : "ปิดรับลงทะเบียน") : r ? "ลงทะเบียนอีกครั้ง" : "ลงทะเบียนเวิร์กช็อป"} &nbsp; →</button>`}</div></article>`;
  }

  function empty(msg) {
    return `<div class="panel empty"><i class="fa-regular fa-folder-open"></i>${esc(msg)}</div>`;
  }

  function workshops() {
    if (staff()) return managedWorkshops();
    let list = store.workshops.filter(
      (w) =>
        (state.filter === "all" || phase(w) === state.filter) &&
        (!state.search ||
          (w.title + " " + w.place)
            .toLowerCase()
            .includes(state.search.toLowerCase())) &&
        ((state.view === "open" && true) ||
          (state.view === "mine" &&
            store.registrations.some(
              (r) => r.workshopId === w.id && r.userId === state.userId,
            ))),
    );
    if (state.page === "mine" && state.mineStatus && state.mineStatus !== "all")
      list = list.filter((w) => {
        const r = store.registrations.find(
          (row) => row.workshopId === w.id && row.userId === state.userId,
        );
        return state.mineStatus === "upcoming"
          ? r?.status === "PENDING"
          : state.mineStatus === "finished"
            ? ["ATTENDED", "ABSENT"].includes(r?.status)
            : r?.status === "CANCELLED";
      });
    if (state.dateFrom)
      list = list.filter((w) => w.start.slice(0, 10) >= state.dateFrom);
    if (state.dateTo)
      list = list.filter((w) => w.start.slice(0, 10) <= state.dateTo);
    return `${title("EXPLORE WORKSHOPS", state.view === "mine" ? "กิจกรรมของฉัน" : "ค้นพบเวิร์กช็อปที่ใช่", "เลือกกิจกรรมเพื่อพัฒนาทักษะและเปิดประสบการณ์ใหม่")}<div class="toolbar workshop-filters"><input id="search" aria-label="ค้นหาเวิร์กช็อป" placeholder="ค้นหาชื่อเวิร์กช็อป หรือสถานที่…" value="${esc(state.search)}">${
      state.page === "mine"
        ? '<select id="mine-status" aria-label="สถานะการเข้าร่วม">' +
          [
            ["all", "การเข้าร่วมทั้งหมด"],
            ["upcoming", "รอเข้าร่วม"],
            ["finished", "เสร็จสิ้น"],
            ["cancelled", "ยกเลิก"],
          ]
            .map(
              ([id, label]) =>
                '<option value="' +
                id +
                '"' +
                ((state.mineStatus || "all") === id ? " selected" : "") +
                ">" +
                label +
                "</option>",
            )
            .join("") +
          "</select>"
        : ""
    }<select id="phase-filter" aria-label="สถานะกิจกรรม">${[
      ["all", "กิจกรรมทุกสถานะ"],
      ["upcoming", "เร็วๆ นี้"],
      ["ongoing", "ดำเนินการอยู่"],
      ["closed", "ปิดเวิร์กช็อปแล้ว"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${state.filter === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select>${dateRangeField()}<span class="muted">${list.length} กิจกรรม</span></div>${
      '<div class="grid three">' +
      list
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .map(card)
        .join("") +
      "</div>"
    }${!list.length ? empty("ไม่พบเวิร์กช็อปที่ตรงกับตัวกรอง") : ""}`;
  }

  function reports() {
    const regs = store.registrations.filter((r) => r.userId === state.userId);
    return `${title("MY WORKSHOP REPORT", "รายงานผลและชั่วโมงอบรม", "ชั่วโมงสะสมอัปเดตเมื่อเจ้าหน้าที่บันทึกการเข้าร่วมงาน")}<div class="panel hours-summary space"><div><h2>ชั่วโมงอบรมสะสม</h2><p class="muted">ยืนยันจากสถานะเข้าร่วมงานแล้วเท่านั้น</p></div><strong>${number(regs.reduce((s, r) => s + hoursOf(r), 0))}<small> ชั่วโมง</small></strong></div><div class="space grid">${
      regs
        .map((r) => {
          const w = store.workshops.find((w) => w.id === r.workshopId);
          return `<article class="panel"><div class="row between"><h3>${esc(w.title)}</h3>${badge(r.status)}</div>${workshopMeta(w)}${w.closed ? '<div class="notice">เจ้าหน้าที่ปิดเวิร์กช็อปนี้แล้ว ไม่เปิดรับลงทะเบียนเพิ่ม</div>' : ""}<div class="notice">ชั่วโมงที่ได้รับ: <b>${number(hoursOf(r))} ชั่วโมง</b>${r.status === "PENDING" ? " · รอเจ้าหน้าที่เช็กชื่อ" : ""}</div><div class="row space">${r.status === "PENDING" ? `<button class="btn small danger" data-action="cancel" data-id="${r.id}">ยกเลิกการลงทะเบียน</button>` : ""}${r.status === "CANCELLED" ? `<button class="btn small primary" data-action="enroll" data-id="${w.id}" ${phase(w) !== "upcoming" || occupancy(w.id) >= w.capacity ? "disabled" : ""}>ลงทะเบียนอีกครั้ง</button>` : ""}${!store.ratings.some((x) => x.eventId === r.ratingEvent) ? `<button class="btn small" data-action="rate-open" data-id="${r.id}">ประเมินขั้นตอนลงทะเบียน</button>` : ""}</div><div class="sub space">อัปเดต ${esc(fmt(r.updatedAt))}</div></article>`;
        })
        .join("") ||
      empty("ยังไม่มีรายการลงทะเบียน เริ่มต้นได้ที่หน้าเวิร์กช็อป")
    }</div>`;
  }

  const complaintStatus = (c) =>
    ({
      OPEN: "รอเจ้าหน้าที่ตอบกลับ",
      REPLIED: "เจ้าหน้าที่ตอบกลับแล้ว",
      CLOSED: "ตอบกลับและปิดเรื่องแล้ว",
    })[c.status] || c.status;

  function complaintThread(c) {
    return `<div class="thread-original"><b>เรื่องที่แจ้ง: ${esc(c.issue)}</b><p style="white-space:pre-wrap">${esc(c.detail || "ไม่มีรายละเอียดเพิ่มเติม")}</p><div class="sub">ส่งเมื่อ ${esc(fmt(c.createdAt))}</div></div>${(c.replies || []).map((r) => `<div class="thread-reply"><b>คำตอบจาก ${esc(r.staffName)}</b><p style="white-space:pre-wrap">${esc(r.text)}</p><div class="sub">${esc(fmt(r.createdAt))}</div></div>`).join("")}`;
  }

  function complaints() {
    return `${title("SUPPORT CENTER", "รายการคำร้องเรียน", "อ่านข้อความและตอบกลับผู้ใช้งานโดยตรงในแอป")}<div class="grid space">${
      store.complaints
        .slice()
        .reverse()
        .map(
          (c) =>
            `<article class="panel"><div class="row between"><h3>${esc(c.issue)}</h3><span class="badge ${c.status === "OPEN" ? "PENDING" : "APPROVED"}">${complaintStatus(c)}</span></div><p>${esc(c.name)} · ${esc(c.code)}<br><span class="muted">${esc(c.contact)}</span></p>${complaintThread(c)}<button class="btn small primary space" data-action="reply-open" data-id="${c.id}">เขียนคำตอบกลับ</button></article>`,
        )
        .join("") || empty("ยังไม่มีคำร้องเรียน")
    }</div>`;
  }

  function myComplaints() {
    const list = store.complaints.filter((c) => c.userId === state.userId);
    return `${title("MY SUPPORT REQUESTS", "คำร้องของฉัน", "ติดตามเรื่องที่ส่งและอ่านคำตอบจากเจ้าหน้าที่", `<button class="btn primary" data-action="support">ส่งคำร้องใหม่</button>`)}<div class="grid space">${
      list
        .slice()
        .reverse()
        .map(
          (c) =>
            `<article class="panel"><div class="row between"><h3>${esc(c.issue)}</h3><span class="badge ${c.status === "OPEN" ? "PENDING" : "APPROVED"}">${complaintStatus(c)}</span></div>${complaintThread(c)}</article>`,
        )
        .join("") || empty("คุณยังไม่มีคำร้องเรียน")
    }</div>`;
  }

  function replyModal(id) {
    if (!staff()) return;
    const c = store.complaints.find((c) => c.id === id);
    if (!c) return;
    openModal(
      "ตอบกลับคำร้องเรียน",
      `${complaintThread(c)}<form id="reply-form" data-id="${c.id}" class="space"><div class="field"><label for="reply-text">ข้อความตอบกลับถึงผู้ใช้</label><textarea id="reply-text" name="reply" required minlength="1" maxlength="3000" placeholder="อธิบายการแก้ไข หรือแนะนำขั้นตอนให้ผู้ใช้งาน"></textarea></div><div class="field"><label for="reply-status">สถานะหลังตอบกลับ</label><select id="reply-status" name="status"><option value="REPLIED">ตอบกลับแล้ว / รอติดตามผล</option><option value="CLOSED">ตอบกลับและปิดเรื่อง</option></select></div><div class="error" role="alert"></div><button class="btn primary">ส่งคำตอบกลับ</button></form>`,
    );
  }

  function notifyUser(userId, title, body, kind, refId) {
    store.notifications.unshift({
      id: uid(),
      userId,
      title,
      body,
      kind,
      refId,
      createdAt: new Date().toISOString(),
      readAt: null,
    });
  }

  function notifications() {
    const list = store.notifications.filter((n) => n.userId === state.userId),
      isActivity = (n) =>
        ["attendance", "registration", "workshop"].includes(n.kind),
      visible = list.filter(
        (n) =>
          (state.notificationFilter === "activity"
            ? isActivity(n)
            : !isActivity(n)) &&
          (!state.notificationQuery ||
            (n.title + " " + n.body)
              .toLowerCase()
              .includes(state.notificationQuery.toLowerCase())),
      ),
      generalCount = list.filter((n) => !isActivity(n)).length,
      activityCount = list.filter(isActivity).length,
      unread = visible.filter((n) => !n.readAt).length;
    return `${title("YOUR UPDATES", "การแจ้งเตือน", "ติดตามข่าวสารและความเคลื่อนไหวของเวิร์กช็อปได้ที่นี่")}<section class="notification-page"><div class="notification-toolbar"><div class="notification-tabs" role="tablist" aria-label="หมวดการแจ้งเตือน"><button class="notification-tab ${state.notificationFilter === "general" ? "active" : ""}" role="tab" aria-selected="${state.notificationFilter === "general"}" data-action="notification-filter" data-id="general">ทั่วไป <span>${generalCount}</span></button><button class="notification-tab ${state.notificationFilter === "activity" ? "active" : ""}" role="tab" aria-selected="${state.notificationFilter === "activity"}" data-action="notification-filter" data-id="activity">กิจกรรม <span>${activityCount}</span></button></div><label class="notification-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="notification-search" type="search" aria-label="ค้นหาการแจ้งเตือน" placeholder="ค้นหาการแจ้งเตือน" value="${esc(state.notificationQuery)}"></label></div><p class="notification-summary" aria-live="polite">${visible.length} รายการ · ยังไม่อ่าน ${unread} รายการ</p><div class="notification-list">${
      visible
        .map((n) => {
          const icon =
              n.kind === "attendance"
                ? "fa-user-check"
                : n.kind === "complaint"
                  ? "fa-comment-dots"
                  : n.kind === "account"
                    ? "fa-user-shield"
                    : "fa-newspaper",
            source = isActivity(n)
              ? "กิจกรรม BSRU"
              : n.kind === "complaint"
                ? "คำร้องของฉัน"
                : n.kind === "account"
                  ? "บัญชี BSRU"
                  : "ข่าวสาร BSRU";
          return `<button class="notification-card ${n.readAt ? "read" : "unread"}" data-action="notification-read" data-id="${n.id}" aria-label="เปิดอ่าน ${esc(n.title)}"><span class="notification-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span><span class="notification-copy"><span class="notification-meta"><span class="notification-source">${source}</span><span class="notification-state">${n.readAt ? "อ่านแล้ว" : "ใหม่"}</span></span><strong>${esc(n.title)}</strong><span class="notification-message">${esc(n.body)}</span><time datetime="${esc(n.createdAt)}">${esc(fmt(n.createdAt))}</time></span><span class="notification-chevron" aria-hidden="true">›</span></button>`;
        })
        .join("") ||
      `<div class="notification-empty"><span class="notification-empty-icon"><i class="fa-solid fa-bell-slash" aria-hidden="true"></i></span><h2>${state.notificationQuery ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการแจ้งเตือน"}</h2><p>${state.notificationQuery ? "ลองค้นหาด้วยคำอื่น" : "เมื่อมีข่าวสารหรืออัปเดตจากเวิร์กช็อป รายการจะแสดงที่นี่"}</p>${state.notificationQuery ? '<button class="btn small" data-action="clear-notification-search">ล้างคำค้นหา</button>' : ""}</div>`
    }</div></section>`;
  }

  async function readNotification(id) {
    if (!member()) return;
    const n = store.notifications.find(
      (n) => n.id === id && n.userId === state.userId,
    );
    if (!n) return;
    n.readAt = n.readAt || new Date().toISOString();
    await commit();
    const c =
      n.kind === "complaint"
        ? store.complaints.find(
            (c) => c.id === n.refId && c.userId === state.userId,
          )
        : null;
    openModal(
      "รายละเอียดการแจ้งเตือน",
      `<h3>${esc(n.title)}</h3><p style="white-space:pre-wrap">${esc(n.body)}</p><p class="sub">${esc(fmt(n.createdAt))}</p>${c ? complaintThread(c) : ""}<button class="btn primary space" data-action="notification-go" data-id="${c ? "my-complaints" : "reports"}">${c ? "ดูคำร้องของฉัน" : "ดูรายงานผลและชั่วโมงอบรม"}</button>`,
    );
  }

  function ratingModal(id) {
    const r = store.registrations.find(
      (r) => r.id === id && r.userId === state.userId,
    );
    if (!member() || !r) return;
    openModal(
      "ประเมินความรู้สึกหลังใช้งาน",
      `<div class="badge APPROVED">ลงทะเบียนสำเร็จ</div><h3 class="space">ขั้นตอนการลงทะเบียนเวิร์กช็อปครั้งนี้ สะดวกราบรื่นแค่ไหน?</h3><p class="muted">${esc(store.workshops.find((w) => w.id === r.workshopId).title)}</p><div class="emoji-ratings">${[
        [5, "😍", "ง่ายมาก"],
        [4, "🙂", "ราบรื่นดี"],
        [3, "😐", "พอใช้ได้"],
        [2, "🙁", "ติดขัด/ยุ่งยาก"],
        [1, "😣", "ยุ่งยากมาก"],
      ]
        .map(
          ([score, emoji, label]) =>
            `<button type="button" data-action="rate" data-id="${r.id}" data-score="${score}" aria-label="${label} ${score} จาก 5"><span>${emoji}</span>${label}</button>`,
        )
        .join(
          "",
        )}</div><button class="btn small space" data-action="close">ไว้ภายหลัง</button>`,
    );
  }

  function supportModal() {
    if (!member()) return;
    const u = user();
    openModal(
      "แจ้งปัญหา / ร้องเรียน",
      `<form id="support-form"><div class="field"><label for="issue">เลือกปัญหาที่พบ</label><select name="issue" id="issue">${issues.map((i) => `<option>${esc(i)}</option>`).join("")}</select></div><div class="grid two"><div class="field"><label for="type">ประเภทผู้ใช้</label><select id="type" name="type"><option ${u?.type === "นักศึกษา" ? "selected" : ""}>นักศึกษา</option><option ${u?.type === "อาจารย์" ? "selected" : ""}>อาจารย์</option></select></div>${input("รหัสประจำตัว", "code", "text", `maxlength="30" value="${esc(u?.code || "")}"`)}</div>${input("ชื่อ-นามสกุล", "name", "text", `maxlength="120" value="${esc(u?.name || "")}"`)}${input("อีเมล / เบอร์โทรศัพท์", "contact", "text", `maxlength="150" value="${esc(u?.email || u?.phone || "")}"`)}<div class="field"><label for="detail">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label><textarea id="detail" name="detail" maxlength="3000" placeholder="อธิบายปัญหาที่พบ โดยไม่ระบุรหัสผ่าน"></textarea></div><div class="error" id="form-error" role="alert"></div><button class="btn primary">ส่งเรื่องร้องเรียน</button></form>`,
    );
  }

  function enroll(id) {
    if (!member()) return;
    const w = store.workshops.find((w) => w.id === id);
    if (!w || phase(w) !== "upcoming" || occupancy(id) >= w.capacity)
      return toast("กิจกรรมปิดรับหรือที่นั่งเต็มแล้ว");
    if (context.apiSaveCount)
      return toast("กำลังบันทึกรายการก่อนหน้า กรุณารอสักครู่");
    const conflict = store.registrations.find((r) => {
      const event = store.workshops.find((x) => x.id === r.workshopId);
      return (
        r.workshopId !== id &&
        r.status !== "CANCELLED" &&
        event &&
        new Date(w.start) < new Date(event.end) &&
        new Date(event.start) < new Date(w.end)
      );
    });
    if (conflict)
      return toast(
        "เวลาตรงกับกิจกรรมที่ลงทะเบียนไว้แล้ว กรุณาตรวจสอบกิจกรรมของฉัน",
      );
    let r = store.registrations.find(
      (r) => r.workshopId === id && r.userId === state.userId,
    );
    if (r && r.status !== "CANCELLED")
      return toast("คุณลงทะเบียนกิจกรรมนี้แล้ว");
    const now = new Date().toISOString();
    if (r) {
      r.status = "PENDING";
      r.ratingEvent = r.id;
      r.updatedAt = now;
    } else {
      const registrationId = uid();
      r = {
        id: registrationId,
        userId: state.userId,
        workshopId: id,
        status: "PENDING",
        ratingEvent: registrationId,
        createdAt: now,
        updatedAt: now,
      };
      store.registrations.push(r);
    }
    closeModal();
    return commit("ลงทะเบียนสำเร็จ ตรวจสอบได้ที่กิจกรรมของฉัน");
  }
  return {
    home,
    announcementDetail,
    complaints,
    empty,
    enroll,
    learnerDashboard,
    myComplaints,
    notifications,
    notifyUser,
    ratingModal,
    readNotification,
    replyModal,
    reports,
    supportModal,
    title,
    workshopDetail,
    workshops,
  };
}
