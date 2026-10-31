export function createMembershipViews(context) {
  const { $, esc, input, user, openModal, closeModal, apiRequest, toast } =
    context;
  let resetAvailable = false;
  let challenge = null;
  let grant = null;
  const policy =
    "อย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ โดยไม่มีช่องว่าง";
  const passwordField = (label, name, confirmation = false) =>
    `<div class="field"><label for="${name}">${label}</label><div class="auth-password"><input id="${name}" name="${name}" type="password" autocomplete="${confirmation ? "new-password" : "current-password"}" maxlength="128" required><button class="auth-password-toggle" type="button" data-action="auth-toggle-password" data-id="${name}" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div></div>`;

  function loginModal(email = "", message = "") {
    openModal(
      "เข้าสู่ระบบ",
      `<div class="auth-intro"><p>ยินดีต้อนรับกลับสู่ BSRU Workshop</p><span>เข้าสู่ระบบเพื่อสมัครกิจกรรมและติดตามการอบรมของคุณ</span></div>${message ? `<p class="notice" role="status">${esc(message)}</p>` : ""}<form id="login-form" class="auth-form">${input("อีเมล หรือเบอร์โทรศัพท์", "identity", "text", `autocomplete="username" maxlength="150" value="${esc(email)}"`)}${passwordField("รหัสผ่าน", "password")}<div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">เข้าสู่ระบบ</button></form><div class="auth-links"><button type="button" data-action="forgot">ลืมรหัสผ่าน</button><span>ยังไม่มีบัญชี? <button type="button" data-action="register">สมัครสมาชิก</button></span></div>`,
    );
    $('#login-form [name="identity"]')?.focus();
  }

  function registerModal() {
    openModal(
      "สมัครสมาชิก",
      `<div class="auth-intro"><p>เริ่มต้นเรียนรู้ไปด้วยกัน</p><span>กรอกข้อมูลจริงและอีเมลที่คุณใช้งาน</span></div><form id="register-form" class="auth-form">${input("ชื่อ-นามสกุล", "name", "text", 'autocomplete="name" maxlength="120"')}<div class="grid two"><div class="field"><label for="type">ประเภทผู้ใช้งาน</label><select id="type" name="type" required><option value="นักศึกษา" selected>นักศึกษา</option><option value="อาจารย์">อาจารย์</option><option value="เจ้าหน้าที่">เจ้าหน้าที่</option></select></div>${input("รหัสประจำตัว", "code", "text", 'maxlength="30"')}</div>${input("อีเมล", "email", "email", 'autocomplete="email" maxlength="150" placeholder="name@example.com"')}${input("เบอร์โทรศัพท์", "phone", "tel", 'autocomplete="tel" inputmode="tel" maxlength="10"')}${passwordField("ตั้งรหัสผ่าน", "password", true)}${passwordField("ยืนยันรหัสผ่าน", "confirmation", true)}<p class="sub auth-policy">${policy}</p><div class="error" role="alert"></div><button class="btn primary auth-submit" type="submit">สมัครสมาชิก</button></form><p class="auth-return">มีบัญชีแล้ว? <button type="button" data-action="login">เข้าสู่ระบบ</button></p>`,
    );
    $('#register-form [name="name"]')?.focus();
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
      <button type="button" class="account-menu-trigger" data-action="toggle-account-menu" aria-expanded="false" aria-controls="account-dropdown" aria-label="เมนูบัญชี ${esc(account.name)}"><span class="header-avatar" aria-hidden="true">${esc(Array.from(account.name)[0] || "ผ")}</span></button>
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
    const details = `<dl class="account-details">${[
      ["ชื่อ-นามสกุล", account.name],
      ["อีเมล", account.email],
      ["รหัสประจำตัว", account.code],
      ["เบอร์โทรศัพท์", account.phone],
      ["ประเภทผู้ใช้งาน", account.type],
      ["สิทธิ์", account.role === "staff" ? "เจ้าหน้าที่" : "สมาชิก"],
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
        : `${details}<button type="button" class="btn primary" data-action="account-settings">แก้ไขข้อมูลบัญชี</button>`,
    );
  }

  async function handleAction(action, button) {
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
        button.textContent = show ? "ซ่อน" : "แสดง";
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
      try {
        await apiRequest("/api/logout", { method: "POST", body: "{}" });
        await context.onLoggedOut();
        closeModal();
        if (action === "switch") loginModal();
      } catch (error) {
        toast(error.message);
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
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const label = button.textContent;
    const errorBox = form.querySelector(".error");
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "กำลังดำเนินการ…";
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "login-form") {
        const session = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await context.onAuthenticated(session);
        closeModal();
      } else if (form.id === "register-form") {
        if (data.password !== data.confirmation)
          throw Error("ยืนยันรหัสผ่านไม่ตรงกัน");
        const result = await apiRequest("/api/registration/request", {
          method: "POST",
          body: JSON.stringify(data),
        });
        loginModal(
          result.email,
          "สมัครสมาชิกสำเร็จ เข้าสู่ระบบด้วยบัญชีใหม่ได้เลย",
        );
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
        otpModal();
      } else if (form.id === "otp-form") {
        const verified = await apiRequest("/api/otp/verify", {
          method: "POST",
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            code: data.code,
          }),
        });
        grant = verified.grant;
        resetModal();
      } else if (form.id === "reset-form") {
        if (data.password !== data.confirmation)
          throw Error("ยืนยันรหัสผ่านไม่ตรงกัน");
        await apiRequest("/api/password/reset", {
          method: "POST",
          body: JSON.stringify({ ...data, grant }),
        });
        challenge = null;
        grant = null;
        await context.onLoggedOut();
        loginModal("", "เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
      } else {
        const result = await apiRequest("/api/account", {
          method: "POST",
          body: JSON.stringify(data),
        });
        context.onAccount(result);
        closeModal();
        toast("บันทึกข้อมูลบัญชีแล้ว");
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
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = label;
      }
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-menu")) closeAccountMenu();
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
    "logout",
    "switch",
  ]);
  return {
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
