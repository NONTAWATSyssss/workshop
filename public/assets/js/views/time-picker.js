export function createTimePicker({ esc, positionPanel, onChange, onOpen }) {
  let active = null;
  const pad = (value) => String(value).padStart(2, "0");

  function field(name, label, value) {
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "09:00";
    return `<div class="field"><label for="${name}-trigger">${esc(label)}</label><div class="workshop-time-picker" data-time-picker="${name}"><input type="hidden" name="${name}" id="${name}" value="${time}"><button type="button" class="workshop-time-trigger" id="${name}-trigger" data-time-toggle="${name}" aria-expanded="false" aria-controls="${name}-panel"><i class="fa-regular fa-clock" aria-hidden="true"></i><span class="workshop-time-value">${time}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div class="workshop-time-panel" id="${name}-panel" popover="manual" role="group" aria-label="เลือก${esc(label)}" hidden></div></div></div>`;
  }

  function close(restoreFocus = false) {
    if (!active) return;
    if (restoreFocus && active.trigger.isConnected)
      active.trigger.focus({ preventScroll: true });
    active.trigger.setAttribute("aria-expanded", "false");
    if (active.promoted && active.panel.isConnected) active.panel.hidePopover();
    active.panel.hidden = true;
    active = null;
  }

  function focusOption(option) {
    if (!option) return;
    for (const item of option.parentElement.querySelectorAll('[role="option"]'))
      item.tabIndex = item === option ? 0 : -1;
    option.focus({ preventScroll: true });
    const list = option.parentElement;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      list.scrollTop + list.clientHeight
    )
      list.scrollTop =
        option.offsetTop + option.offsetHeight - list.clientHeight;
  }

  function syncDraft() {
    for (const option of active.panel.querySelectorAll('[role="option"]')) {
      const selected =
        option.dataset.timeValue === active[option.dataset.timeOption];
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
    active.panel.querySelector('[data-time-action="apply"]').textContent =
      `ใช้เวลา ${active.hour}:${active.minute}`;
  }

  function reposition() {
    if (active?.panel.isConnected)
      positionPanel(active.panel, active.trigger, { maxHeight: 360 });
  }

  function open(trigger) {
    close();
    onOpen?.();
    const root = trigger.closest("[data-time-picker]");
    const panel = root.querySelector(".workshop-time-panel");
    const [hour, minute] = root.querySelector("input").value.split(":");
    active = { root, panel, trigger, hour, minute, promoted: false };
    const options = (column, count) =>
      Array.from(
        { length: count },
        (_, index) =>
          `<button type="button" role="option" aria-selected="false" tabindex="-1" data-time-option="${column}" data-time-value="${pad(index)}">${pad(index)}</button>`,
      ).join("");
    panel.innerHTML = `<div class="workshop-time-heading"><strong>เลือกเวลา</strong><span>24 ชั่วโมง</span></div><div class="workshop-time-columns"><div><span>ชั่วโมง</span><div class="workshop-time-options" role="listbox" aria-label="ชั่วโมง">${options("hour", 24)}</div></div><div><span>นาที</span><div class="workshop-time-options" role="listbox" aria-label="นาที">${options("minute", 60)}</div></div></div><div class="workshop-time-actions"><button type="button" class="btn small" data-time-action="cancel">ยกเลิก</button><button type="button" class="btn small primary" data-time-action="apply"></button></div>`;
    syncDraft();
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    if (typeof panel.showPopover === "function") {
      panel.showPopover();
      active.promoted = true;
    }
    reposition();
    focusOption(
      panel.querySelector('[data-time-option="hour"][aria-selected="true"]'),
    );
  }

  function click(event) {
    const trigger = event.target.closest?.("[data-time-toggle]");
    if (trigger) {
      if (active?.trigger === trigger) close(true);
      else open(trigger);
      return true;
    }
    if (!active) return false;
    if (!active.panel.contains(event.target)) {
      close();
      return false;
    }
    const option = event.target.closest("[data-time-option]");
    if (option) {
      active[option.dataset.timeOption] = option.dataset.timeValue;
      syncDraft();
      focusOption(option);
    }
    const action =
      event.target.closest("[data-time-action]")?.dataset.timeAction;
    if (action === "cancel") close(true);
    if (action === "apply") {
      const value = `${active.hour}:${active.minute}`;
      const name = active.root.dataset.timePicker;
      active.root.querySelector("input").value = value;
      active.trigger.querySelector(".workshop-time-value").textContent = value;
      close(true);
      onChange(name, value);
    }
    return true;
  }

  function keydown(event) {
    if (!active) {
      const trigger = event.target.closest?.("[data-time-toggle]");
      if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(trigger);
        return true;
      }
      return false;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return true;
    }
    const option = event.target.closest?.("[data-time-option]");
    if (!option) return false;
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const column = option.dataset.timeOption === "hour" ? "minute" : "hour";
      focusOption(
        active.panel.querySelector(
          `[data-time-option="${column}"][aria-selected="true"]`,
        ),
      );
      return true;
    }
    if (
      ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      const items = [
        ...option.parentElement.querySelectorAll('[role="option"]'),
      ];
      const index = items.indexOf(option);
      const offset = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : Math.max(
                0,
                Math.min(items.length - 1, index + offset[event.key]),
              );
      focusOption(items[next]);
      return true;
    }
    return false;
  }

  window.addEventListener?.("resize", reposition);
  document.addEventListener(
    "scroll",
    (event) => {
      if (active && !active.panel.contains(event.target)) reposition();
    },
    true,
  );
  return { field, click, keydown, close };
}
