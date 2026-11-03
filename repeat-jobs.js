/* v110 · Ripeti dati e grezzi senza duplicare allegati su Drive. */
(() => {
  "use strict";
  let sourceId = "";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (kind) => `${kind}_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  const pending = () => [];
  function cancelPending(job) {
    if (!job.repeatedFrom) return false;
    const removed = new Set((job.files || []).filter(file => file.repeatCopyFromDriveId && !file.driveFileId).map(file => file.id));
    if (!removed.size) return false;
    job.files = (job.files || []).filter(file => !removed.has(file.id));
    const clean = value => {
      if (!value || typeof value !== "object") return;
      for (const key of Object.keys(value)) {
        if ((key === "fileId" || key === "fusionFileId") && removed.has(value[key])) value[key] = key === "fileId" ? null : "";
        else clean(value[key]);
      }
    };
    clean(job.rawPieces);
    job.updatedAt = now();
    return true;
  }

  function resetForm() {
    sourceId = "";
    const form = document.getElementById("jobForm");
    if (!form) return;
    form.elements.status.disabled = false;
    document.getElementById("bf95RepeatInfo").hidden = true;
    document.getElementById("bf95JobHeading").textContent = "Crea commessa";
    form.querySelector('[type="submit"]').textContent = "Crea commessa";
  }
  function nextCode(code) {
    let n = 1;
    const used = new Set(db.jobs.map((job) => String(job.code || "").toLowerCase()));
    while (used.has(`${code}-R${String(n).padStart(2, "0")}`.toLowerCase())) n++;
    return `${code}-R${String(n).padStart(2, "0")}`;
  }
  function open(id) {
    const source = db.jobs.find((job) => job.id === id);
    if (!source) return toast("La commessa di partenza non è più disponibile.", true);
    openNewJob();
    sourceId = source.id;
    const form = document.getElementById("jobForm");
    for (const key of ["client", "article", "material", "quantity", "notes"]) {
      form.elements[key].value = source[key] ?? (key === "quantity" ? 1 : "");
    }
    form.elements.code.value = nextCode(source.code);
    form.elements.dueDate.value = "";
    form.elements.status.value = "Da progettare";
    form.elements.status.disabled = true;
    document.getElementById("bf95JobHeading").textContent = "Ripeti lavorazione";
    form.querySelector('[type="submit"]').textContent = "Crea nuova lavorazione";
    const info = document.getElementById("bf95RepeatInfo");
    info.hidden = false;
    info.textContent = `Da ${source.code}: ${source.rawPieces?.length || 0} grezzi e indicazioni recuperati. Nessun allegato viene copiato. Le ore ripartono da zero; il tempo CNC precedente resta come riferimento per il countdown.`;
  }
  function build(job) {
    if (!sourceId) return job;
    const source = db.jobs.find((entry) => entry.id === sourceId);
    if (!source) throw new Error("La commessa di partenza è stata rimossa. Riapri la lavorazione da ripetere.");
    job.files = [];
    // Remap both the selected Fusion file and every saved setup/stock reference.
    const remap = (value) => {
      if (!value || typeof value !== "object") return;
      for (const key of Object.keys(value)) {
        if (key === "fusionFileId") value[key] = "";
        else if (key === "fileId") value[key] = null;
        else if (key === "driveFileId") delete value[key];
        else remap(value[key]);
      }
    };
    job.rawPieces = clone(source.rawPieces || []);
    remap(job.rawPieces);
    for (const piece of job.rawPieces) piece.id = uid("piece");
    job.status = "Da progettare";
    job.cncReferenceSeconds = (source.workSessions || []).filter(s => s.phase === "Lavorazione CNC").reduce((n, s) => n + Math.max(0, Number(s.seconds ?? Number(s.minutes || 0) * 60) || 0), 0) || Number(source.cncReferenceSeconds) || 0;
    job.workSessions = [];
    job.repeatedFrom = { id: source.id, code: source.code };
    // job is a fresh whitelist of form fields: no old folders, timer, quote or dates.
    return job;
  }
  function panel(job) {
    return `<div class="bf95-repeat-actions"><button type="button" class="btn secondary" data-repeat-job="${esc(job.id)}">${icon("refresh")} Ripeti lavorazione</button>${job.repeatedFrom ? `<small>Ripetizione di <b>${esc(job.repeatedFrom.code)}</b></small>` : ""}</div>`;
  }
  async function copyPending() {}
  document.addEventListener("click", async (event) => {
    const repeat = event.target.closest("[data-repeat-job]");
    if (repeat) { open(repeat.dataset.repeatJob); return; }

  });
  window.BadfishRepeats = { resetForm, build, panel, pending, copyPending, cancelPending };
})();
