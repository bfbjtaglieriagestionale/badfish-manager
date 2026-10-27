/* Badfish v8.7 — solo organizzazione della scheda commessa; non modifica i dati. */
(() => {
  "use strict";
  let lastTab = "files";
  function enhance() {
    const root = document.getElementById("detailContent");
    if (
      !root ||
      !root.querySelector(".detail-shell") ||
      root.querySelector(".bf87-tabs")
    )
      return;
    const shell = root.querySelector(".detail-shell");
    const oldNav = shell.querySelector(".bf77-jump");
    const work = shell.querySelector(".bf-work-layout");
    const fileGrid = shell.querySelector(".detail-grid");
    if (!oldNav || !work || !fileGrid) return;
    const headings = shell.querySelectorAll(".bf77-section-heading");
    headings.forEach((x) => x.remove());
    const names = [
      ["files", "File e programmi"],
      ["hours", "Ore di lavoro"],
      ["sizes", "Misure grezzi"],
      ["details", "Dettagli e note"],
    ];
    const nav = document.createElement("div");
    nav.className = "bf87-tabs";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Sezioni della commessa");
    const panes = {};
    const group = document.createElement("div");
    group.className = "bf87-content";
    names.forEach(([key, label], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bf87-tab";
      b.textContent = label;
      b.id = "bf87-tab-" + key;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "bf87-pane-" + key);
      b.setAttribute("aria-selected", String(i === 0));
      b.tabIndex = i === 0 ? 0 : -1;
      nav.appendChild(b);
      const pane = document.createElement("div");
      pane.className = "bf87-pane";
      pane.id = "bf87-pane-" + key;
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", b.id);
      pane.hidden = i !== 0;
      group.appendChild(pane);
      panes[key] = pane;
      b.addEventListener("click", () => {
        lastTab = key;
        activate(key);
      });
      b.addEventListener("keydown", (event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const buttons = [...nav.querySelectorAll("button")];
        const at = buttons.indexOf(b);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length;
        buttons[next].click();
        buttons[next].focus();
      });
    });
    function activate(key) {
      [...nav.querySelectorAll("button")].forEach((b) => {
        const chosen = b.id === "bf87-tab-" + key;
        b.setAttribute("aria-selected", String(chosen));
        b.tabIndex = chosen ? 0 : -1;
      });
      for (const [name, pane] of Object.entries(panes))
        pane.hidden = name !== key;
    }
    const take = (selector, pane) => {
      const el = work.querySelector(selector);
      if (el) pane.appendChild(el);
    };
    take(".bf-clock-panel", panes.hours);
    take(".bf-nc-panel", panes.sizes);
    take(".bf-tech-panel", panes.sizes);
    const biz = shell.querySelector(".bf-business-panel");
    if (biz) panes.details.appendChild(biz);
    const columns = [...fileGrid.children];
    if (columns[0]) panes.files.appendChild(columns[0]);
    if (columns[1]) panes.details.appendChild(columns[1]);
    oldNav.replaceWith(nav);
    nav.after(group);
    work.remove();
    fileGrid.remove();
    activate(lastTab);
  }
  window.bf87Enhance = enhance;
  // Il dettaglio viene costruito e ricostruito dalla app; osserviamo solo il suo contenitore.
  const root = document.getElementById("detailContent");
  if (root) {
    new MutationObserver(() => {
      if (root.querySelector(".detail-shell") && !root.querySelector(".bf87-tabs")) enhance();
    }).observe(root, { childList: true });
    enhance();
  }
})();
