/* v94: scrolling, focus e tastiera dei pannelli. Non legge o modifica i dati. */
(() => {
  "use strict";
  const root = document.documentElement;
  const body = document.body;
  let active = null;
  let returnFocus = null;
  let pageScroll = 0;
  let locked = false;
  let fullHeight = window.innerHeight;
  let viewportWidth = window.innerWidth;
  let frame = 0;
  const isVisible = (el) => el && !el.hidden && !el.classList.contains("hidden");
  const focusable = (el) => [...el.querySelectorAll(
    'button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
  )].filter((node) => node.getClientRects().length && !node.closest("[hidden],.hidden,[inert]"));

  function topOverlay() {
    const preview = document.getElementById("bf77PreviewOverlay");
    if (isVisible(preview)) return preview;
    for (const id of ["accountSetupBackdrop", "modalBackdrop", "detailBackdrop", "mobileMorePanel"]) {
      const el = document.getElementById(id);
      if (isVisible(el)) return el;
    }
    return null;
  }

  function viewport() {
    if (viewportWidth !== window.innerWidth) {
      viewportWidth = window.innerWidth;
      fullHeight = window.innerHeight;
    }
    const view = window.visualViewport;
    const height = view?.height || window.innerHeight;
    const top = view?.offsetTop || 0;
    const field = document.activeElement;
    const editing = field?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit])');
    if (!editing) fullHeight = window.innerHeight;
    else fullHeight = Math.max(fullHeight, window.innerHeight);
    const keyboard = !!editing && fullHeight - height > 120 && (view?.scale || 1) < 1.1;
    root.classList.toggle("bf-keyboard-open", keyboard);
    root.style.setProperty("--bf-viewport-height", `${Math.round(height)}px`);
    root.style.setProperty("--bf-viewport-top", `${Math.round(top)}px`);
    root.style.setProperty("--bf-keyboard-inset", `${Math.max(0, window.innerHeight - height - top)}px`);
  }

  function update() {
    const next = topOverlay();
    if (next !== active) {
      if (next && !locked) {
        returnFocus = document.activeElement;
        pageScroll = window.scrollY;
        root.style.setProperty("--bf-scroll-top", `${-pageScroll}px`);
        root.classList.add("bf-overlay-open");
        locked = true;
      }
      active = next;
      if (!next && locked) {
        root.classList.remove("bf-overlay-open");
        root.style.removeProperty("--bf-scroll-top");
        locked = false;
        window.scrollTo({ top: pageScroll, behavior: "instant" });
      }
      const full = !!next && next.id !== "mobileMorePanel";
      const shell = document.getElementById("appShell");
      if (shell) shell.inert = full;
      if (!full) {
        for (const el of document.querySelectorAll(".main-shell,.sidebar")) el.inert = !!next;
      } else {
        for (const el of document.querySelectorAll(".main-shell,.sidebar")) el.inert = false;
      }
      // Only the topmost dialog accepts focus, including Google setup over a job.
      for (const id of ["accountSetupBackdrop", "modalBackdrop", "detailBackdrop"]) {
        const el = document.getElementById(id);
        if (el) el.inert = isVisible(el) && el !== next;
      }
      if (next) {
        if (!next.contains(document.activeElement)) focusable(next)[0]?.focus({ preventScroll: true });
      } else if (returnFocus?.isConnected && !returnFocus.closest("[inert],.hidden,[hidden]")) {
        returnFocus.focus({ preventScroll: true });
      }
      if (!next) returnFocus = null;
    }
    viewport();
  }
  window.bf94UpdateOverlays = update;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  };
  const watcher = new MutationObserver(schedule);
  for (const id of ["accountSetupBackdrop", "modalBackdrop", "detailBackdrop", "mobileMorePanel"]) {
    const el = document.getElementById(id);
    if (el) watcher.observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });
  }
  watcher.observe(body, { childList: true });
  document.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      const close = active.querySelector("#bf77PreviewClose,#skipGoogleEmailBtn,#closeModalBtn,#closeDetail,#mobileMoreClose");
      close?.click();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = focusable(active);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  document.addEventListener("focusin", viewport);
  document.addEventListener("focusout", () => requestAnimationFrame(viewport));
  window.visualViewport?.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("scroll", viewport);
  window.addEventListener("resize", viewport);
  window.addEventListener("orientationchange", () => { fullHeight = window.innerHeight; schedule(); });
  update();
})();
