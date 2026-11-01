// Keep calendar drafts separate from the active workshop filters until Apply.
export function positionPickerPanel(panel, trigger, { maxHeight = 560 } = {}) {
  const anchor = trigger.getBoundingClientRect?.();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (!anchor || !viewportWidth || !viewportHeight) return;
  const margin = 12,
    gap = 8;
  const width = Math.min(anchor.width || 360, viewportWidth - margin * 2);
  const top = Math.max(margin, anchor.bottom + gap);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.max(margin, Math.min(anchor.left, viewportWidth - margin - width))}px`;
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `${Math.max(0, Math.min(maxHeight, viewportHeight - top - margin))}px`;
}

export function createDateRangePicker({
  esc,
  getRange,
  onChange,
  idPrefix = "",
  floating = false,
}) {
  const id = (name) => `${idPrefix}${name}`;
  const selector = (name) => `#${id(name)}`;
  const root = () => document.querySelector(selector("workshop-date-range"));
  const fieldElement = (name) => root()?.querySelector(selector(name));
  const isOpen = () =>
    fieldElement("date-range-trigger")?.getAttribute("aria-expanded") ===
    "true";
  const parse = (value) => new Date(`${value}T00:00:00`);
  const iso = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const label = (value) =>
    parse(value).toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  let from = "",
    to = "",
    month,
    choosingEnd = false,
    activePeriod = null,
    inTopLayer = false;

  function field(range = getRange()) {
    const [start, end] = range;
    const text =
      start && end
        ? `${label(start)} – ${label(end)}`
        : start
          ? `ตั้งแต่ ${label(start)}`
          : end
            ? `ถึง ${label(end)}`
            : "เลือกช่วงวันที่";
    return `<div id="${id("workshop-date-range")}" class="date-range"><button type="button" id="${id("date-range-trigger")}" class="date-range-trigger" aria-label="ช่วงวันที่: ${esc(text)}" aria-controls="${id("date-range-panel")}" aria-expanded="false"><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${esc(text)}</span></button><div id="${id("date-range-panel")}" class="date-range-panel"${floating ? ' popover="manual"' : ""} role="group" aria-label="เลือกช่วงวันที่" hidden></div></div>`;
  }

  function positionFloatingPanel() {
    if (!floating || !isOpen()) return;
    positionPickerPanel(
      fieldElement("date-range-panel"),
      fieldElement("date-range-trigger"),
    );
  }

  function showMonth(value) {
    const date = value ? parse(value) : new Date();
    month = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function yearOptions(year) {
    const currentYear = new Date().getFullYear();
    const firstYear = Math.min(currentYear - 100, year);
    const lastYear = Math.max(currentYear + 100, year);
    return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
      const value = firstYear + index;
      return periodOption("year", value, value + 543);
    }).join("");
  }

  function periodOption(period, value, text) {
    return `<button type="button" role="option" aria-selected="false" tabindex="-1" data-date-option="${period}" data-period-value="${value}"><span class="date-period-option-label">${esc(text)}</span><i class="fa-solid fa-check" aria-hidden="true"></i></button>`;
  }

  function periodControl(period, name, options) {
    return `<div class="date-range-select"><button type="button" id="${id(`range-${period}`)}" class="date-period-trigger" data-date-period="${period}" aria-label="${name}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id(`range-${period}-options`)}"><span class="date-period-label"></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div id="${id(`range-${period}-options`)}" class="date-period-options" role="listbox" aria-label="${name}" hidden>${options}</div></div>`;
  }

  function closePeriod(restoreFocus = false) {
    if (!activePeriod) return;
    const trigger = fieldElement(`range-${activePeriod}`);
    if (restoreFocus) trigger?.focus();
    trigger?.setAttribute("aria-expanded", "false");
    const list = fieldElement(`range-${activePeriod}-options`);
    if (list) list.hidden = true;
    activePeriod = null;
  }

  function focusOption(option) {
    if (!option) return;
    for (const row of option.parentElement.querySelectorAll('[role="option"]'))
      row.tabIndex = row === option ? 0 : -1;
    option.focus({ preventScroll: floating });
    if (floating) {
      const list = option.parentElement;
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
    } else option.scrollIntoView?.({ block: "nearest" });
  }

  function openPeriod(period) {
    closePeriod();
    activePeriod = period;
    fieldElement(`range-${period}`).setAttribute("aria-expanded", "true");
    const list = fieldElement(`range-${period}-options`);
    list.hidden = false;
    focusOption(list.querySelector('[aria-selected="true"]'));
  }

  function syncPeriod(period, value, text) {
    const trigger = fieldElement(`range-${period}`);
    trigger.value = String(value);
    trigger.querySelector(".date-period-label").textContent = text;
    trigger.setAttribute(
      "aria-label",
      `${period === "month" ? "เลือกเดือน" : "เลือกปี พ.ศ."} ${text}`,
    );
    const list = fieldElement(`range-${period}-options`);
    if (
      period === "year" &&
      !list.querySelector(`[data-period-value="${value}"]`)
    )
      list.innerHTML = yearOptions(value);
    for (const option of list.querySelectorAll('[role="option"]')) {
      const selected = option.dataset.periodValue === String(value);
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
  }

  function monthNavigation() {
    const months = Array.from({ length: 12 }, (_, value) =>
      periodOption(
        "month",
        value,
        new Date(2000, value, 1).toLocaleDateString("th-TH", { month: "long" }),
      ),
    ).join("");
    return `<div class="date-range-month"><button type="button" data-date-action="previous" aria-label="เดือนก่อนหน้า"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><div class="date-range-period">${periodControl("month", "เลือกเดือน", months)}${periodControl("year", "เลือกปี พ.ศ.", yearOptions(month.getFullYear()))}</div><button type="button" data-date-action="next" aria-label="เดือนถัดไป"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div>`;
  }

  function calendar(focusDate) {
    const year = month.getFullYear(),
      index = month.getMonth();
    const count = new Date(year, index + 1, 0).getDate();
    const firstDay = month.getDay();
    const today = iso(new Date());
    const selected = from || to;
    const active =
      focusDate ||
      (selected && selected.slice(0, 7) === iso(month).slice(0, 7)
        ? selected
        : today.slice(0, 7) === iso(month).slice(0, 7)
          ? today
          : iso(month));
    const monthLabel = month.toLocaleDateString("th-TH", {
      month: "long",
      year: "numeric",
    });
    const cells = Array.from(
      { length: Math.ceil((firstDay + count) / 7) * 7 },
      (_, i) => {
        const day = i - firstDay + 1;
        if (day < 1 || day > count) return "<td></td>";
        const value = iso(new Date(year, index, day));
        const endpoint = value === from || value === to;
        const inside = from && to && value > from && value < to;
        const rangeClass =
          from && to && from < to
            ? value === from
              ? "range-start"
              : value === to
                ? "range-end"
                : inside
                  ? "in-range"
                  : ""
            : "";
        return `<td class="${rangeClass}"><button type="button" data-date="${value}" class="date-range-day${endpoint ? " selected" : ""}" tabindex="${value === active ? 0 : -1}" aria-label="${esc(label(value))}" aria-pressed="${endpoint}"${value === today ? ' aria-current="date"' : ""}>${day}</button></td>`;
      },
    );
    let rows = "";
    for (let i = 0; i < cells.length; i += 7)
      rows += `<tr>${cells.slice(i, i + 7).join("")}</tr>`;
    return `<table class="date-range-calendar" aria-label="${esc(monthLabel)}"><thead><tr>${["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."].map((day) => `<th scope="col">${day}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function updateCalendar(focusDate) {
    const picker = root();
    fieldElement("range-start").value = from;
    fieldElement("range-end").value = to;
    syncPeriod(
      "month",
      month.getMonth(),
      month.toLocaleDateString("th-TH", { month: "long" }),
    );
    syncPeriod("year", month.getFullYear(), month.getFullYear() + 543);
    picker.querySelector(".date-range-grid").innerHTML = calendar(focusDate);
    picker.querySelector(".date-range-hint").textContent = choosingEnd
      ? "เลือกวันสิ้นสุดในปฏิทิน"
      : from && to
        ? "กดใช้ช่วงวันที่ เพื่อดูรายการกิจกรรมในช่วงที่เลือก"
        : "เลือกวันเริ่มต้น แล้วเลือกวันสิ้นสุด";
    if (focusDate)
      picker
        .querySelector(`[data-date="${focusDate}"]`)
        ?.focus({ preventScroll: floating });
    positionFloatingPanel();
  }

  function open() {
    activePeriod = null;
    inTopLayer = false;
    [from, to] = getRange();
    choosingEnd = false;
    showMonth(from || to);
    const picker = root();
    fieldElement("date-range-panel").innerHTML =
      `<div class="date-range-heading"><strong>เลือกช่วงวันที่</strong><button type="button" class="date-range-close" data-date-action="close" aria-label="ปิดปฏิทิน"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="date-range-inputs"><label for="${id("range-start")}"><span>วันเริ่มต้น</span><input id="${id("range-start")}" type="date"></label><label for="${id("range-end")}"><span>วันสิ้นสุด</span><input id="${id("range-end")}" type="date"></label></div><div class="date-range-days">${monthNavigation()}<div class="date-range-grid"></div></div><p class="date-range-hint" aria-live="polite"></p><div class="date-range-actions"><button type="button" class="btn small" data-date-action="clear">ล้างวันที่</button><button type="button" class="btn small primary" data-date-action="apply">ใช้ช่วงวันที่</button></div>`;
    updateCalendar();
    fieldElement("date-range-trigger").setAttribute("aria-expanded", "true");
    const panel = fieldElement("date-range-panel");
    panel.hidden = false;
    if (floating && typeof panel.showPopover === "function") {
      panel.showPopover();
      inTopLayer = true;
    }
    positionFloatingPanel();
    picker
      .querySelector('[data-date][tabindex="0"]')
      ?.focus({ preventScroll: floating });
  }

  function close(restoreFocus = false) {
    if (!isOpen()) return;
    closePeriod();
    // Return focus before hiding the panel that may contain the active control.
    if (restoreFocus) fieldElement("date-range-trigger").focus();
    if (inTopLayer) {
      fieldElement("date-range-panel").hidePopover();
      inTopLayer = false;
    }
    fieldElement("date-range-trigger").setAttribute("aria-expanded", "false");
    fieldElement("date-range-panel").hidden = true;
  }

  function apply(start, end) {
    if (start && end && start > end) [start, end] = [end, start];
    close(true);
    onChange(start, end);
    fieldElement("date-range-trigger")?.focus();
  }

  function click(event) {
    const picker = event.target.closest?.(selector("workshop-date-range"));
    if (!picker) {
      close();
      return false;
    }
    const periodTrigger = event.target.closest("[data-date-period]");
    if (periodTrigger) {
      if (activePeriod === periodTrigger.dataset.datePeriod) closePeriod(true);
      else openPeriod(periodTrigger.dataset.datePeriod);
      return true;
    }
    const option = event.target.closest("[data-date-option]");
    if (option) {
      const value = Number(option.dataset.periodValue);
      if (option.dataset.dateOption === "month") month.setMonth(value);
      else month.setFullYear(value);
      closePeriod(true);
      updateCalendar();
      return true;
    }
    if (!event.target.closest(".date-range-select")) closePeriod();
    if (event.target.closest(selector("date-range-trigger"))) {
      event.preventDefault();
      if (isOpen()) close(true);
      else open();
    } else if (event.target.closest("[data-date]")) {
      const value = event.target.closest("[data-date]").dataset.date;
      if (!choosingEnd) {
        from = value;
        to = "";
        choosingEnd = true;
      } else {
        [from, to] = [from, value].sort();
        choosingEnd = false;
      }
      updateCalendar(value);
    } else {
      const action =
        event.target.closest("[data-date-action]")?.dataset.dateAction;
      if (action === "apply") apply(from, to);
      else if (action === "clear") apply("", "");
      else if (action === "close") close(true);
      else if (action === "previous" || action === "next") {
        month.setMonth(month.getMonth() + (action === "next" ? 1 : -1));
        updateCalendar();
        picker.querySelector(`[data-date-action="${action}"]`).focus();
      }
    }
    return true;
  }

  function change(event) {
    if (![id("range-start"), id("range-end")].includes(event.target.id))
      return false;
    if (event.target.id === id("range-start")) from = event.target.value;
    else to = event.target.value;
    choosingEnd = false;
    showMonth(event.target.value || from || to);
    updateCalendar();
    return true;
  }

  function keydown(event) {
    if (!isOpen()) return false;
    if (activePeriod) {
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        closePeriod(true);
        return event.key === "Escape";
      }
      if (
        ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        const options = [
          ...root().querySelectorAll(
            `${selector(`range-${activePeriod}-options`)} [role="option"]`,
          ),
        ];
        const index = options.indexOf(document.activeElement);
        const offset = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(options.length - 1, index + offset[event.key]),
                );
        focusOption(options[next]);
        return true;
      }
    }
    const periodTrigger = event.target.closest?.("[data-date-period]");
    if (periodTrigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openPeriod(periodTrigger.dataset.datePeriod);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return true;
    }
    const day = event.target.closest?.("[data-date]");
    if (
      !day ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    )
      return false;
    event.preventDefault();
    const date = parse(day.dataset.date);
    const offsets = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -date.getDay(),
      End: 6 - date.getDay(),
    };
    if (event.key === "PageUp" || event.key === "PageDown") {
      const target = new Date(
        date.getFullYear(),
        date.getMonth() + (event.key === "PageUp" ? -1 : 1),
        1,
      );
      target.setDate(
        Math.min(
          date.getDate(),
          new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
        ),
      );
      date.setTime(target.getTime());
    } else date.setDate(date.getDate() + offsets[event.key]);
    showMonth(iso(date));
    updateCalendar(iso(date));
    return true;
  }

  if (floating) {
    window.addEventListener?.("resize", positionFloatingPanel);
    document.addEventListener(
      "scroll",
      (event) => {
        if (!fieldElement("date-range-panel")?.contains(event.target))
          positionFloatingPanel();
      },
      true,
    );
  }
  return { field, click, change, keydown, close };
}
