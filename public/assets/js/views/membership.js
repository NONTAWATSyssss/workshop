export function createMembershipViews(context) {
  const {
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
  } = context;
  let resetAvailable = false;
  let challenge = null;
  let grant = null;
  let accountActionBusy = false;
  let photoDraft = null;
  let photoRead = 0;
  let photoSave = 0;

  function releasePhoto() {
    photoDraft = null;
    photoRead++;
  }
  function avatar(account, className) {
    const initial = Array.from(account.name || "ผ")[0];
    const image = /^\/api\/avatars\/[^/?]+\?v=[a-f0-9]{64}$/.test(
      account.avatar || "",
    )
      ? account.avatar
      : "";
    return `<span class="${className}" data-avatar-initial="${esc(initial)}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" decoding="async">` : esc(initial)}</span>`;
  }
  function photoBusy(panel, busy) {
    panel.dataset.photoBusy = String(busy);
    panel.setAttribute("aria-busy", String(busy));
    panel
      .querySelectorAll("[data-photo-control], #account-photo-input")
      .forEach((control) => {
        control.disabled = busy;
      });
  }
  function previewPhoto(panel, image) {
    photoDraft = { panel, ownerId: user().id, image };
    panel.querySelector(".account-portrait").innerHTML = image
      ? `<img src="${esc(image)}" alt="" decoding="async">`
      : esc(Array.from(user().name || "ผ")[0]);
    panel.querySelector(".account-photo-preview-actions").hidden = false;
    panel.querySelector(".account-photo-remove").hidden = true;
    panel.querySelector("#account-photo-status").textContent = image
      ? "รูปตัวอย่าง · กดบันทึกเพื่อใช้รูปนี้"
      : "จะใช้ตัวอักษรแทนรูป · กดบันทึกเพื่อยืนยัน";
  }
  async function preparePhoto(input) {
    const panel = input.closest("#account-profile");
    const file = input.files?.[0];
    input.value = "";
    if (!file || !panel || panel.dataset.photoBusy === "true") return;
    const actor = user()?.id;
    const epoch = ++photoRead;
    const errorBox = panel.querySelector("#account-photo-error");
    errorBox.textContent = "";
    photoBusy(panel, true);
    let bitmap;
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw Error("เลือกรูป JPG, PNG หรือ WebP เท่านั้น");
      if (!file.size || file.size > 3 * 1024 * 1024)
        throw Error("กรุณาเลือกรูปขนาดไม่เกิน 3 MB");
      panel.querySelector("#account-photo-status").textContent =
        "กำลังเตรียมรูปตัวอย่าง…";
      bitmap = await window.createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (!panel.isConnected || user()?.id !== actor || epoch !== photoRead)
        return;
      if (
        !bitmap.width ||
        !bitmap.height ||
        bitmap.width * bitmap.height > 40000000
      )
        throw Error(
          "รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปความละเอียดต่ำกว่า 40 ล้านพิกเซล",
        );
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const graphics = canvas.getContext("2d");
      if (!graphics) throw Error("เตรียมรูปไม่สำเร็จ กรุณาลองใหม่");
      const side = Math.min(bitmap.width, bitmap.height);
      graphics.fillStyle = "#ffffff";
      graphics.fillRect(0, 0, 320, 320);
      graphics.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        320,
        320,
      );
      previewPhoto(panel, canvas.toDataURL("image/jpeg", 0.86));
    } catch (error) {
      if (panel.isConnected && epoch === photoRead && user()?.id === actor) {
        errorBox.textContent =
          error.message?.startsWith("กรุณา") ||
          error.message?.startsWith("เลือก") ||
          error.message?.startsWith("รูปมี")
            ? error.message
            : "เปิดรูปนี้ไม่ได้ กรุณาเลือกไฟล์รูปอื่น";
        panel.querySelector("#account-photo-status").textContent =
          photoDraft?.panel === panel
            ? "รูปตัวอย่างยังไม่ถูกบันทึก"
            : "JPG, PNG หรือ WebP · ไม่เกิน 3 MB";
      }
    } finally {
      bitmap?.close();
      if (panel.isConnected && epoch === photoRead) photoBusy(panel, false);
    }
  }
  const policy =
    "อย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ โดยไม่มีช่องว่าง";
  const passwordFeedback = (id, matching) =>
    `<div id="${id}-feedback" class="password-feedback" data-password-feedback="${matching ? "match" : "policy"}" data-state="empty"><div class="password-feedback-track" role="progressbar" aria-label="${matching ? "การยืนยันรหัสผ่าน" : "ความครบถ้วนของรหัสผ่าน"}" aria-valuemin="0" aria-valuemax="${matching ? 1 : 7}" aria-valuenow="0" aria-valuetext="ยังไม่ได้กรอก"><span class="password-feedback-fill" style="width:0%" aria-hidden="true"></span></div><div class="password-feedback-caption"><span class="password-feedback-status" role="status">${matching ? "กรอกอีกครั้งเพื่อยืนยัน" : "ยังไม่ได้กรอกรหัสผ่าน"}</span><span class="password-feedback-count" aria-hidden="true">${matching ? "" : "0/7"}</span></div><span class="password-feedback-hint" hidden></span></div>`;
  const passwordField = (label, name, confirmation = false, id = name) =>
    `<div class="field"><label for="${id}">${label}</label><div class="auth-password"><input id="${id}" name="${name}" type="password" autocomplete="${confirmation ? "new-password" : "current-password"}" maxlength="128" ${confirmation ? `aria-describedby="${id}-feedback"` : ""} required><button class="auth-password-toggle" type="button" data-action="auth-toggle-password" data-id="${id}" aria-label="แสดงรหัสผ่าน" title="แสดงรหัสผ่าน" aria-controls="${id}" aria-pressed="false"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></div>${confirmation ? passwordFeedback(id, name === "confirmation") : ""}</div>`;

  function updatePasswordFeedback(form) {
    const policyMeter = form?.querySelector(
      '[data-password-feedback="policy"]',
    );
    if (!policyMeter) return;
    const password = form.querySelector('[name="password"]');
    const confirmation = form.querySelector('[name="confirmation"]');
    const value = password.value;
    // Keep these criteria aligned with validNewPassword on the server; regression tests compare both.
    const checks = [
      [value.length >= 12 && value.length <= 128, "12–128 ตัวอักษร"],
      [/[A-Z]/.test(value), "ตัวพิมพ์ใหญ่ A–Z"],
      [/[a-z]/.test(value), "ตัวพิมพ์เล็ก a–z"],
      [/[0-9]/.test(value), "ตัวเลข 0–9"],
      [/[^A-Za-z0-9]/.test(value), "สัญลักษณ์"],
      [!/\s/.test(value), "ไม่มีช่องว่าง"],
      [
        ![
          "password123!",
          "password1234!",
          "qwerty123456!",
          "123456789abc!",
        ].includes(value.toLowerCase()),
        "หลีกเลี่ยงรหัสที่ใช้บ่อย",
      ],
    ];
    const score = value ? checks.filter(([passed]) => passed).length : 0;
    const complete = score === checks.length;
    const update = (root, state, amount, total, text, hint = "") => {
      if (!root) return;
      root.dataset.state = state;
      const bar = root.querySelector('[role="progressbar"]');
      bar.setAttribute("aria-valuenow", String(amount));
      bar.setAttribute("aria-valuetext", text);
      root.querySelector(".password-feedback-fill").style.width =
        `${Math.round((amount / total) * 100)}%`;
      const status = root.querySelector(".password-feedback-status");
      if (status.textContent !== text) status.textContent = text;
      root.querySelector(".password-feedback-count").textContent =
        total > 1 ? `${amount}/${total}` : "";
      const detail = root.querySelector(".password-feedback-hint");
      detail.textContent = hint;
      detail.hidden = !hint;
    };
    update(
      policyMeter,
      !value ? "empty" : complete ? "complete" : "incomplete",
      score,
      checks.length,
      !value
        ? "ยังไม่ได้กรอกรหัสผ่าน"
        : complete
          ? "ครบทุกเงื่อนไข"
          : "ยังไม่ครบเงื่อนไข",
      value && !complete
        ? `ยังขาด: ${checks
            .filter(([passed]) => !passed)
            .map(([, label]) => label)
            .join(" · ")}`
        : "",
    );
    if (complete || !value) password.removeAttribute("aria-invalid");
    if (!confirmation) return;
    const typed = Boolean(confirmation.value);
    const same = typed && confirmation.value === value;
    const validMatch = same && complete;
    const mismatch = typed && Boolean(value) && !same;
    if (mismatch) confirmation.setAttribute("aria-invalid", "true");
    else confirmation.removeAttribute("aria-invalid");
    update(
      form.querySelector('[data-password-feedback="match"]'),
      !typed
        ? "empty"
        : validMatch
          ? "complete"
          : mismatch
            ? "mismatch"
            : "incomplete",
      validMatch ? 1 : 0,
      1,
      !typed
        ? "กรอกอีกครั้งเพื่อยืนยัน"
        : !value
          ? "กรอกรหัสผ่านช่องแรกก่อน"
          : mismatch
            ? "รหัสผ่านยังไม่ตรงกัน"
            : !complete
              ? "ตรงกัน แต่รหัสยังไม่ครบเงื่อนไข"
              : "รหัสผ่านตรงกัน",
    );
  }

  const loginContent = (email = "", message = "") =>
    `<div class="auth-intro"><p>ยินดีต้อนรับกลับสู่ BSRU Workshop</p><span>เข้าสู่ระบบเพื่อสมัครกิจกรรมและติดตามการอบรมของคุณ</span></div>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ""}<form id="login-form" class="auth-form">${input("อีเมล หรือเบอร์โทรศัพท์", "identity", "text", `autocomplete="username" maxlength="150" value="${esc(email)}"`)}${passwordField("รหัสผ่าน", "password", false, "login-password")}<div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">เข้าสู่ระบบ</button></form><div class="auth-links"><button type="button" data-action="forgot">ลืมรหัสผ่าน</button><span>ยังไม่มีบัญชี? <button type="button" data-action="register">สมัครสมาชิก</button></span></div>`;
  const registerContent = () =>
    `<div class="auth-intro"><p>เริ่มต้นเรียนรู้ไปด้วยกัน</p><span>กรอกข้อมูลจริงและอีเมลที่คุณใช้งาน</span></div><form id="register-form" class="auth-form">${input("ชื่อ-นามสกุล", "name", "text", 'autocomplete="name" maxlength="120"')}<div class="grid two"><div class="field"><label for="type">ประเภทผู้ใช้งาน</label><select id="type" name="type" required><option value="นักศึกษา" selected>นักศึกษา</option><option value="อาจารย์">อาจารย์</option><option value="เจ้าหน้าที่">เจ้าหน้าที่</option></select></div>${input("รหัสประจำตัว", "code", "text", 'maxlength="30"')}</div>${input("อีเมล", "email", "email", 'autocomplete="email" maxlength="150" placeholder="name@example.com"')}${input("เบอร์โทรศัพท์", "phone", "tel", 'autocomplete="tel" inputmode="tel" maxlength="10"')}<div class="grid two">${passwordField("ตั้งรหัสผ่าน", "password", true)}${passwordField("ยืนยันรหัสผ่าน", "confirmation", true)}</div><p class="sub auth-policy">${policy}</p><div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">สมัครสมาชิก</button></form><p class="auth-return">มีบัญชีแล้ว? <button type="button" data-action="login">เข้าสู่ระบบ</button></p>`;

  function authModal(mode, email, message) {
    let layout = $("#auth-layout");
    if (!layout) {
      openModal(
        "เข้าสู่ระบบ",
        `<div class="login-layout auth-layout" id="auth-layout"><aside class="auth-visual" aria-label="ภาพประชาสัมพันธ์ BSRU Workshop"><img src="/assets/images/image-002.jpg" alt="กลุ่มผู้เรียนแลกเปลี่ยนความรู้ร่วมกัน" width="900" height="1100"><span class="auth-visual-brand"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> BSRU Workshop</span><div class="auth-visual-copy"><span>พื้นที่การเรียนรู้ของคุณ</span><h3>ทุกการเรียนรู้<br>เริ่มต้นที่นี่</h3><p>ค้นพบเวิร์กช็อปที่ใช่ พัฒนาทักษะใหม่<br>และเติบโตไปด้วยกัน</p></div><span class="auth-visual-footer">มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา</span></aside><section class="auth-form-panel" aria-label="บัญชี BSRU Workshop"><div class="auth-tabs" role="tablist" aria-label="เข้าสู่ระบบหรือสมัครสมาชิก"><button type="button" role="tab" id="auth-login-tab" data-action="login" aria-controls="auth-login-panel">เข้าสู่ระบบ</button><button type="button" role="tab" id="auth-register-tab" data-action="register" aria-controls="auth-register-panel">สมัครสมาชิก</button></div><div class="auth-panels"><div id="auth-login-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-login-tab">${loginContent()}</div><div id="auth-register-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-register-tab" hidden inert>${registerContent()}</div></div></section></div>`,
      );
      layout = $("#auth-layout");
    }
    if (!message && layout.querySelector('button[type="submit"]:disabled'))
      return;
    // Retain form nodes while switching; always mask revealed passwords on departure.
    layout.querySelectorAll(".auth-password-toggle").forEach((button) => {
      document.getElementById(button.dataset.id).type = "password";
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "แสดงรหัสผ่าน");
      button.title = "แสดงรหัสผ่าน";
      button.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
    });
    for (const value of ["login", "register"]) {
      const active = value === mode;
      const panel = $("#auth-" + value + "-panel");
      panel.hidden = !active;
      panel.toggleAttribute("inert", !active);
      const tab = $("#auth-" + value + "-tab");
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    $("#dialog-title").textContent =
      mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
    if (email !== undefined) $('#login-form [name="identity"]').value = email;
    if (message) {
      // A successful registration starts a clean form without replacing the dialog/media.
      $("#auth-register-panel").innerHTML = registerContent();
      $('#login-form [name="password"]').value = "";
      const notice = document.createElement("p");
      notice.className = "notice auth-success";
      notice.setAttribute("role", "status");
      notice.textContent = message;
      $("#auth-login-panel .notice")?.remove();
      $("#login-form").before(notice);
    }
    const panel = $("#auth-" + mode + "-panel");
    const field = panel.querySelector("input");
    if (document.activeElement?.closest(".auth-tabs")) {
      $("#auth-" + mode + "-tab").focus({ preventScroll: true });
    } else field?.focus({ preventScroll: true });
    $(".auth-form-panel").scrollTop = 0;
    updatePasswordFeedback($("#register-form"));
  }

  function loginModal(email, message) {
    authModal("login", email, message);
  }

  function registerModal() {
    authModal("register");
  }

  function forgotModal() {
    const email = user()?.email || "";
    if (!resetAvailable) {
      openModal(
        "ลืมรหัสผ่าน",
        '<div class="auth-intro"><p>การกู้รหัสผ่านทางอีเมลยังไม่พร้อมใช้งาน</p><span>กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ</span></div><button type="button" class="btn primary" data-action="login">กลับไปเข้าสู่ระบบ</button>',
      );
      return;
    }
    openModal(
      "ลืมรหัสผ่าน",
      `<p class="muted">กรอกอีเมลที่ใช้สมัครเพื่อรับรหัส OTP สำหรับตั้งรหัสผ่านใหม่</p><form id="forgot-form" class="auth-form">${input("อีเมลที่ใช้สมัคร", "contact", "email", `autocomplete="email" maxlength="150" value="${esc(email)}"`)}<div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">ส่งรหัส OTP</button></form><p class="auth-return"><button type="button" data-action="login">กลับไปเข้าสู่ระบบ</button></p>`,
    );
  }

  function otpModal() {
    openModal(
      "ยืนยันรหัส OTP",
      `<p>กรอกรหัส 6 หลักที่ส่งไปยัง <b>${esc(challenge.maskedContact || "อีเมลของคุณ")}</b></p><form id="otp-form" class="auth-form">${input("รหัส OTP", "code", "text", 'autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6"')}<div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">ยืนยันรหัส OTP</button></form><p class="sub">รหัสมีอายุ 5 นาที หากไม่พบอีเมล ให้ตรวจโฟลเดอร์ Spam</p><p class="auth-return"><button type="button" data-action="forgot">เปลี่ยนอีเมล / ขอรหัสอีกครั้ง</button></p>`,
    );
  }

  function resetModal() {
    openModal(
      "ตั้งรหัสผ่านใหม่",
      `<form id="reset-form" class="auth-form">${passwordField("รหัสผ่านใหม่", "password", true)}${passwordField("ยืนยันรหัสผ่านใหม่", "confirmation", true)}<p class="sub auth-policy">${policy}</p><div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">บันทึกรหัสผ่านใหม่</button></form>`,
    );
  }

  function accountMenu(account) {
    const isStaff = account.role === "staff";
    return `<div class="account-menu">
      <button type="button" class="account-menu-trigger" data-action="toggle-account-menu" aria-expanded="false" aria-controls="account-dropdown" aria-label="เมนูบัญชี ${esc(account.name)}">${avatar(account, "header-avatar")}</button>
      <nav id="account-dropdown" class="account-dropdown" aria-label="บัญชีผู้ใช้งาน" hidden>
        <div class="account-dropdown-heading"><div class="account-dropdown-name"><strong>${esc(account.name)}</strong><span class="role-pill ${isStaff ? "staff-role" : ""}"><i class="fa-solid ${isStaff ? "fa-shield-halved" : "fa-graduation-cap"}" aria-hidden="true"></i>${isStaff ? "เจ้าหน้าที่" : "ผู้เรียน"}</span></div><span>${esc(account.email)}</span></div>
        <button type="button" data-action="account-profile">ข้อมูลบัญชีของฉัน</button><button type="button" data-action="account-settings">ตั้งค่าบัญชี</button><button type="button" data-action="account-password">เปลี่ยนรหัสผ่าน</button><button type="button" data-action="logout">ออกจากระบบ</button>
      </nav></div>`;
  }

  function closeAccountMenu(returnFocus = false) {
    const menu = $("#account-dropdown");
    if (menu) menu.hidden = true;
    $('[data-action="toggle-account-menu"]')?.setAttribute(
      "aria-expanded",
      "false",
    );
    if (returnFocus) $('[data-action="toggle-account-menu"]')?.focus();
  }

  function accountModal(settings = false) {
    const account = user();
    if (!account) return;
    const details = `<dl class="account-profile-details">${[
      ["รหัสประจำตัว", account.code],
      ["เบอร์โทรศัพท์", account.phone],
      ["ประเภทผู้ใช้งาน", account.type],
      ["สิทธิ์", account.role === "staff" ? "เจ้าหน้าที่" : "สมาชิก"],
      ["คณะ / หน่วยงาน", account.faculty],
      ["สาขา", account.major],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${label}</dt><dd>${esc(value || "ยังไม่ได้ระบุ")}</dd></div>`,
      )
      .join("")}</dl>`;
    openModal(
      settings ? "ตั้งค่าบัญชี" : "ข้อมูลบัญชีของฉัน",
      settings
        ? `<form id="account-settings-form" class="auth-form">${input("ชื่อ-นามสกุล", "name", "text", `autocomplete="name" maxlength="120" value="${esc(account.name)}"`)}<div class="field"><label for="phone">เบอร์โทรศัพท์ (ไม่บังคับ)</label><input id="phone" name="phone" type="tel" maxlength="10" value="${esc(account.phone || "")}"></div><div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">บันทึกการเปลี่ยนแปลง</button></form>`
        : `<div id="account-profile" class="account-profile-view"><div class="account-profile-hero"><button type="button" class="account-portrait-button" data-photo-control data-action="account-photo-select" aria-label="เปลี่ยนรูปโปรไฟล์" aria-describedby="account-photo-status">${avatar(account, "account-portrait")}<span class="account-portrait-camera" aria-hidden="true"><i class="fa-solid fa-camera"></i></span></button><div class="account-profile-heading"><span class="account-profile-role"><i class="fa-solid ${account.role === "staff" ? "fa-shield-halved" : "fa-graduation-cap"}" aria-hidden="true"></i> ${account.role === "staff" ? "เจ้าหน้าที่" : "ผู้เรียน"}</span><h3>${esc(account.name)}</h3><p>${esc(account.email)}</p><span class="account-photo-hint">คลิกที่รูปเพื่อเปลี่ยนรูปโปรไฟล์</span></div></div><input id="account-photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="เลือกรูปโปรไฟล์" hidden><div class="account-photo-toolbar"><p id="account-photo-status" role="status">JPG, PNG หรือ WebP · ไม่เกิน 3 MB</p><button type="button" class="account-photo-remove" data-photo-control data-action="account-photo-remove" ${account.avatar ? "" : "hidden"}>ลบรูป</button></div><div id="account-photo-error" class="error" role="alert"></div><div class="account-photo-preview-actions" hidden><button type="button" class="btn primary small" data-photo-control data-action="account-photo-save">บันทึกรูปโปรไฟล์</button><button type="button" class="btn small" data-photo-control data-action="account-photo-cancel">ยกเลิก</button></div>${details}<div class="account-profile-footer"><span><i class="fa-solid fa-lock" aria-hidden="true"></i> ข้อมูลบัญชีของคุณ</span><button type="button" class="btn primary" data-action="account-settings"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> แก้ไขข้อมูลบัญชี</button></div></div>`,
    );
    if (!settings)
      $("#modal-root .dialog")?.classList.add("account-profile-dialog");
  }

  async function handleAction(action, button) {
    if (action.startsWith("account-photo-")) {
      const panel = button.closest("#account-profile");
      if (!panel || !user() || panel.dataset.photoBusy === "true") return true;
      const errorBox = panel.querySelector("#account-photo-error");
      errorBox.textContent = "";
      if (action === "account-photo-select")
        panel.querySelector("#account-photo-input").click();
      if (action === "account-photo-remove") {
        photoRead++;
        previewPhoto(panel, "");
      }
      if (action === "account-photo-cancel") {
        releasePhoto();
        panel.querySelector(".account-portrait").outerHTML = avatar(
          user(),
          "account-portrait",
        );
        panel.querySelector(".account-photo-preview-actions").hidden = true;
        panel.querySelector(".account-photo-remove").hidden = !user().avatar;
        panel.querySelector("#account-photo-status").textContent =
          "JPG, PNG หรือ WebP · ไม่เกิน 3 MB";
      }
      if (
        action === "account-photo-save" &&
        photoDraft?.panel === panel &&
        photoDraft.ownerId === user().id
      ) {
        const draft = photoDraft;
        const mutation = ++photoSave;
        photoBusy(panel, true);
        buttonFeedback(button, "loading", "กำลังบันทึกรูป…");
        try {
          const result = await apiRequest("/api/account/avatar", {
            method: "POST",
            body: JSON.stringify({ image: draft.image }),
          });
          if (user()?.id !== draft.ownerId || mutation !== photoSave)
            return true;
          context.onAccount(result);
          if (panel.isConnected) accountModal();
          toast(
            draft.image ? "บันทึกรูปโปรไฟล์แล้ว" : "ลบรูปโปรไฟล์แล้ว",
            "success",
          );
        } catch (error) {
          if (user()?.id === draft.ownerId) {
            if (panel.isConnected) errorBox.textContent = error.message;
            else toast(error.message, "error");
          }
        } finally {
          if (panel.isConnected) photoBusy(panel, false);
          if (button.isConnected) buttonFeedback(button, "idle");
        }
      }
      return true;
    }
    if (action === "login") {
      loginModal();
      return true;
    }
    if (action === "register") {
      registerModal();
      return true;
    }
    if (["forgot", "change-password", "account-password"].includes(action)) {
      closeAccountMenu();
      forgotModal();
      return true;
    }
    if (action === "auth-toggle-password") {
      const field = document.getElementById(button.dataset.id);
      if (field) {
        const show = field.type === "password";
        field.type = show ? "text" : "password";
        button.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
        button.title = show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน";
        button.setAttribute("aria-pressed", String(show));
        button.setAttribute(
          "aria-label",
          show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน",
        );
      }
      return true;
    }
    if (action === "toggle-account-menu") {
      const menu = $("#account-dropdown");
      if (menu) {
        menu.hidden = !menu.hidden;
        button.setAttribute("aria-expanded", String(!menu.hidden));
      }
      return true;
    }
    if (["account-profile", "account-settings"].includes(action)) {
      closeAccountMenu();
      accountModal(action === "account-settings");
      return true;
    }
    if (["logout", "switch"].includes(action)) {
      if (accountActionBusy || !user()) return true;
      const actor = user().id;
      accountActionBusy = true;
      closeAccountMenu();
      try {
        const confirmed = await askConfirm(
          action === "switch"
            ? "ต้องการออกจากบัญชีปัจจุบันเพื่อเข้าสู่ระบบด้วยบัญชีอื่นหรือไม่?"
            : "ต้องการออกจากระบบตอนนี้หรือไม่? คุณสามารถเข้าสู่ระบบใหม่ได้ทุกเมื่อ",
          "info",
          {
            title: action === "switch" ? "เปลี่ยนบัญชีผู้ใช้งาน" : "ออกจากระบบ",
            confirmLabel: "ออกจากระบบ",
            cancelLabel: "ใช้งานต่อ",
            icon: "fa-solid fa-arrow-right-from-bracket",
          },
        );
        if (!confirmed) {
          $('[data-action="toggle-account-menu"]')?.focus();
          return true;
        }
        if (actor !== user()?.id) return true;
        toast("กำลังออกจากระบบ…", "info");
        await apiRequest("/api/logout", { method: "POST", body: "{}" });
        if (actor !== user()?.id) return true;
        const catalogLoaded = await context.onLoggedOut();
        closeModal();
        if (action === "switch") loginModal();
        toast(
          catalogLoaded === false
            ? "ออกจากระบบแล้ว แต่โหลดกิจกรรมหน้าแรกไม่สำเร็จ กรุณาลองใหม่"
            : action === "switch"
              ? "ออกจากบัญชีเดิมแล้ว เข้าสู่ระบบด้วยบัญชีใหม่ได้เลย"
              : "ออกจากระบบเรียบร้อยแล้ว",
          catalogLoaded === false ? "warning" : "success",
        );
      } catch (error) {
        toast(error.message, "error");
      } finally {
        accountActionBusy = false;
      }
      return true;
    }
    return false;
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (
      ![
        "login-form",
        "register-form",
        "forgot-form",
        "otp-form",
        "reset-form",
        "account-settings-form",
      ].includes(form.id)
    )
      return;
    event.preventDefault();
    updatePasswordFeedback(form);
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const errorBox = form.querySelector(".error");
    errorBox.textContent = "";
    const loadingLabel = {
      "login-form": "กำลังเข้าสู่ระบบ…",
      "register-form": "กำลังสร้างบัญชี…",
      "forgot-form": "กำลังส่งรหัส…",
      "otp-form": "กำลังตรวจสอบรหัส…",
      "reset-form": "กำลังบันทึกรหัสผ่าน…",
      "account-settings-form": "กำลังบันทึกข้อมูล…",
    }[form.id];
    buttonFeedback(button, "loading", loadingLabel);
    const switches = [
      ...document.querySelectorAll(
        '#auth-layout [data-action="login"], #auth-layout [data-action="register"]',
      ),
    ];
    switches.forEach((control) => {
      control.disabled = true;
    });
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "login-form") {
        const session = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify(data),
        });
        if (!form.isConnected) return;
        buttonFeedback(button, "success", "กำลังเปิดหน้าหลัก…");
        await context.onAuthenticated(session);
        if (form.isConnected) {
          closeModal();
          toast("เข้าสู่ระบบแล้ว พร้อมเริ่มต้นการเรียนรู้", "success");
        }
      } else if (form.id === "register-form") {
        if (data.password !== data.confirmation)
          throw Error("ยืนยันรหัสผ่านไม่ตรงกัน");
        const result = await apiRequest("/api/registration/request", {
          method: "POST",
          body: JSON.stringify(data),
        });
        if (!form.isConnected) return;
        loginModal(
          result.email,
          "สมัครสมาชิกสำเร็จ เข้าสู่ระบบด้วยบัญชีใหม่ได้เลย",
        );
        toast("สร้างบัญชีสำเร็จ พร้อมเข้าสู่ระบบได้เลย", "success");
      } else if (form.id === "forgot-form") {
        challenge = await apiRequest("/api/otp/request", {
          method: "POST",
          body: JSON.stringify({
            ...data,
            purpose: "reset",
            channel: "email",
            portal: "auto",
          }),
        });
        if (!form.isConnected) return;
        otpModal();
        toast(
          challenge.message ||
            "หากอีเมลนี้มีบัญชี ระบบจะส่งรหัส OTP ให้ กรุณาตรวจ Inbox และ Spam",
          "info",
        );
      } else if (form.id === "otp-form") {
        const verified = await apiRequest("/api/otp/verify", {
          method: "POST",
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            code: data.code,
          }),
        });
        if (!form.isConnected) return;
        grant = verified.grant;
        resetModal();
        toast("ยืนยัน OTP สำเร็จ ตั้งรหัสผ่านใหม่ได้เลย", "success");
      } else if (form.id === "reset-form") {
        if (data.password !== data.confirmation)
          throw Error("ยืนยันรหัสผ่านไม่ตรงกัน");
        await apiRequest("/api/password/reset", {
          method: "POST",
          body: JSON.stringify({ ...data, grant }),
        });
        if (!form.isConnected) return;
        challenge = null;
        grant = null;
        const catalogLoaded = await context.onLoggedOut();
        loginModal("", "เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
        toast(
          catalogLoaded === false
            ? "เปลี่ยนรหัสผ่านแล้ว แต่โหลดกิจกรรมหน้าแรกไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง"
            : "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง",
          catalogLoaded === false ? "warning" : "success",
        );
      } else {
        const result = await apiRequest("/api/account", {
          method: "POST",
          body: JSON.stringify(data),
        });
        if (!form.isConnected) return;
        context.onAccount(result);
        closeModal();
        toast("บันทึกข้อมูลบัญชีแล้ว", "success");
      }
    } catch (error) {
      if (form.isConnected) {
        errorBox.textContent = error.message;
        if (error.field)
          form
            .querySelector(`[name="${error.field}"]`)
            ?.setAttribute("aria-invalid", "true");
      }
    } finally {
      switches.forEach((control) => {
        if (control.isConnected) control.disabled = false;
      });
      if (button.isConnected) {
        buttonFeedback(button, "idle");
      }
    }
  });
  const updatePasswordInput = (event) => {
    if (["password", "confirmation"].includes(event.target.name))
      updatePasswordFeedback(event.target.closest("form"));
  };
  document.addEventListener("input", updatePasswordInput);
  document.addEventListener("change", updatePasswordInput);
  document.addEventListener("change", (event) => {
    if (event.target.id === "account-photo-input") preparePhoto(event.target);
  });
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (
        image.matches?.(
          ".header-avatar img,.profile-avatar img,.account-portrait img",
        )
      ) {
        const parent = image.parentElement;
        parent.textContent = parent.dataset.avatarInitial || "ผ";
      }
    },
    true,
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-menu")) closeAccountMenu();
  });
  document.addEventListener("keydown", (event) => {
    const dialog = $("#auth-layout")?.closest(".dialog");
    if (dialog && event.key === "Tab") {
      const controls = [
        ...dialog.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ),
      ].filter(
        (control) =>
          !control.closest("[hidden], [inert]") &&
          control.getAttribute("tabindex") !== "-1",
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (
      !event.target.closest?.(".auth-tabs [role='tab']") ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const mode =
      event.key === "Home"
        ? "login"
        : event.key === "End"
          ? "register"
          : event.target.id === "auth-login-tab"
            ? "register"
            : "login";
    authModal(mode);
  });
  const actions = new Set([
    "login",
    "register",
    "forgot",
    "change-password",
    "account-password",
    "auth-toggle-password",
    "toggle-account-menu",
    "account-profile",
    "account-settings",
    "account-photo-select",
    "account-photo-remove",
    "account-photo-save",
    "account-photo-cancel",
    "logout",
    "switch",
  ]);
  return {
    avatar,
    releasePhoto,
    accountMenu,
    closeAccountMenu,
    handleAction,
    isAction: (action) => actions.has(action),
    loginModal,
    configure(session) {
      resetAvailable = session.passwordResetAvailable === true;
    },
  };
}
