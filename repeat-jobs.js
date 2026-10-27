/* v95 · Nuove lavorazioni da una commessa esistente.
   Ogni file riceve un nuovo identificativo; gli originali non vengono riutilizzati come copie. */
(() => {
  "use strict";
  let sourceId = "";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (kind) => `${kind}_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  const pending = (job) => (job.files || []).filter((file) => file.repeatCopyFromDriveId && !file.driveFileId);

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
    info.textContent = `Da ${source.code}: ${source.files?.length || 0} file e ${source.rawPieces?.length || 0} grezzi. Indicazioni recuperate; ore e cronometro ripartono da zero. I file saranno copiati nella nuova commessa alla sincronizzazione con Drive.`;
  }
  function build(job) {
    if (!sourceId) return job;
    const source = db.jobs.find((entry) => entry.id === sourceId);
    if (!source) throw new Error("La commessa di partenza è stata rimossa. Riapri la lavorazione da ripetere.");
    const fileIds = new Map();
    job.files = (source.files || []).map((file) => {
      const from = file.driveFileId || file.repeatCopyFromDriveId;
      if (!from) throw new Error(`Il file “${file.name}” non ha un collegamento Drive valido. Ricollegalo nella commessa originale prima di ripetere il lavoro.`);
      if (!Object.hasOwn(CATEGORY_LABELS, file.category)) throw new Error(`Categoria non riconosciuta per “${file.name}”.`);
      const id = uid("file");
      fileIds.set(file.id, id);
      return {
        id, name: file.name, category: file.category, size: Number(file.size || 0),
        mimeType: file.mimeType || "", addedAt: now(), repeatCopyFromDriveId: from,
      };
    });
    // Remap both the selected Fusion file and every saved setup/stock reference.
    const remap = (value) => {
      if (!value || typeof value !== "object") return;
      for (const key of Object.keys(value)) {
        if (key === "fusionFileId") value[key] = fileIds.get(value[key]) || "";
        else if (key === "fileId") value[key] = fileIds.get(value[key]) || null;
        else if (key === "driveFileId") delete value[key];
        else remap(value[key]);
      }
    };
    job.rawPieces = clone(source.rawPieces || []);
    remap(job.rawPieces);
    for (const piece of job.rawPieces) piece.id = uid("piece");
    job.status = "Da progettare";
    job.workSessions = [];
    job.repeatedFrom = { id: source.id, code: source.code };
    // job is a fresh whitelist of form fields: no old folders, timer, quote or dates.
    return job;
  }
  function panel(job) {
    const count = pending(job).length;
    return `<div class="bf95-repeat-actions"><button type="button" class="btn secondary" data-repeat-job="${esc(job.id)}">${icon("refresh")} Ripeti lavorazione</button>${job.repeatedFrom ? `<small>Ripetizione di <b>${esc(job.repeatedFrom.code)}</b></small>` : ""}</div>${count ? `<div class="bf95-repeat-notice" role="status"><div><strong>${count} file da copiare</strong><p>Le copie indipendenti verranno create su Drive alla sincronizzazione. Gli originali restano nella lavorazione precedente.</p></div><button type="button" id="bf95CompleteRepeat" class="btn secondary">Completa copia file</button></div>` : ""}`;
  }
  function updateStockReferences(value, fileId, driveId) {
    if (!value || typeof value !== "object") return;
    if (value.fileId === fileId) value.driveFileId = driveId;
    for (const child of Object.values(value)) if (child && typeof child === "object") updateStockReferences(child, fileId, driveId);
  }
  function refreshProgress(job, file) {
    if (selectedJobId !== job.id) return;
    const root = document.getElementById("detailContent");
    const notice = root.querySelector(".bf95-repeat-notice");
    const count = pending(job).length;
    if (!count) notice?.remove();
    else if (notice) notice.querySelector("strong").textContent = `${count} file da copiare`;
    const remove = [...root.querySelectorAll("[data-file-remove]")].find((button) => button.dataset.fileRemove === file.id);
    const actions = remove?.closest(".file-actions");
    if (actions) actions.innerHTML = fileButtons(file);
  }
  async function copyPending(job, folders) {
    for (const file of pending(job)) {
      if (!db.jobs.includes(job) || !job.files.includes(file)) continue;
      setSyncState("syncing", `Copia file · ${job.code}`, file.name);
      let copied;
      try {
        copied = await BadfishDrive.copyJobFile(file, folders);
        if (!copied?.id || copied.id === file.repeatCopyFromDriveId) throw new Error("La copia non ha restituito un nuovo file valido.");
      } catch (error) {
        throw new Error(`Copia di “${file.name}” non completata: ${error.message}. I file ancora in attesa verranno ripresi alla prossima sincronizzazione.`);
      }
      if (!db.jobs.includes(job) || !job.files.includes(file)) continue;
      file.driveFileId = copied.id;
      file.name = copied.name || file.name;
      file.size = Number(copied.size || file.size || 0);
      file.mimeType = copied.mimeType || file.mimeType || "";
      delete file.repeatCopyFromDriveId;
      updateStockReferences(job.rawPieces, file.id, copied.id);
      job.updatedAt = now();
      persistLocal({ renderNow: false });
      refreshProgress(job, file);
    }
  }
  document.addEventListener("click", async (event) => {
    const repeat = event.target.closest("[data-repeat-job]");
    if (repeat) { open(repeat.dataset.repeatJob); return; }
    const finish = event.target.closest("#bf95CompleteRepeat");
    if (!finish) return;
    if (syncing) return toast("Sincronizzazione già in corso. Attendi il completamento.");
    if (!navigator.onLine) return toast("Sei offline. Collega Drive quando torni online per completare la copia dei file.", true);
    const id = selectedJobId;
    finish.disabled = true;
    try {
      await ensureConnected();
      await syncDrive(true);
    } catch (error) { toast(error.message, true); }
    finally {
      if (selectedJobId === id && db.jobs.some((job) => job.id === id)) openDetail(id);
      else if (finish.isConnected) finish.disabled = false;
    }
  });
  window.BadfishRepeats = { resetForm, build, panel, pending, copyPending };
})();
