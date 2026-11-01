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
    $,
    askConfirm,
    saveNotificationAction,
  } = context;
  const managedWorkshops = (...args) => context.managedWorkshops(...args);
  // Sample news stays local until an announcement manager is introduced.
  const announcements = [
    {
      id: "learning-week",
      label: "ข่าวประชาสัมพันธ์",
      title: "เปิดพื้นที่ให้ทุกไอเดีย ใน BSRU Learning Week",
      text: "หนึ่งสัปดาห์ของการเรียนรู้ ทดลอง และลงมือทำ พร้อมแลกเปลี่ยนไอเดียกับเพื่อนต่างสาขา",
      detail:
        "ร่วมค้นหาทักษะที่ใช่ผ่านกิจกรรมด้านดิจิทัล การออกแบบ และการสื่อสาร เรียนรู้จากการลงมือทำจริง แล้วต่อยอดเป็นผลงานของตัวเอง\n\nกิจกรรมตัวอย่างประกอบด้วยห้องทดลองสร้างสรรค์ การแลกเปลี่ยนผลงาน และเวิร์กช็อปสำหรับผู้เริ่มต้น ติดตามกำหนดการจริงได้จากประกาศของมหาวิทยาลัย",
      date: "2026-11-01T09:00:00+07:00",
      image: "/assets/images/image-005.jpg",
      alt: "พื้นที่ทำงานสร้างสรรค์พร้อมคอมพิวเตอร์สำหรับออกแบบสื่อ",
    },
    {
      id: "web-lab",
      label: "ทักษะดิจิทัล",
      title: "จากไอเดียสู่เว็บไซต์แรกของคุณ",
      text: "ชวนเริ่มต้นเรียนรู้การออกแบบและพัฒนาเว็บไซต์ ผ่านโจทย์ใกล้ตัวที่นำไปต่อยอดได้",
      detail:
        "รู้จักองค์ประกอบของเว็บไซต์ ฝึกจัดวางเนื้อหา และทดลองสร้างหน้าเว็บง่าย ๆ ด้วยตัวเอง เหมาะสำหรับผู้สนใจทักษะดิจิทัลและนักศึกษาทุกสาขา\n\nเนื้อหานี้เป็นตัวอย่างประกาศ กำหนดการ สถานที่ และเงื่อนไขการเข้าร่วมจริงจะประกาศอีกครั้ง",
      date: "2026-10-29T09:00:00+07:00",
      image: "/assets/images/image-003.jpg",
      alt: "หน้าจอคอมพิวเตอร์แสดงการพัฒนาเว็บไซต์",
    },
    {
      id: "visual-story",
      label: "กิจกรรมสร้างสรรค์",
      title: "เล่าเรื่องให้ต่าง ผ่านมุมมองหลังเลนส์",
      text: "เปิดมุมมองใหม่ให้ภาพถ่าย เรียนรู้แสง องค์ประกอบ และการเล่าเรื่องด้วยภาพ",
      detail:
        "ทดลองสร้างเรื่องราวจากสิ่งรอบตัว ฝึกเลือกมุมภาพและใช้แสงให้สอดคล้องกับสิ่งที่อยากสื่อ พร้อมแลกเปลี่ยนมุมมองกับเพื่อนผู้สนใจการถ่ายภาพ\n\nนี่คือเนื้อหาประชาสัมพันธ์ตัวอย่าง ยังไม่ใช่ประกาศเปิดรับสมัครกิจกรรมจริง",
      date: "2026-10-27T09:00:00+07:00",
      image: "/assets/images/image-004.jpg",
      alt: "กล้องถ่ายภาพบนพื้นหลังสีส้ม",
    },
    {
      id: "learning-community",
      label: "ชุมชนการเรียนรู้",
      title: "แลกเปลี่ยนประสบการณ์ เปิดมุมมองใหม่ไปด้วยกัน",
      text: "พบเพื่อนต่างสาขา แบ่งปันไอเดีย และต่อยอดความรู้ผ่านการเรียนรู้ร่วมกัน",
      detail:
        "เปิดพื้นที่ให้ผู้เรียนได้พบปะ แลกเปลี่ยนประสบการณ์ และร่วมคิดไอเดียกับเพื่อนต่างสาขา พร้อมค้นหาโอกาสนำทักษะที่มีมาต่อยอดเป็นผลงานร่วมกัน\n\nเนื้อหานี้เป็นประชาสัมพันธ์ตัวอย่าง กำหนดการและรายละเอียดกิจกรรมจริงจะประกาศอีกครั้ง",
      date: "2026-10-25T09:00:00+07:00",
      image: "/assets/images/image-002.jpg",
      alt: "กลุ่มผู้เรียนแลกเปลี่ยนความคิดเห็นและทำงานร่วมกัน",
    },
  ];

  function home() {
    const upcoming = store.workshops
      .filter(
        (workshop) =>
          !workshop.closed &&
          !workshop.cancelled &&
          scheduledPhase(workshop) === "upcoming" &&
          occupancy(workshop.id) < workshop.capacity,
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt || b.start) -
            Date.parse(a.createdAt || a.start) ||
          Date.parse(a.start) - Date.parse(b.start),
      );
    const date = (value) =>
      new Date(value).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return `<div class="public-home"><section class="public-hero" aria-labelledby="public-title"><div class="public-hero-copy"><p class="public-institution">พื้นที่การเรียนรู้ของชาว BSRU</p><h1 id="public-title">รู้ข่าวก่อน<br>ไม่พลาดทุกการเรียนรู้</h1><p class="public-hero-description">ติดตามประกาศ ข่าวประชาสัมพันธ์ และกิจกรรมอบรมของมหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</p><div class="public-hero-actions"><button type="button" class="btn primary" data-action="public-section" data-id="workshops">ดูกิจกรรมที่เปิดรับ <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><button type="button" class="btn" data-action="login">เข้าสู่ระบบสมาชิก</button></div></div><figure class="public-hero-photo"><img src="/assets/images/image-002.jpg" alt="ภาพประกอบการเรียนรู้และแลกเปลี่ยนความคิดร่วมกัน" fetchpriority="high"><figcaption><span>เรียนรู้ แลกเปลี่ยน และเติบโตไปด้วยกัน</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></figcaption></figure></section><section class="public-announcements" aria-labelledby="public-news-title"><div class="public-section-heading"><div><p>เรื่องราวและโอกาสใหม่ในรั้วมหาวิทยาลัย</p><h2 id="public-news-title">ประกาศและประชาสัมพันธ์</h2></div></div><div class="public-news-board">${announcements.map((item, index) => `<article class="public-news-card ${index === 0 ? "is-featured" : ""}"><button type="button" class="public-news-photo" data-action="announcement" data-id="${item.id}" aria-label="อ่านประกาศ ${esc(item.title)}"><img src="${item.image}" alt="${item.alt}" loading="lazy" width="800" height="500"></button><div class="public-news-content"><div class="public-news-meta"><span>${item.label}</span><time datetime="${item.date}">${date(item.date)}</time></div><h3><button type="button" data-action="announcement" data-id="${item.id}">${item.title}</button></h3><p>${item.text}</p><button type="button" class="public-news-read" data-action="announcement" data-id="${item.id}">อ่านต่อ <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></article>`).join("")}</div></section><section id="public-workshops" class="public-workshops" aria-labelledby="public-workshops-title" tabindex="-1"><div class="public-section-heading"><div><p>เลือกทักษะใหม่ แล้วเริ่มลงมือทำ</p><h2 id="public-workshops-title">กิจกรรมล่าสุดที่ยังเปิดรับ</h2><span class="public-workshops-count">${number(upcoming.length)} กิจกรรม · เรียงจากรายการที่เพิ่มล่าสุด</span></div>${upcoming.length ? '<div class="public-carousel-controls" role="group" aria-label="เลื่อนดูกิจกรรม"><button type="button" data-action="public-carousel" data-id="prev" aria-label="กิจกรรมก่อนหน้า" aria-controls="public-workshop-track"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button><button type="button" data-action="public-carousel" data-id="next" aria-label="กิจกรรมถัดไป" aria-controls="public-workshop-track"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>' : ""}</div>${upcoming.length ? `<div id="public-workshop-track" class="public-workshop-track" tabindex="0" role="region" aria-label="กิจกรรมที่ยังเปิดรับ เลื่อนซ้ายหรือขวาเพื่อดูกิจกรรมเพิ่มเติม">${upcoming.map((w) => `<article class="public-workshop-card" data-workshop-id="${esc(w.id)}"><button type="button" class="public-workshop-photo" data-action="workshop-detail" data-id="${esc(w.id)}" aria-label="ดูรายละเอียด ${esc(w.title)}"><img src="${esc(w.cover || "/assets/images/image-002.jpg")}" alt="ภาพประกอบ ${esc(w.title)}" loading="lazy" width="640" height="360"><span class="public-workshop-open"><span aria-hidden="true"></span>เปิดรับสมัคร</span></button><div class="public-workshop-content"><span class="public-workshop-hours"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${number(w.hours)} ชั่วโมง</span><h3><button type="button" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.title)}</button></h3><div class="public-workshop-meta"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${esc(fmt(w.start))}</span><span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(w.place)}</span></div><div class="public-workshop-footer"><span>เหลือ <b>${number(Math.max(0, w.capacity - occupancy(w.id)))}</b> ที่นั่ง</span><button type="button" data-action="workshop-detail" data-id="${esc(w.id)}">ดูรายละเอียด <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></div></article>`).join("")}</div><p class="public-carousel-hint"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> เลื่อนเพื่อดูกิจกรรมเพิ่มเติม</p>` : empty("ยังไม่พบเวิร์กช็อปที่กำลังเปิดรับ ติดตามประกาศใหม่ได้ที่หน้านี้")}</section></div>`;
  }

  function announcementDetail(id) {
    const item = announcements.find((announcement) => announcement.id === id);
    if (!item) return;
    openModal(
      item.title,
      `<article class="public-announcement-modal"><img src="${item.image}" alt="${item.alt}" width="800" height="500"><div class="public-news-meta"><span>${item.label}</span></div><p class="public-announcement-intro">${item.text}</p><p class="public-announcement-detail">${item.detail}</p><button type="button" class="btn" data-action="close">ปิดประกาศ</button></article>`,
    );
  }
  function updatePublicCarousel() {
    const track = $("#public-workshop-track");
    if (!track) return;
    const end = Math.max(0, track.scrollWidth - track.clientWidth);
    const prev = $('[data-action="public-carousel"][data-id="prev"]'),
      next = $('[data-action="public-carousel"][data-id="next"]');
    if (prev) prev.disabled = track.scrollLeft <= 1;
    if (next) next.disabled = track.scrollLeft >= end - 1;
  }
  function scrollPublicWorkshops(direction) {
    const track = $("#public-workshop-track");
    if (!track) return;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    const width =
      track.querySelector(".public-workshop-card")?.getBoundingClientRect?.()
        .width || 320;
    if (direction === "first" || direction === "last")
      track.scrollTo?.({
        left: direction === "first" ? 0 : track.scrollWidth,
        behavior,
      });
    else
      track.scrollBy?.({
        left: (direction === "prev" ? -1 : 1) * (width + 20),
        behavior,
      });
  }
  function scrollPublicSection() {
    const section = $("#public-workshops");
    section?.scrollIntoView?.({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    section?.focus({ preventScroll: true });
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
          : !user() && phase(w) === "upcoming" && occupancy(id) < w.capacity
            ? '<button type="button" class="btn primary space" data-action="login">เข้าสู่ระบบเพื่อสมัครกิจกรรม</button>'
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
    const summaries = [
      {
        label: "กำลังจะเข้าร่วม",
        value: upcoming.length,
        unit: "กิจกรรม",
        caption: "วางแผนการเรียนรู้ครั้งถัดไป",
        icon: "fa-regular fa-calendar-check",
        page: "mine",
        action: "ดูกิจกรรมของฉัน",
      },
      {
        label: "ชั่วโมงสะสม",
        value: regs.reduce((sum, r) => sum + hoursOf(r), 0),
        unit: "ชั่วโมง",
        caption: "ยืนยันการเข้าร่วมแล้ว",
        icon: "fa-solid fa-graduation-cap",
        page: "reports",
        action: "ดูผลการอบรม",
      },
      {
        label: "สิ่งที่ต้องตรวจสอบ",
        value: unread,
        unit: "รายการใหม่",
        caption: "แจ้งเตือนที่ยังไม่อ่าน",
        icon: "fa-regular fa-bell",
        page: "notifications",
        action: "ดูการแจ้งเตือน",
      },
    ];
    return (
      '<div class="learner-dashboard">' +
      title(
        "พื้นที่การเรียนรู้",
        "สวัสดี, " + esc(user().name),
        "กิจกรรมและสิ่งที่ต้องทำของคุณ",
        '<span class="sync" data-sync-status role="status">' +
          esc(context.syncMessage) +
          "</span>",
      ) +
      '<section class="panel learner-next" aria-labelledby="learner-next-title">' +
      (next
        ? `<figure class="learner-next-media"><img src="${esc(next.cover || "/assets/images/bsru-workshop-logo.png")}" alt="" width="320" height="240" decoding="async">${next.photoSource ? `<figcaption><a href="${esc(next.photoSource.url)}" target="_blank" rel="noopener">ภาพ: ${esc(next.photoSource.credit)}</a></figcaption>` : ""}</figure><div class="learner-next-body"><div class="learner-next-heading"><div><span class="learner-kicker"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> กิจกรรมถัดไปของฉัน</span><h2 id="learner-next-title">${esc(next.title)}</h2></div><span class="learner-registered"><i class="fa-solid fa-check" aria-hidden="true"></i> ลงทะเบียนแล้ว</span></div><dl class="learner-next-meta"><div><dt><i class="fa-regular fa-clock" aria-hidden="true"></i> วันและเวลา</dt><dd>${esc(fmt(next.start))}<span>ถึง ${esc(fmt(next.end))}</span></dd></div><div><dt><i class="fa-solid fa-location-dot" aria-hidden="true"></i> สถานที่</dt><dd>${esc(next.place)}</dd></div></dl><div class="learner-next-footer"><div class="learner-next-facts"><span><i class="fa-regular fa-hourglass-half" aria-hidden="true"></i> ${number(next.hours)} ชั่วโมง</span><span><i class="fa-solid fa-users" aria-hidden="true"></i> เหลือ ${number(Math.max(0, next.capacity - occupancy(next.id)))} / ${number(next.capacity)} ที่นั่ง</span></div><button type="button" class="btn primary small" data-action="workshop-detail" data-id="${esc(next.id)}">ดูรายละเอียด <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button></div></div>`
        : '<div class="learner-next-empty-icon" aria-hidden="true"><i class="fa-regular fa-calendar-plus"></i></div><div class="learner-next-body"><span class="learner-kicker">กิจกรรมถัดไปของฉัน</span><h2 id="learner-next-title">เริ่มต้นการเรียนรู้ครั้งใหม่</h2><p class="muted">ยังไม่มีกิจกรรมที่กำลังจะเข้าร่วม เลือกกิจกรรมที่คุณสนใจได้เลย</p><div><button type="button" class="btn primary small" data-action="page" data-id="workshops">ค้นหากิจกรรม <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></div>') +
      "</section>" +
      `<div class="learner-summary-grid">${summaries.map((item) => `<section class="panel learner-summary"><div class="learner-summary-main"><h2>${item.label}</h2><div class="learner-summary-value"><strong>${number(item.value)}</strong><span>${item.unit}</span></div></div><span class="learner-summary-icon" aria-hidden="true"><i class="${item.icon}"></i></span><div class="learner-summary-footer"><span>${item.caption}</span><button type="button" data-action="page" data-id="${item.page}" aria-label="${item.action}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></section>`).join("")}</div>` +
      '<div class="row between space"><h2>กิจกรรมที่เปิดรับสมัคร</h2><button class="btn" data-action="page" data-id="workshops">ดูทั้งหมด</button></div><div class="grid three space">' +
      (store.workshops
        .filter((w) => phase(w) === "upcoming" && occupancy(w.id) < w.capacity)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 3)
        .map(card)
        .join("") || empty("ยังไม่มีกิจกรรมเปิดรับสมัคร")) +
      "</div></div>"
    );
  }

  function card(w) {
    const r = store.registrations.find(
        (r) => r.workshopId === w.id && r.userId === state.userId,
      ),
      n = occupancy(w.id),
      a = staff(),
      available = phase(w) === "upcoming" && n < w.capacity;
    return `<article class="card workshop-card"><div class="cover">${w.cover ? `<img src="${esc(w.cover)}" alt="ภาพประกอบ ${esc(w.title)}" loading="lazy" decoding="async" width="640" height="360">` : `<i class="fa-solid ${esc(w.icon || "fa-graduation-cap")}"></i>`}<span class="tag">${esc(w.category || "BSRU WORKSHOP")}</span></div><div class="cardbody">${w.photoSource ? `<a class="photo-credit" href="${esc(w.photoSource.url)}" target="_blank" rel="noopener">ภาพประกอบ: ${esc(w.photoSource.credit)}</a>` : ""}<div class="row between"><span class="badge phase-${phase(w)}">${phaseLabel(w)}</span>${r ? badge(r.status) : ""}</div><h3 class="workshop-card-title"><button class="activity-title" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.title)}</button></h3><div class="workshop-card-meta"><div class="workshop-card-schedule"><i class="fa-regular fa-calendar" aria-hidden="true"></i><div><span>${esc(fmt(w.start))}</span><span class="workshop-card-end">ถึง ${esc(fmt(w.end))}</span></div></div><div class="workshop-card-facts"><span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(w.place)}</span><span><i class="fa-regular fa-clock" aria-hidden="true"></i>${number(w.hours)} ชั่วโมง</span></div></div><div class="row between workshop-card-capacity"><span>ลงทะเบียน <b>${n} / ${w.capacity}</b></span><span>เหลือ ${Math.max(0, w.capacity - n)} ที่นั่ง</span></div><div class="progress"><span style="width:${Math.min(100, (n / w.capacity) * 100)}%"></span></div>${!user() ? `<button class="btn primary" data-action="login">เข้าสู่ระบบเพื่อสมัครกิจกรรม</button>` : a ? `<button class="btn primary" style="width:100%" data-action="participants-for" data-id="${esc(w.id)}">จัดการผู้เข้าร่วม</button><div class="row space"><button class="btn small" data-action="edit-workshop" data-id="${esc(w.id)}">แก้ไขกิจกรรม</button>${!w.closed && scheduledPhase(w) !== "finished" ? `<button class="btn small danger" data-action="close-workshop" data-id="${esc(w.id)}">ปิดเวิร์กช็อป</button>` : ""}</div>` : r && r.status !== "CANCELLED" ? `<button class="btn" style="width:100%" data-action="page" data-id="mine">ดูกิจกรรมของฉัน →</button>` : `<button class="btn primary" style="width:100%" data-action="enroll" data-id="${esc(w.id)}" ${!available ? "disabled" : ""}>${!available ? (n >= w.capacity ? "ที่นั่งเต็ม" : "ปิดรับลงทะเบียน") : r ? "ลงทะเบียนอีกครั้ง" : "ลงทะเบียนเวิร์กช็อป"} &nbsp; →</button>`}</div></article>`;
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
      '<div class="grid three workshop-cards">' +
      list
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .map(card)
        .join("") +
      "</div>"
    }${!list.length ? empty("ไม่พบเวิร์กช็อปที่ตรงกับตัวกรอง") : ""}`;
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

  let notificationView = "current",
    notificationId = null,
    notificationBusy = false;
  const pendingNotificationReads = new Set();
  const notificationReadLabel = (notice) =>
    notice.readAt
      ? notificationView === "history"
        ? "ประวัติแจ้งเตือน"
        : "อ่านแล้ว"
      : pendingNotificationReads.has(notice.id)
        ? "กำลังบันทึกการอ่าน…"
        : "ยังไม่ได้บันทึกสถานะอ่าน";
  const isActivityNotice = (n) =>
    ["attendance", "registration", "workshop"].includes(n.kind);
  const inNotificationHistory = (n) =>
    n.readAt && Date.parse(n.readAt) <= Date.now() - 72 * 3600000;

  function notificationContent() {
    const history = notificationView === "history";
    const mine = store.notifications.filter((n) => n.userId === state.userId);
    const selected = mine.find((n) => n.id === notificationId);
    const back = `<button type="button" class="btn small notification-back" data-action="${selected ? "notification-back" : "notification-current"}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${selected ? "กลับไปรายการ" : "แจ้งเตือนปัจจุบัน"}</button>`;
    if (selected) {
      const complaint =
        selected.kind === "complaint"
          ? store.complaints.find(
              (c) => c.id === selected.refId && c.userId === state.userId,
            )
          : null;
      const related = complaint
        ? `<button class="btn primary small" data-action="notification-go" data-id="my-complaints">ดูคำร้องของฉัน <span aria-hidden="true">↗</span></button>`
        : isActivityNotice(selected)
          ? `<button class="btn primary small" data-action="notification-go" data-id="reports">ดูรายงานผลและชั่วโมงอบรม <span aria-hidden="true">↗</span></button>`
          : "";
      return `<section id="notification-center" data-view="${notificationView}">${back}<article class="notification-detail" tabindex="-1"><span class="notification-detail-label" role="status">${notificationReadLabel(selected)}</span><h3>${esc(selected.title)}</h3><time datetime="${esc(selected.createdAt)}">${esc(fmt(selected.createdAt))}</time><p class="notification-detail-message">${esc(selected.body)}</p>${complaint ? context.complaintThread(complaint) : ""}${related}</article></section>`;
    }
    const list = mine.filter(
      (n) => Boolean(inNotificationHistory(n)) === history,
    );
    const visible = list
      .filter(
        (n) =>
          (state.notificationFilter === "all" ||
            (state.notificationFilter === "activity"
              ? isActivityNotice(n)
              : !isActivityNotice(n))) &&
          (!state.notificationQuery ||
            `${n.title} ${n.body}`
              .toLowerCase()
              .includes(state.notificationQuery.toLowerCase())),
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.id.localeCompare(a.id),
      );
    const tabs = [
      ["all", "ทั้งหมด", list.length],
      ["general", "ทั่วไป", list.filter((n) => !isActivityNotice(n)).length],
      ["activity", "กิจกรรม", list.filter(isActivityNotice).length],
    ];
    const rows = visible
      .map((n) => {
        const icon =
          n.kind === "complaint"
            ? "fa-comment-dots"
            : isActivityNotice(n)
              ? "fa-calendar-check"
              : "fa-bell";
        return `<button type="button" class="notification-center-row ${n.readAt ? "read" : "unread"}" data-action="notification-read" data-id="${esc(n.id)}" aria-label="${n.readAt ? "เปิดอ่าน" : "ยังไม่อ่าน"} ${esc(n.title)}"><span class="notification-center-icon" aria-hidden="true"><i class="fa-regular ${icon}"></i></span><span class="notification-center-copy"><strong>${esc(n.title)}</strong><span class="notification-center-preview">${esc(n.body)}</span><time datetime="${esc(n.createdAt)}">${esc(fmt(n.createdAt))}</time></span><span class="notification-center-indicator" aria-hidden="true">${n.readAt ? "›" : '<span class="notification-unread-dot"></span>'}</span></button>`;
      })
      .join("");
    return `<section id="notification-center" data-view="${notificationView}" aria-busy="${notificationBusy}"><div class="notification-center-heading">${history ? back : "<p>ข่าวสารและความเคลื่อนไหวของคุณ</p>"}<div class="notification-center-actions">${history ? `<button type="button" class="btn small notification-clear" data-action="notification-clear" ${list.length && !notificationBusy ? "" : "disabled"}><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Clear ประวัติ</button>` : `<button type="button" class="btn small" data-action="notification-history" title="ประวัติแจ้งเตือน" aria-label="เปิดประวัติแจ้งเตือน"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>ประวัติ</span></button>`}</div></div><div class="notification-center-toolbar"><div class="notification-center-filters" role="group" aria-label="หมวดการแจ้งเตือน">${tabs.map(([id, label, count]) => `<button type="button" data-action="notification-filter" data-id="${id}" class="${state.notificationFilter === id ? "active" : ""}" aria-pressed="${state.notificationFilter === id}">${label}<span>${count}</span></button>`).join("")}</div><label class="notification-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="notification-search" type="search" aria-label="ค้นหาการแจ้งเตือน" placeholder="ค้นหาการแจ้งเตือน" value="${esc(state.notificationQuery)}"></label></div><p class="notification-summary" role="status">${visible.length} รายการ${history ? "ในประวัติ" : ` · ยังไม่อ่าน ${list.filter((n) => !n.readAt).length} รายการ`}</p><div class="notification-center-list">${rows || `<div class="notification-center-empty"><i class="fa-regular ${history ? "fa-clock" : "fa-bell-slash"}" aria-hidden="true"></i><h3>${state.notificationQuery ? "ไม่พบรายการที่ค้นหา" : history ? "ยังไม่มีประวัติแจ้งเตือน" : "ไม่มีการแจ้งเตือนในหมวดนี้"}</h3><p>${state.notificationQuery ? "ลองค้นหาด้วยคำอื่น" : history ? "ข้อความที่อ่านครบ 3 วันจะเก็บไว้ที่นี่" : "เมื่อมีข้อความใหม่ จะแสดงที่นี่"}</p>${state.notificationQuery ? '<button type="button" class="btn small" data-action="clear-notification-search">ล้างคำค้นหา</button>' : ""}</div>`}</div><p class="notification-retention"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> ข้อความที่อ่านแล้วจะย้ายเข้าประวัติหลัง 3 วัน</p></section>`;
  }

  function refreshNotifications({ background = false } = {}) {
    const previous = $("#notification-center");
    if (!member() || !previous) return;
    if (background && notificationId) return;
    const active = document.activeElement;
    const scroll = $(".notification-center-list")?.scrollTop || 0;
    const next = notificationContent();
    previous.outerHTML = next;
    $("#dialog-title").textContent = notificationId
      ? "รายละเอียดการแจ้งเตือน"
      : notificationView === "history"
        ? "ประวัติแจ้งเตือน"
        : "การแจ้งเตือน";
    const list = $(".notification-center-list");
    if (list) list.scrollTop = scroll;
    if (previous.contains(active)) {
      const replacement = active.id
        ? document.getElementById(active.id)
        : [
            ...document.querySelectorAll("#notification-center [data-action]"),
          ].find(
            (item) =>
              item.dataset.action === active.dataset.action &&
              item.dataset.id === active.dataset.id,
          );
      replacement?.focus({ preventScroll: true });
    }
  }

  function openNotifications(view = "current") {
    if (!member()) return;
    notificationView = view === "history" ? "history" : "current";
    notificationId = null;
    state.notificationFilter = "all";
    state.notificationQuery = "";
    if ($("#notification-center")) refreshNotifications();
    else
      openModal(
        notificationView === "history" ? "ประวัติแจ้งเตือน" : "การแจ้งเตือน",
        notificationContent(),
      );
  }

  function notificationBack() {
    const id = notificationId;
    notificationId = null;
    refreshNotifications();
    [
      ...document.querySelectorAll(
        '#notification-center [data-action="notification-read"]',
      ),
    ]
      .find((item) => item.dataset.id === id)
      ?.focus();
  }

  async function readNotification(id) {
    const center = $("#notification-center");
    if (!member() || !center || notificationBusy) return;
    const actor = state.userId;
    const notice = store.notifications.find(
      (item) => item.id === id && item.userId === actor,
    );
    if (!notice) return;
    const needsRead = !notice.readAt && !pendingNotificationReads.has(id);
    if (needsRead) pendingNotificationReads.add(id);
    notificationId = id;
    refreshNotifications();
    $(".notification-detail")?.focus({ preventScroll: true });
    if (!needsRead) return;
    try {
      await saveNotificationAction("read", { id });
    } catch (error) {
      if (member() && actor === state.userId) toast(error.message, "error");
    } finally {
      pendingNotificationReads.delete(id);
      if (member() && actor === state.userId) {
        const label = $(".notification-detail-label");
        const saved = store.notifications.find(
          (item) => item.id === id && item.userId === actor,
        );
        if (notificationId === id && label && saved)
          label.textContent = notificationReadLabel(saved);
        refreshNotifications({ background: true });
      }
    }
  }

  async function clearNotificationHistory() {
    const center = $("#notification-center");
    if (
      !member() ||
      !center ||
      notificationView !== "history" ||
      notificationBusy
    )
      return;
    notificationBusy = true;
    try {
      if (
        !(await askConfirm(
          "ลบประวัติแจ้งเตือนทั้งหมดของคุณหรือไม่? ข้อความที่ยังอยู่ในแจ้งเตือนปัจจุบันจะไม่ถูกลบ และไม่สามารถกู้คืนประวัติที่ลบแล้วได้",
          "danger",
        ))
      )
        return;
      if (!center.isConnected || !member()) return;
      const button = center.querySelector('[data-action="notification-clear"]');
      if (button) button.disabled = true;
      const result = await saveNotificationAction("clear-history");
      if (!result || !center.isConnected || !member()) return;
      toast(`ลบประวัติแจ้งเตือนแล้ว ${result.deletedCount} รายการ`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      notificationBusy = false;
      if (center.isConnected) refreshNotifications();
    }
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
      return toast("กิจกรรมปิดรับหรือที่นั่งเต็มแล้ว", "warning");
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
        "warning",
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
  };
}
