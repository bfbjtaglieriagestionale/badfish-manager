(() => {
  "use strict";
  const trigger = document.getElementById("mobileMoreButton"),
    panel = document.getElementById("mobileMorePanel"),
    backdrop = document.getElementById("mobileMoreBackdrop"),
    close = document.getElementById("mobileMoreClose");
  if (!trigger || !panel || !backdrop || !close) return;
  const mainViews = new Set(["dashboard", "jobs", "quotes"]);
  function setOpen(open, returnFocus = false) {
    panel.hidden = !open;
    backdrop.hidden = !open;
    panel.setAttribute("aria-hidden", String(!open));
    trigger.setAttribute("aria-expanded", String(open));
    window.bf94UpdateOverlays?.();
    if (open) close.focus();
    else if (returnFocus) trigger.focus();
  }
  function updateActive() {
    const active = document.querySelector(".view.active");
    const current = active?.id?.replace(/View$/, "");
    if (!current) return;
    for (const btn of document.querySelectorAll(
      ".mobile-more-grid [data-view]",
    )) {
      const selected = btn.dataset.view === current;
      btn.classList.toggle("active", selected);
      if (selected) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    }
    const inMore = !mainViews.has(current);
    trigger.classList.toggle("active", inMore);
    if (inMore) trigger.setAttribute("aria-current", "page");
    else trigger.removeAttribute("aria-current");
  }
  trigger.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false, true));
  backdrop.addEventListener("click", () => setOpen(false, true));
  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-view]")) setOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-view]")) queueMicrotask(updateActive);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false, true);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 860 && !panel.hidden) setOpen(false);
  });
  updateActive();
})();
