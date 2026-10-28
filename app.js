const LOCAL_DB_KEY = "badfish_manager_db_v3";
const LAST_SYNC_KEY = "badfish_manager_last_sync";
const GOOGLE_EMAIL_KEY = "badfish_google_email_v1";
const ACCEPTS = {
  fusion: ".f3d,.f3z",
  step: ".stp,.step",
  nc: ".nc,.tap,.cnc,.gcode,.txt",
  drawings: ".pdf,.dwg,.dxf",
  photos: "image/*,.heic,.heif",
};
const STATUSES = [
  "Da progettare",
  "Progettazione",
  "Da programmare",
  "In lavorazione",
  "Controllo qualità",
  "Completata",
  "Consegnata",
];
const CATEGORY_LABELS = {
  fusion: "Fusion 360",
  step: "STEP",
  nc: "Programma NC",
  drawings: "Disegno / PDF",
  photos: "Foto",
};
const CATEGORY_SHORT = {
  fusion: "FUSION",
  step: "STEP",
  nc: "NC",
  drawings: "PDF",
  photos: "FOTO",
};

function bfStockPanel(j) {
  const pieces = Array.isArray(j.rawPieces) ? j.rawPieces : [];
  const files = (j.files || []).filter((f) => /\.f3d$/i.test(f.name || ""));
  const fmt = (n) =>
    Number(n).toLocaleString("it-IT", { maximumFractionDigits: 6 });
  return `<section class="detail-section bf-nc-panel"><div class="bf-section-title"><h4>Grezzi dei singoli pezzi</h4><span class="bf-tag">DA FUSION</span></div><p class="bf-help">Legge le dimensioni del grezzo salvate nel setup Fusion. Aggiungi una scheda per ogni grezzo diverso.</p><button class="btn primary" id="bfAddRawPiece">+ Aggiungi pezzo</button><div class="bf-piece-list">${
    pieces
      .map((r, i) => {
        const stock = r.stock?.sourceType === "fusion-stock" ? r.stock : null;
        return `<div class="bf-piece-card" data-piece="${esc(r.id)}"><div class="bf-section-title"><h4>${esc(r.title || `Pezzo ${i + 1}`)}</h4><button type="button" class="btn subtle" data-piece-delete="${esc(r.id)}">Elimina</button></div><label class="field-label">Titolo del pezzo<input data-piece-title="${esc(r.id)}" maxlength="160" value="${esc(r.title || "")}"></label><label class="field-label">Progetto Fusion su Drive<select data-piece-file="${esc(r.id)}"><option value="">Seleziona un file .f3d</option>${files.map((f) => `<option value="${esc(f.id)}" ${r.fusionFileId === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label><button type="button" class="btn secondary" data-piece-analyze="${esc(r.id)}">Leggi grezzo da Fusion</button><label class="field-label bf-local-fusion">Oppure leggi un file dal dispositivo<input type="file" accept=".f3d" data-piece-local="${esc(r.id)}"></label>${r.fusionSetups?.length > 1 ? `<label class="field-label">Setup di lavorazione<select data-piece-setup="${esc(r.id)}"><option value="">Scegli il setup</option>${r.fusionSetups.map((s) => `<option value="${esc(s.id)}" ${stock?.id === s.id ? "selected" : ""}>${esc(s.name)}${s.error ? " · non leggibile" : ""}</option>`).join("")}</select></label>` : ""}${r.stockError ? `<p class="bf-nc-warn" role="alert">${esc(r.stockError)}</p>` : ""}${stock ? `<div class="bf-nc-results">${["Lunghezza X", "Larghezza Y", "Altezza Z"].map((label, axis) => `<div class="bf-nc-number"><small>${label}</small><strong>${fmt(stock.dimensions[axis])} mm</strong></div>`).join("")}</div><p class="bf-help"><b>Volume del grezzo: ${fmt(stock.volumeCm3)} cm³</b><br>${esc(stock.fileName)} · ${esc(stock.name)}<br>Dimensioni configurate in Fusion · ${esc(formatDateTime(stock.measuredAt))}</p>` : `<p class="bf-help">${r.estimate ? "La precedente stima NC non viene usata: leggi il grezzo dal progetto Fusion." : "Nessun grezzo letto."}</p>`}</div>`;
      })
      .join("") ||
    '<p class="bf-help">Aggiungi il primo pezzo per leggere il suo grezzo.</p>'
  }</div><p class="bf-help">Le misure corrispondono al setup salvato nel progetto. Verifica che il grezzo fisico corrisponda a quello impostato.</p></section>`;
}
const bfStockReads = new WeakMap();
function bfApplyFusionSetups(piece, setups, source) {
  piece.fusionSetups = setups.map((s) => ({ ...s, ...source }));
  piece.stock = null;
  piece.stockError = "";
  if (setups.length === 1) {
    const s = piece.fusionSetups[0];
    if (s.error) piece.stockError = s.error;
    else piece.stock = s;
  }
}

function bfClockFormat(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
function bfRunningSeconds(j) {
  return j.timerStartedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - Date.parse(j.timerStartedAt)) / 1000),
      ) + Math.max(0, Number(j.timerAccumulatedSeconds) || 0)
    : Math.max(0, Number(j.timerAccumulatedSeconds) || 0);
}
function bfSessionSeconds(j) {
  return (j.workSessions || []).reduce(
    (n, s) =>
      n +
      (Number.isFinite(Number(s.seconds))
        ? Number(s.seconds)
        : Number(s.minutes || 0) * 60),
    0,
  );
}
function bfTimerPanel(j) {
  const running = !!j.timerStartedAt,
    paused = !running && !!j.timerAccumulatedSeconds;
  const sessions = j.workSessions || [];
  return `<section class="detail-section bf-clock-panel"><div class="bf-section-title"><h4>Registro ore di lavoro</h4><span class="bf-tag">${running ? "● IN CORSO" : paused ? "IN PAUSA" : "PRONTO"}</span></div><p class="bf-help">Il cronometro usa l'ora reale: continua a conteggiare anche se chiudi la pagina. Salva ogni sessione nella commessa.</p><div class="bf-clock-display" id="bfTimerClock">${bfClockFormat(bfRunningSeconds(j))}</div><label class="field-label">Fase di lavoro<select id="bfPhase">${["Preparazione", "Lavorazione CNC", "Finitura", "Altro"].map((x) => `<option ${x === (j.timerPhase || "Lavorazione CNC") ? "selected" : ""}>${x}</option>`).join("")}</select></label><div class="bf-clock-actions">${running ? '<button id="bfPauseTimer" class="btn secondary">Ⅱ Pausa</button><button id="bfStopTimer" class="btn primary">■ Termina e registra</button>' : `<button id="bfStartTimer" class="btn primary">${paused ? "▶ Riprendi" : "▶ Avvia"}</button>${paused ? '<button id="bfStopTimer" class="btn secondary">■ Termina e registra</button>' : ""}`}</div><div class="bf-manual"><label>Ore<input type="number" id="bfManualHours" min="0" max="100000" value="0"></label><label>Minuti<input type="number" id="bfManualMinutes" min="0" max="59" value="0"></label><button class="btn secondary" id="bfAddManual">+ Aggiungi tempo</button></div><div class="bf-totals"><span>Tempo registrato</span><strong>${bfClockFormat(bfSessionSeconds(j))}</strong></div><div class="bf-session-list">${
    sessions.length
      ? sessions
          .slice()
          .reverse()
          .map(
            (t) =>
              `<div class="bf-session"><span><b>${esc(t.phase || "Lavorazione")}</b><small>${formatDateTime(t.endedAt || t.createdAt)} ${t.manual ? "· manuale" : ""}</small></span><strong>${bfClockFormat(Number.isFinite(Number(t.seconds)) ? Number(t.seconds) : Number(t.minutes || 0) * 60)}</strong><button class="bf-delete-session" data-bf-remove-session="${esc(t.id)}" title="Elimina sessione">×</button></div>`,
          )
          .join("")
      : '<p class="bf-help">Nessuna sessione registrata.</p>'
  }</div></section>`;
}

let db = loadLocal();
let selectedJobId = null;
let driveRefs = null;
let pendingUploadCategory = null;
let deferredInstallPrompt = null;
let syncPromise = null;
let syncRequested = false;
let sessionGoogleEmail = "";
let currentView = "dashboard";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function now() {
  return new Date().toISOString();
}
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function defaultDb() {
  return {
    settings: {
      companyName: "Badfish Body Jewelry",
      schemaVersion: 6,
      googleAccountEmail: "",
      rememberGoogleAccount: true,
    },
    jobs: [],
    deletedJobs: [],
    tasks: [],
    notes: [],
    clients: [],
    quotes: [],
    meta: { updatedAt: now() },
  };
}
function normalizeDb(value) {
  const base = defaultDb();
  return {
    ...base,
    ...(value || {}),
    settings: {
      ...base.settings,
      ...(value?.settings || {}),
      schemaVersion: 6,
    },
    jobs: Array.isArray(value?.jobs)
      ? value.jobs.map((j) => ({
          ...j,
          files: Array.isArray(j.files) ? j.files : [],
        }))
      : [],
    deletedJobs: Array.isArray(value?.deletedJobs) ? value.deletedJobs : [],
    tasks: Array.isArray(value?.tasks) ? value.tasks : [],
    notes: Array.isArray(value?.notes) ? value.notes : [],
    clients: Array.isArray(value?.clients) ? value.clients : [],
    quotes: Array.isArray(value?.quotes) ? value.quotes : [],
    meta: { ...base.meta, ...(value?.meta || {}) },
  };
}
function loadLocal() {
  try {
    return normalizeDb(
      JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || "null"),
    );
  } catch {
    return defaultDb();
  }
}
function persistLocal({ renderNow = true } = {}) {
  db.meta.updatedAt = now();
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  if (renderNow) render();
}
function dateMs(v) {
  const n = Date.parse(v || "");
  return Number.isFinite(n) ? n : 0;
}
function mergeDb(a, b) {
  a = normalizeDb(a);
  b = normalizeDb(b);
  const tomb = new Map();
  [...a.deletedJobs, ...b.deletedJobs].forEach((x) => {
    const old = tomb.get(x.id);
    if (!old || dateMs(x.deletedAt) > dateMs(old.deletedAt)) tomb.set(x.id, x);
  });
  const jobs = new Map();
  [...a.jobs, ...b.jobs].forEach((j) => {
    const old = jobs.get(j.id);
    if (!old || dateMs(j.updatedAt) > dateMs(old.updatedAt)) jobs.set(j.id, j);
  });
  for (const [id, del] of tomb) {
    const job = jobs.get(id);
    if (!job || dateMs(del.deletedAt) >= dateMs(job.updatedAt)) jobs.delete(id);
  }
  const mergedItems = (aa, bb) => {
    const out = new Map();
    [...(aa || []), ...(bb || [])].forEach((x) => {
      const prev = out.get(x.id);
      if (
        !prev ||
        dateMs(x.updatedAt || x.createdAt) >=
          dateMs(prev.updatedAt || prev.createdAt)
      )
        out.set(x.id, x);
    });
    return [...out.values()];
  };
  const tasks = mergedItems(a.tasks, b.tasks),
    notes = mergedItems(a.notes, b.notes),
    clients = mergedItems(a.clients, b.clients),
    quotes = mergedItems(a.quotes, b.quotes);
  const settings =
    dateMs(a.meta.updatedAt) >= dateMs(b.meta.updatedAt)
      ? a.settings
      : b.settings;
  return normalizeDb({
    settings,
    tasks,
    notes,
    clients,
    quotes,
    jobs: [...jobs.values()].sort(
      (x, y) =>
        dateMs(y.updatedAt || y.createdAt) - dateMs(x.updatedAt || x.createdAt),
    ),
    deletedJobs: [...tomb.values()],
    meta: { updatedAt: now() },
  });
}
function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
function formatSize(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let n = Number(bytes),
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast${error ? " error" : ""}`;
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.add("hidden"), 3600);
}
function statusClass(status) {
  if (["Completata", "Consegnata"].includes(status)) return "done";
  if (
    ["In lavorazione", "Controllo qualità", "Da programmare"].includes(status)
  )
    return "working";
  return "";
}
function isOverdue(job) {
  if (!job.dueDate || ["Completata", "Consegnata"].includes(job.status))
    return false;
  const end = new Date(`${job.dueDate}T23:59:59`);
  return end.getTime() < Date.now();
}
function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}
function normalizeEmail(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function getPreferredGoogleEmail() {
  return normalizeEmail(
    sessionGoogleEmail ||
      localStorage.getItem(GOOGLE_EMAIL_KEY) ||
      db.settings.googleAccountEmail ||
      "",
  );
}
function isGoogleEmailRemembered() {
  return Boolean(localStorage.getItem(GOOGLE_EMAIL_KEY));
}
function setPreferredGoogleEmail(email, remember = true) {
  const clean = normalizeEmail(email);
  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    throw new Error("Inserisci un indirizzo email Google valido.");
  sessionGoogleEmail = clean;
  if (remember) {
    localStorage.setItem(GOOGLE_EMAIL_KEY, clean);
    db.settings.googleAccountEmail = clean;
    db.settings.rememberGoogleAccount = true;
  } else {
    localStorage.removeItem(GOOGLE_EMAIL_KEY);
    db.settings.googleAccountEmail = "";
    db.settings.rememberGoogleAccount = false;
  }
  persistLocal();
  return clean;
}
function clearPreferredGoogleEmail() {
  sessionGoogleEmail = "";
  localStorage.removeItem(GOOGLE_EMAIL_KEY);
  db.settings.googleAccountEmail = "";
  db.settings.rememberGoogleAccount = false;
  BadfishDrive.clearToken();
  driveRefs = null;
  persistLocal();
}
function showGoogleEmailSetup() {
  const email = getPreferredGoogleEmail();
  $("#googleAccountEmail").value = email;
  $("#rememberGoogleEmail").checked = true;
  $("#accountSetupText").textContent = email
    ? "Modifica l’account Google che Badfish deve usare come archivio Drive."
    : "Inserisci l’account Google dedicato alla web app. Lo salvi una volta e Badfish lo userà come account preferito per Drive.";
  $("#accountSetupBackdrop").classList.remove("hidden");
  setTimeout(() => {
    if (!$("#accountSetupBackdrop").classList.contains("hidden")) $("#googleAccountEmail")?.focus();
  }, 80);
}
function hideGoogleEmailSetup() {
  $("#accountSetupBackdrop").classList.add("hidden");
}
function accountInitial(email) {
  const raw = (email || db.settings.companyName || "B").trim();
  return (raw[0] || "B").toUpperCase();
}

function setSyncState(type, title, subtitle = "") {
  $("#syncTitle").textContent = title;
  $("#syncSubtitle").textContent = subtitle;
  $("#syncDot").className = `status-dot ${type || ""}`;
  $$(".drive-chip .status-dot").forEach(
    (x) => (x.className = `status-dot ${type || ""}`),
  );
  $("#driveOverviewDot").className = `status-dot ${type || ""}`;
  $("#driveStateText").textContent = title;
  $("#driveOverviewTitle").textContent = title;
  const connected = BadfishDrive.isConnected();
  $("#connectDriveBtn").classList.toggle("connected", connected);
  $(".drive-chip-text").textContent = connected ? "Drive OK" : "Drive";
  $("#settingsConnectBtn").innerHTML = connected
    ? `${icon("refresh")} Ricollega Drive`
    : `${icon("cloud")} Collega Drive`;
  $("#dashboardDriveAction").innerHTML = connected
    ? `${icon("refresh")} Sincronizza ora`
    : `${icon("cloud")} Collega Drive`;
  const user = BadfishDrive.getCurrentUser?.();
  const preferred = getPreferredGoogleEmail();
  const email = user?.emailAddress || preferred || "";
  $("#driveAccountText").textContent = email || "—";
  $("#driveOverviewEmail").textContent = email || "Configura l’account Badfish";
  $("#savedGoogleEmailText").textContent = preferred || "—";
  $("#preferredGoogleEmail").value = preferred;
  $("#accountInitial").textContent = accountInitial(email);
}

function switchView(view) {
  currentView = view;
  $$(".view").forEach((v) => v.classList.remove("active"));
  $$("[data-view]").forEach((v) => v.classList.remove("active"));
  $(`#${view}View`)?.classList.add("active");
  $$(`[data-view="${view}"]`).forEach((v) => v.classList.add("active"));
  const titles = {
    dashboard: ["PANORAMICA", "Home"],
    jobs: ["PRODUZIONE", "Commesse"],
    files: ["ARCHIVIO", "File"],
    planner: ["ORGANIZZAZIONE", "Calendario e attività"],
    notes: ["CONOSCENZE", "Appunti"],
    clients: ["RELAZIONI", "Clienti"],
    quotes: ["DOCUMENTI", "Preventivi"],
    stats: ["ANALISI", "Centro di controllo"],
    settings: ["PREFERENZE", "Impostazioni"],
  };
  $("#pageKicker").textContent = titles[view]?.[0] || "";
  $("#pageTitle").textContent = titles[view]?.[1] || "Badfish";
  if (view === "files") renderFiles();
  if (view === "jobs") renderJobs();
  if (view === "planner") bfRenderPlanner();
  if (view === "notes") bfRenderNotes();
  if (view === "clients") bfRenderClients();
  if (view === "quotes") bfRenderQuotes();
  if (view === "stats" && typeof bf80RenderStats === "function")
    bf80RenderStats();
  window.scrollTo({ top: 0, behavior: window.matchMedia("(max-width: 860px)").matches ? "instant" : "smooth" });
}

function render() {
  $("#companyName").value = db.settings.companyName || "Badfish Body Jewelry";
  ["companyAddress", "companyVat", "companyContacts"].forEach((key) => {
    $("#" + key).value = db.settings[key] || "";
  });
  $("#googleClientId").value = BadfishDrive.getClientId();
  $("#driveFolderText").textContent =
    window.BADFISH_CONFIG?.driveRootFolder || "BADFISH_MANAGER";
  const preferred = getPreferredGoogleEmail();
  $("#preferredGoogleEmail").value = preferred;
  $("#savedGoogleEmailText").textContent = preferred || "—";
  $("#accountInitial").textContent = accountInitial(
    BadfishDrive.getCurrentUser?.()?.emailAddress || preferred,
  );
  const last = localStorage.getItem(LAST_SYNC_KEY);
  $("#lastSyncText").textContent = last ? formatDateTime(last) : "—";
  $("#statTotal").textContent = db.jobs.length;
  $("#statWorking").textContent = db.jobs.filter((j) =>
    ["In lavorazione", "Controllo qualità"].includes(j.status),
  ).length;
  $("#statProgramming").textContent = db.jobs.filter(
    (j) => j.status === "Da programmare",
  ).length;
  $("#statDone").textContent = db.jobs.filter((j) =>
    ["Completata", "Consegnata"].includes(j.status),
  ).length;
  $("#navJobsCount").textContent = db.jobs.length;
  renderRecent();
  bf99RenderDeliveries();
  renderJobs();
  renderFiles();
  bfRenderSummary();
  bfRenderPlanner();
  bfRenderNotes();
  bfRenderClients();
  bfRenderQuotes();
}

function bf99RenderDeliveries() {
  const root = $("#bf99Deliveries");
  if (!root) return;
  const groups = BadfishProduction.deliveries(db.jobs);
  const row = (job, overdue) => `<button type="button" class="bf99-delivery ${overdue ? "is-overdue" : job.dueDate === groups.start ? "is-today" : ""}" data-open="${esc(job.id)}"><span><b>${formatDate(job.dueDate)}</b><small>${overdue ? "In ritardo" : job.dueDate === groups.start ? "Oggi" : "Consegna prevista"}</small></span><span><b>${esc(job.code)} · ${esc(job.article)}</b><small>${esc(job.client)} · ${esc(job.status)}</small></span><span>Apri ${icon("chevron")}</span></button>`;
  root.innerHTML = `<span class="eyebrow">CONSEGNE</span><h3>Prossimi 7 giorni</h3><p class="bf-help">Da ${formatDate(groups.start)} a ${formatDate(groups.end)} · incluse le commesse completate ancora da consegnare.</p>${groups.overdue.length ? `<h4>Consegne scadute (${groups.overdue.length})</h4><div class="bf99-delivery-list">${groups.overdue.map((j) => row(j, true)).join("")}</div>` : ""}<h4>In programma (${groups.upcoming.length})</h4><div class="bf99-delivery-list">${groups.upcoming.map((j) => row(j, false)).join("") || '<p class="bf-help">Nessuna consegna prevista nei prossimi 7 giorni.</p>'}</div>`;
}
window.addEventListener("focus", () => bf99RenderDeliveries());
document.addEventListener("visibilitychange", () => { if (!document.hidden) bf99RenderDeliveries(); });

function fileCategories(job) {
  const set = new Set((job.files || []).map((f) => f.category));
  return Object.keys(CATEGORY_LABELS)
    .map(
      (cat) =>
        `<span class="file-pill ${set.has(cat) ? "has" : ""}">${CATEGORY_SHORT[cat]}</span>`,
    )
    .join("");
}
function renderRecent() {
  const jobs = [...db.jobs]
    .sort(
      (a, b) =>
        dateMs(b.updatedAt || b.createdAt) - dateMs(a.updatedAt || a.createdAt),
    )
    .slice(0, 6);
  $("#recentJobs").innerHTML = jobs.length
    ? jobs
        .map(
          (j) =>
            `<button class="recent-row" data-open="${esc(j.id)}"><span class="recent-code"><strong>${esc(j.code)}</strong><span>${esc(j.client)}</span></span><span class="recent-main"><b>${esc(j.article)}</b><span>Agg. ${formatDate(j.updatedAt || j.createdAt)}</span></span><span class="status ${statusClass(j.status)} ${isOverdue(j) ? "overdue" : ""}">${isOverdue(j) ? "In ritardo" : esc(j.status)}</span><span class="recent-open">${icon("chevron")}</span></button>`,
        )
        .join("")
    : `<div class="empty">Nessuna commessa. Crea il primo lavoro per iniziare.</div>`;
}
function renderJobs() {
  const q = ($("#jobSearch")?.value || "").toLowerCase().trim(),
    sf = $("#statusFilter")?.value || "";
  const jobs = db.jobs.filter((j) => {
    const hay = [j.code, j.client, j.article, j.material, j.notes]
      .join(" ")
      .toLowerCase();
    return (!q || hay.includes(q)) && (!sf || j.status === sf);
  });
  $("#jobsList").innerHTML = jobs.length
    ? jobs
        .map(
          (j) =>
            `<article class="job-card" data-open="${esc(j.id)}"><div class="job-card-head"><div><div class="job-code">${esc(j.code)}</div><div class="job-client">${esc(j.client)}</div></div><span class="status ${statusClass(j.status)} ${isOverdue(j) ? "overdue" : ""}">${isOverdue(j) ? "In ritardo" : esc(j.status)}</span></div><div class="job-article">${esc(j.article)}</div><div class="job-meta"><div><span>Materiale</span><strong>${esc(j.material || "—")}</strong></div><div><span>Q.tà</span><strong>${esc(j.quantity || 0)}</strong></div><div><span>Consegna</span><strong>${formatDate(j.dueDate)}</strong></div></div><div class="job-file-strip">${fileCategories(j)}</div><div class="job-actions"><span class="file-count">${(j.files || []).length} ${(j.files || []).length === 1 ? "file" : "file"}</span><span class="open-link">Apri ${icon("chevron")}</span></div></article>`,
        )
        .join("")
    : `<div class="empty full-span">Nessuna commessa trovata.</div>`;
}
function allFiles() {
  return db.jobs
    .flatMap((job) =>
      (job.files || []).map((file) => ({
        ...file,
        jobId: job.id,
        jobCode: job.code,
        jobArticle: job.article,
        jobClient: job.client,
      })),
    )
    .sort((a, b) => dateMs(b.addedAt) - dateMs(a.addedAt));
}
function renderFiles() {
  const files = allFiles(),
    counts = { fusion: 0, step: 0, nc: 0, drawings: 0, photos: 0 };
  files.forEach((f) => {
    if (counts[f.category] != null) counts[f.category]++;
  });
  $("#fileStats").innerHTML = Object.entries(counts)
    .map(
      ([k, n]) =>
        `<div class="file-stat"><span>${CATEGORY_LABELS[k]}</span><strong>${n}</strong></div>`,
    )
    .join("");
  const clientPicker = $("#bfArchiveClient");
  if (clientPicker) {
    const old = clientPicker.value;
    const clients = [
      ...new Set(
        files.map((f) => String(f.jobClient || "").trim()).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "it"));
    clientPicker.innerHTML =
      '<option value="">Tutti i clienti</option>' +
      clients
        .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
        .join("");
    clientPicker.value = clients.includes(old) ? old : "";
  }
  const q = ($("#fileSearch")?.value || "").toLowerCase().trim(),
    cat = $("#fileCategoryFilter")?.value || "",
    client = clientPicker?.value || "";
  const filtered = files.filter(
    (f) =>
      (!cat || f.category === cat) &&
      (!client || f.jobClient === client) &&
      (!q ||
        [f.name, f.jobCode, f.jobArticle, f.jobClient]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
  const order = $("#bfArchiveOrder")?.value || "new";
  filtered.sort((a, b) =>
    order === "name"
      ? (a.name || "").localeCompare(b.name || "", "it")
      : order === "job"
        ? (a.jobCode || "").localeCompare(b.jobCode || "", "it")
        : dateMs(b.addedAt) - dateMs(a.addedAt),
  );
  const counter = $("#bfArchiveCount");
  if (counter)
    counter.textContent = `${filtered.length} file su ${files.length}`;
  const row = (f) =>
    `<div class="archive-row"><div class="archive-icon">${esc(CATEGORY_SHORT[f.category] || "FILE")}</div><div class="archive-name"><strong title="${esc(f.name)}">${esc(f.name)}</strong><span>${categoryLabel(f.category)}${f.repeatCopyFromDriveId && !f.driveFileId ? " · Copia in attesa" : ""} · ${formatDate(f.addedAt)} · ${esc(f.jobClient || "Cliente non indicato")}</span></div><button class="archive-job" data-open="${esc(f.jobId)}" title="Apri commessa"><strong>${esc(f.jobCode)}</strong><span>${esc(f.jobArticle)}</span></button><div class="archive-size">${formatSize(f.size)}</div><button class="archive-open" data-drive-open="${esc(f.driveFileId || "")}" aria-label="Apri su Drive" title="Apri su Drive" ${f.driveFileId ? "" : "disabled"}>${icon("external")}</button></div>`;
  if (!filtered.length) {
    $("#allFilesList").innerHTML =
      '<div class="empty">Nessun file trovato. Prova a cambiare filtri o ricerca, oppure apri una commessa per aggiungere file.</div>';
    return;
  }
  const group = $("#bfArchiveGroup")?.value || "job";
  if (group === "none") {
    $("#allFilesList").innerHTML = filtered.map(row).join("");
    return;
  }
  const groups = new Map();
  for (const f of filtered) {
    const key =
      group === "category" ? f.category : f.jobId || f.jobCode || "other";
    if (!groups.has(key))
      groups.set(key, {
        title:
          group === "category"
            ? categoryLabel(f.category)
            : `${f.jobCode || "Senza codice"} · ${f.jobArticle || "Commessa"}`,
        subtitle: group === "category" ? "" : f.jobClient || "",
        items: [],
      });
    groups.get(key).items.push(f);
  }
  $("#allFilesList").innerHTML = [...groups.values()]
    .map(
      (g) =>
        `<section class="bf-file-group"><div class="bf-file-group-title"><div><strong>${esc(g.title)}</strong>${g.subtitle ? `<span>${esc(g.subtitle)}</span>` : ""}</div><span>${g.items.length} file</span></div>${g.items.map(row).join("")}</section>`,
    )
    .join("");
}

function openNewJob() {
  window.BadfishRepeats?.resetForm();
  const form = $("#jobForm");
  form.reset();
  form.elements.quantity.value = 1;
  $("#modalBackdrop").classList.remove("hidden");
  setTimeout(() => {
    if (!$("#modalBackdrop").classList.contains("hidden")) form.elements.code?.focus();
  }, 100);
}
function closeNewJob() {
  $("#modalBackdrop").classList.add("hidden");
  window.BadfishRepeats?.resetForm();
}
function fileButtons(f) {
  if (f.repeatCopyFromDriveId && !f.driveFileId)
    return `<span class="bf95-pending-file">Copia in attesa</span><button data-file-remove="${esc(f.id)}" aria-label="Rimuovi file da copiare">×</button>`;
  return `<button data-drive-open="${esc(f.driveFileId || "")}">Apri Drive</button><button data-file-remove="${esc(f.id)}" aria-label="Elimina file">×</button>`;
}
// Commessa: grezzi configurati in Fusion e registro ore.
function bfWorkPanel(j) {
  return `<div class="bf-work-layout">${bfStockPanel(j)}${bfTimerPanel(j)}</div>`;
}

function openDetail(id) {
  const drawer = $("#detailModal");
  const scrollTop = selectedJobId === id ? drawer.scrollTop : 0;
  selectedJobId = id;
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  const files = j.files || [];
  $("#detailContent").innerHTML =
    `<div class="detail-shell"><div class="bf94-mobile-detail-bar"><span class="eyebrow" title="${esc(j.code)}">COMMESSA ${esc(j.code)}</span><button type="button" class="icon-btn bf94-mobile-close" data-close-detail aria-label="Chiudi commessa">${icon("x")}</button></div><div class="detail-top"><div class="detail-title"><span class="eyebrow">COMMESSA ${esc(j.code)}</span><h2>${esc(j.article)}</h2><div class="detail-sub">${esc(j.client)} · ${esc(j.material || "Materiale non specificato")}</div></div><button type="button" class="icon-btn detail-close-btn" id="closeDetail" aria-label="Chiudi commessa">${icon("x")}</button></div>${window.BadfishRepeats?.panel(j) || ""}<div class="detail-summary"><div><span>Stato</span><strong>${esc(j.status)}</strong></div><div><span>Quantità</span><strong>${esc(j.quantity || 0)}</strong></div><div><span>Consegna</span><strong>${formatDate(j.dueDate)}</strong></div><div><span>File</span><strong>${files.length}</strong></div></div><nav class="bf77-jump" aria-label="Sezioni commessa"><a href="#bf77-tech">1 · Ore e misure</a><a href="#bf77-files">2 · File del lavoro</a><a href="#bf77-status">3 · Stato e note</a></nav><div id="bf77-tech" class="bf77-section-heading"><span>01</span><div><h3>Produzione e tempi</h3><p>Grezzi Fusion e ore lavorate</p></div></div>${bfWorkPanel(j)}${bfBusinessPanel(j)}<div id="bf77-files" class="bf77-section-heading"><span>02</span><div><h3>Documenti della commessa</h3><p>Caricamento e archivio dei file</p></div></div><div class="detail-grid"><div><section class="detail-section"><h4>Carica file</h4><div class="upload-grid"><button class="upload-btn fusion-upload" data-upload="fusion"><b>+ Progetto Fusion 360</b><span>.f3d, .f3z · versione precedente archiviata</span></button><button class="upload-btn" data-upload="step"><b>+ File STEP</b><span>.stp, .step</span></button><button class="upload-btn" data-upload="nc"><b>+ Programma NC</b><span>.nc, .tap, .cnc</span></button><button class="upload-btn" data-upload="drawings"><b>+ Disegni / PDF</b><span>.pdf, .dwg, .dxf</span></button><button class="upload-btn" data-upload="photos"><b>+ Fotografie</b><span>JPG, PNG, HEIC...</span></button></div><p class="upload-note">I file vengono caricati direttamente nel Google Drive Badfish.</p></section><section class="detail-section"><h4>Archivio della commessa</h4><div class="file-list">${files.length ? files.map((f) => `<div class="file-row"><div class="file-info"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatSize(f.size)} · ${formatDate(f.addedAt)}</span></div><div class="file-actions">${fileButtons(f)}</div></div>`).join("") : `<div class="empty">Non sono ancora stati caricati file.</div>`}</div></section></div><div><section class="detail-section" id="bf77-status"><h4>Informazioni commessa</h4><label class="field-label">Codice commessa *<input id="detailCode" value="${esc(j.code || "")}" required></label><label class="field-label">Cliente *<input id="detailClient" value="${esc(j.client || "")}" required></label><label class="field-label">Articolo *<input id="detailArticle" value="${esc(j.article || "")}" required></label><label class="field-label">Materiale<input id="detailMaterial" value="${esc(j.material || "")}"></label><label class="field-label">Quantità<input id="detailQuantity" type="number" min="0" step="1" value="${esc(j.quantity ?? 0)}"></label><label class="field-label">Stato<select id="detailStatus">${STATUSES.map((s) => `<option ${s === j.status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="field-label">Data consegna<input id="detailDueDate" type="date" value="${esc(j.dueDate || "")}"></label><label class="field-label">Note<textarea id="detailNotes" rows="7">${esc(j.notes || "")}</textarea></label><button id="saveDetailBtn" class="btn primary wide">Salva modifiche</button></section><section class="detail-section"><h4>Google Drive</h4><div class="path-box">${j.driveFolderId ? "La cartella cloud della commessa è collegata." : "La cartella verrà creata alla prima sincronizzazione o al primo upload."}</div>${j.driveFolderId ? `<button id="openDriveFolderBtn" class="btn subtle wide">${icon("external")} Apri cartella Drive</button>` : ""}</section><button id="deleteJobBtn" class="btn danger wide delete-gap">${icon("trash")} Elimina dal gestionale</button></div></div></div>`;
  const closeBtn = $("#closeDetail");
  if (closeBtn) {
    closeBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeDetail();
      },
      { once: true },
    );
  }
  $("#detailBackdrop").classList.remove("hidden");
  window.bf87Enhance?.();
  drawer.scrollTop = scrollTop;
}
function closeDetail() {
  $("#detailBackdrop").classList.add("hidden");
  selectedJobId = null;
}

async function ensureConnected() {
  if (BadfishDrive.isConnected()) return true;
  const email = getPreferredGoogleEmail();
  if (!email) {
    showGoogleEmailSetup();
    throw new Error("Configura prima l’email Google Badfish.");
  }
  const ok = await connectDrive({ email, silent: false });
  if (!ok) throw new Error("Google Drive non è collegato.");
  return true;
}
async function connectDrive({ email = "", silent = false } = {}) {
  const preferred = normalizeEmail(email || getPreferredGoogleEmail());
  if (!preferred) {
    showGoogleEmailSetup();
    if (!silent)
      toast("Inserisci prima l’email Google dedicata a Badfish.", true);
    return false;
  }
  if (!navigator.onLine) {
    if (!silent) toast("Sei offline. I dati locali restano disponibili.", true);
    return false;
  }
  try {
    setSyncState("syncing", "Connessione a Drive…", preferred);
    const connection = await BadfishDrive.connect({
      email: preferred,
      prompt: "",
    });
    const actual = normalizeEmail(connection?.user?.emailAddress || "");
    if (actual && actual !== preferred)
      throw new Error(
        `Account Google errato: ${actual}. Badfish è configurato per ${preferred}.`,
      );
    if (isGoogleEmailRemembered()) {
      db.settings.googleAccountEmail = preferred;
      db.settings.rememberGoogleAccount = true;
      persistLocal({ renderNow: false });
    }
    await syncDrive(!silent);
    return true;
  } catch (err) {
    setSyncState("", "Drive non collegato", `Account salvato: ${preferred}`);
    if (!silent) toast(err.message, true);
    return false;
  }
}
// Ogni richiesta attende anche le modifiche arrivate durante un upload.
// Una sola scrittura Drive alla volta; gli errori conservano i dati locali.
async function syncDrive(showToast = false) {
  if (syncPromise) {
    syncRequested = true;
    return syncPromise;
  }
  if (!BadfishDrive.isConnected()) {
    if (showToast) toast("Collega prima Google Drive.", true);
    return;
  }
  syncRequested = true;
  syncPromise = (async () => {
    try {
      do {
        syncRequested = false;
        await syncDrivePass();
        if (syncRequested && (!BadfishDrive.isConnected() || !navigator.onLine)) {
          throw new Error("Ultime modifiche salvate sul dispositivo. Ricollega Drive e riprova la sincronizzazione.");
        }
      } while (syncRequested);
      if (showToast && BadfishDrive.isConnected() && navigator.onLine) toast("Google Drive sincronizzato.");
    } catch (err) {
      setSyncState("error", "Sincronizzazione da completare", "Dati locali conservati");
      if (showToast) toast(err.message, true);
      throw err;
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}
async function syncDrivePass() {
  if (!BadfishDrive.isConnected()) {
    return;
  }
  try {
    setSyncState("syncing", "Sincronizzazione…", "Google Drive");
    driveRefs = await BadfishDrive.ensureRootStructure();
    const rawRemote = await BadfishDrive.downloadJson(driveRefs.dbFile.id);
    const remote = normalizeDb(rawRemote);
    const remoteFingerprint = JSON.stringify(rawRemote);
    db = mergeDb(db, remote);
    const preferred = getPreferredGoogleEmail();
    if (preferred && isGoogleEmailRemembered()) {
      db.settings.googleAccountEmail = preferred;
      db.settings.rememberGoogleAccount = true;
    }
    for (const job of db.jobs) {
      const pendingCopies = window.BadfishRepeats?.pending(job).length;
      if (!job.driveFolderId || pendingCopies) {
        const folders = await BadfishDrive.ensureJobStructure(
          job,
          driveRefs.jobs.id,
        );
        job.driveFolderId = folders.jobFolder.id;
        job.driveFolderUrl = BadfishDrive.folderUrl(folders.jobFolder.id);
        job.updatedAt = now();
        if (pendingCopies) await window.BadfishRepeats.copyPending(job, folders);
      }
    }
    db.meta.updatedAt = now();
    // Ferma l'upload se il database remoto e' cambiato dopo la lettura iniziale.
    // Controllo best effort, NON atomico: non elimina ogni race condition multi-dispositivo.
    const currentRemote = await BadfishDrive.downloadJson(driveRefs.dbFile.id);
    if (JSON.stringify(currentRemote) !== remoteFingerprint) {
      throw new Error(
        "Drive modificato da un altro dispositivo durante la sincronizzazione. Riprova la sincronizzazione dopo aver verificato i dati.",
      );
    }
    setSyncState(
      "syncing",
      "Backup database su Drive…",
      "Protezione prima della scrittura",
    );
    await BadfishDrive.createDatabaseSnapshot(driveRefs.root.id, currentRemote);
    // Il salvataggio locale deve riuscire prima della sovrascrittura remota.
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
    await BadfishDrive.updateMedia(
      driveRefs.dbFile.id,
      new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
      "application/json",
    );
    const stamp = now();
    render();
    if (syncRequested) {
      setSyncState("syncing", "Salvataggio ultime modifiche…", "Sincronizzazione in corso");
      return;
    }
    localStorage.setItem(LAST_SYNC_KEY, stamp);
    setSyncState(
      "ok",
      "Drive sincronizzato",
      new Intl.DateTimeFormat("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(stamp)),
    );
  } catch (err) {
    setSyncState("error", "Errore sincronizzazione", "Dati locali conservati");
    throw err;
  }
}
async function saveAndSync(message = "Salvato.") {
  persistLocal();
  if (syncPromise || (BadfishDrive.isConnected() && navigator.onLine)) {
    try {
      await syncDrive(false);
      toast(message);
    } catch {
      toast(`${message} Sincronizzazione Drive da riprovare.`, true);
    }
  } else toast(`${message} Salvato sul dispositivo.`);
}
async function uploadFiles(files, category) {
  if (!files.length) return;
  if (!navigator.onLine)
    throw new Error("Per caricare file su Drive devi essere online.");
  await ensureConnected();
  if (!driveRefs) driveRefs = await BadfishDrive.ensureRootStructure();
  const job = db.jobs.find((j) => j.id === selectedJobId);
  if (!job) throw new Error("Commessa non trovata.");
  const folders = await BadfishDrive.ensureJobStructure(job, driveRefs.jobs.id);
  job.driveFolderId = folders.jobFolder.id;
  job.driveFolderUrl = BadfishDrive.folderUrl(folders.jobFolder.id);
  let count = 0;
  for (const file of files) {
    setSyncState(
      "syncing",
      `Caricamento ${count + 1}/${files.length}…`,
      file.name,
    );
    const uploaded = await BadfishDrive.uploadJobFile(file, category, folders);
    job.files.push({
      id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      driveFileId: uploaded.id,
      name: uploaded.name || file.name,
      category,
      size: Number(uploaded.size || file.size || 0),
      mimeType: uploaded.mimeType || file.type || "",
      addedAt: now(),
    });
    count++;
  }
  job.updatedAt = now();
  await saveAndSync(`${count} file caricati.`);
  if (selectedJobId === job.id) openDetail(job.id);
}

// v7.1 - planning, knowledge base, and complete work hour totals.
const bfHoursTotal = () =>
  db.jobs.reduce(
    (sum, j) =>
      sum + bfSessionSeconds(j) + bfRunningSeconds(j),
    0,
  );
const bfHumanHours = (secs) =>
  `${Math.floor(Math.max(0, secs) / 3600)}h ${String(Math.floor((Math.max(0, secs) % 3600) / 60)).padStart(2, "0")}m`;

let bf77HoursPeriod = "month",
  bf77HoursClient = "";
function bf77HourReport() {
  const target = document.getElementById("bf77HourReport");
  if (!target) return;
  const nowDate = new Date();
  const begin = new Date(nowDate);
  if (bf77HoursPeriod === "today") begin.setHours(0, 0, 0, 0);
  if (bf77HoursPeriod === "week") {
    begin.setHours(0, 0, 0, 0);
    begin.setDate(begin.getDate() - ((begin.getDay() + 6) % 7));
  }
  if (bf77HoursPeriod === "month") {
    begin.setDate(1);
    begin.setHours(0, 0, 0, 0);
  }
  const names = [
    ...new Set(db.jobs.map((j) => j.client || "Cliente non indicato")),
  ].sort((a, b) => a.localeCompare(b, "it"));
  const getSeconds = (j) => {
    const secs = (j.workSessions || []).reduce((sum, t) => {
      const when = new Date(t.endedAt || t.createdAt || t.startedAt || 0);
      if (
        bf77HoursPeriod !== "all" &&
        (!Number.isFinite(when.getTime()) || when < begin)
      )
        return sum;
      return (
        sum +
        (Number.isFinite(Number(t.seconds))
          ? Number(t.seconds)
          : Number(t.minutes || 0) * 60)
      );
    }, 0);
    const live = j.timerStartedAt
      ? bf77HoursPeriod === "all"
        ? bfRunningSeconds(j)
        : Math.max(
            0,
            (Date.now() -
              Math.max(new Date(j.timerStartedAt).getTime(), begin.getTime())) /
              1000,
          )
      : 0;
    // A paused timer has unsaved accumulated time; count only for full-history view.
    return (
      secs +
      live +
      (bf77HoursPeriod === "all" && !j.timerStartedAt
        ? Number(j.timerAccumulatedSeconds || 0)
        : 0)
    );
  };
  const selected = db.jobs.filter(
    (j) =>
      !bf77HoursClient ||
      (j.client || "Cliente non indicato") === bf77HoursClient,
  );
  const rows = selected
    .map((j) => ({ job: j, sec: getSeconds(j) }))
    .filter((r) => r.sec > 0)
    .sort((a, b) => b.sec - a.sec);
  const total = rows.reduce((n, r) => n + r.sec, 0);
  target.innerHTML = `<div class="bf77-report-head"><div><span class="eyebrow">ORE DI PRODUZIONE</span><h3>Riepilogo delle ore</h3><p>Ore registrate per periodo, cliente e commessa.</p></div><strong>${bfHumanHours(total)}</strong></div><div class="bf77-report-filters"><label>Periodo<select id="bf77Period"><option value="today" ${bf77HoursPeriod === "today" ? "selected" : ""}>Oggi</option><option value="week" ${bf77HoursPeriod === "week" ? "selected" : ""}>Questa settimana</option><option value="month" ${bf77HoursPeriod === "month" ? "selected" : ""}>Questo mese</option><option value="all" ${bf77HoursPeriod === "all" ? "selected" : ""}>Tutto lo storico</option></select></label><label>Cliente<select id="bf77Client"><option value="">Tutti i clienti</option>${names.map((n) => `<option value="${esc(n)}" ${bf77HoursClient === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label></div><div class="bf77-report-list">${rows.length ? rows.map((r) => `<button type="button" class="bf77-report-row" data-open="${esc(r.job.id)}"><span><b>${esc(r.job.code || "—")} · ${esc(r.job.article || "Commessa")}</b><small>${esc(r.job.client || "Cliente non indicato")}</small></span><strong>${bfHumanHours(r.sec)}</strong></button>`).join("") : '<p class="bf-help">Nessuna ora registrata in questo periodo.</p>'}</div><p class="bf77-disclaimer">Le sessioni che attraversano più giorni sono attribuite alla data di fine. Le ore del cronometro attivo sono indicative e aggiornate alla riapertura della pagina.</p>`;
}
document.addEventListener("change", (e) => {
  if (e.target.id === "bf77Period") {
    bf77HoursPeriod = e.target.value;
    bf77HourReport();
  }
  if (e.target.id === "bf77Client") {
    bf77HoursClient = e.target.value;
    bf77HourReport();
  }
});

function bfRenderSummary() {
  const t = $("#bfTotalHours");
  if (t) t.textContent = bfHumanHours(bfHoursTotal());
  bf77HourReport();
  const taskCount = $("#bfOpenTasks");
  if (taskCount)
    taskCount.textContent = (db.tasks || []).filter(
      (x) => !x.done && !x.deleted,
    ).length;
  const urgent = $("#bfTodayTasks");
  if (urgent) {
    const today = new Date().toLocaleDateString("sv-SE");
    const entries = (db.tasks || [])
      .filter((t) => !t.done && !t.deleted && (t.date || "") <= today)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    urgent.innerHTML = entries.length
      ? entries
          .slice(0, 4)
          .map(
            (t) =>
              `<button class="bf-home-task" data-view="planner"><span>${esc(t.title)}</span><small>${esc(t.date || "Senza data")}</small></button>`,
          )
          .join("")
      : '<p class="bf-help">Nessuna attività in scadenza. Ottimo!</p>';
  }
}
let bfPlannerMonth = new Date().toISOString().slice(0, 7);
function bfRenderPlanner() {
  const root = $("#bfPlanner");
  if (!root) return;
  const items = (db.tasks || []).filter((t) => !t.deleted);
  const [year, month] = bfPlannerMonth.split("-").map(Number);
  const start = new Date(year, month - 1, 1),
    days = new Date(year, month, 0).getDate();
  const offset = (start.getDay() + 6) % 7;
  const today = new Date().toLocaleDateString("sv-SE");
  const names = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const grid = [
    ...names.map((x) => `<span class="bf-cal-dayname">${x}</span>`),
    ...Array.from({ length: offset }, () => "<span></span>"),
    ...Array.from({ length: days }, (_, i) => {
      const d = `${bfPlannerMonth}-${String(i + 1).padStart(2, "0")}`,
        n = items.filter((t) => t.date === d && !t.done).length;
      return `<button class="bf-day ${d === today ? "today" : ""} ${n ? "has-tasks" : ""}" data-bf-date="${d}" aria-label="${i + 1} ${new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(start)}, ${n} attività da fare"><strong>${i + 1}</strong>${n ? `<small><span class="bf-day-count">${n}</span><span class="bf-day-label"> attività</span></small>` : ""}</button>`;
    }),
  ].join("");
  root.innerHTML = `<div class="bf-planner-layout"><article class="panel bf-planner-calendar"><div class="bf-heading-row"><div><span class="eyebrow">PIANIFICAZIONE</span><h3>${new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(start)}</h3></div><div class="bf-button-group"><button class="btn subtle" data-bf-month="-1" aria-label="Mese precedente">←</button><button class="btn subtle" data-bf-month="1" aria-label="Mese successivo">→</button></div></div><div class="bf-cal-grid">${grid}</div></article><article class="panel bf-form-card"><h3>Nuova attività</h3><p class="bf-help">Una scadenza o un promemoria, anche senza commessa.</p><form id="bfTaskForm" class="bf-inline-form"><label>Attività<input name="title" required maxlength="180" placeholder="Es. Preparare grezzo in quarzo"></label><label>Data<input name="date" type="date" value="${today}"></label><label>Commessa (facoltativa)<select name="jobId"><option value="">Attività generale</option>${db.jobs.map((j) => `<option value="${esc(j.id)}">${esc(j.code)} · ${esc(j.article)}</option>`).join("")}</select></label><label>Dettagli<textarea name="description" rows="2" placeholder="Informazioni utili..."></textarea></label><button class="btn primary" type="submit">+ Aggiungi attività</button></form></article></div><article class="panel bf-list-panel"><div class="bf-heading-row"><h3>Le tue attività</h3><span class="bf-muted">${items.filter((t) => !t.done).length} da fare</span></div><div class="bf-task-items">${
    items
      .sort(
        (a, b) =>
          a.done - b.done || (a.date || "9999").localeCompare(b.date || "9999"),
      )
      .map(
        (t) =>
          `<div class="bf-task-row ${t.done ? "completed" : ""}"><input type="checkbox" aria-label="Completa attività" data-bf-task-toggle="${esc(t.id)}" ${t.done ? "checked" : ""}><div><strong>${esc(t.title)}</strong><small>${esc(t.date || "Senza scadenza")}${t.jobId ? " · " + esc(db.jobs.find((j) => j.id === t.jobId)?.code || "Commessa") : ""}</small>${t.description ? `<p>${esc(t.description)}</p>` : ""}</div><button class="bf-small-delete" data-bf-task-delete="${esc(t.id)}" aria-label="Elimina attività">×</button></div>`,
      )
      .join("") ||
    '<p class="empty">Nessuna attività. Aggiungine una usando il modulo.</p>'
  }</div></article>`;
}
function bfRenderNotes() {
  const root = $("#bfNotes");
  if (!root) return;
  let notes = (db.notes || []).filter((n) => !n.deleted);
  const choice = root.dataset.category || "all";
  const query = (root.dataset.query || "").toLowerCase();
  notes = notes
    .filter(
      (n) =>
        (choice === "all" || n.category === choice) &&
        (!query ||
          [n.title, n.body, n.machine].join(" ").toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        dateMs(b.updatedAt || b.createdAt) - dateMs(a.updatedAt || a.createdAt),
    );
  root.innerHTML = `<div class="bf-notes-intro"><div><span class="eyebrow">MANUALE DI OFFICINA</span><h3>Appunti sempre a portata di mano</h3><p>Impostazioni delle macchine, prove, procedure e note generali. Usa titoli chiari per ritrovare subito ciò che cerchi.</p></div></div><div class="bf-notes-layout"><article class="panel bf-form-card"><h3>Salva un appunto</h3><form id="bfNoteForm" class="bf-inline-form"><label>Categoria<select name="category"><option value="machine">Settaggi macchina</option><option value="general">Appunti generali</option><option value="procedure">Procedure / controlli</option></select></label><label>Titolo<input name="title" required maxlength="180" placeholder="Es. Quarzo — punta diamantata 3 mm"></label><label>Macchina / strumento (facoltativo)<input name="machine" placeholder="Es. Genmitsu 3030"></label><label>Descrizione e parametri<textarea name="body" rows="7" required placeholder="Mandrino, avanzamento, profondità, refrigerazione, osservazioni..."></textarea></label><button class="btn primary" type="submit">Salva appunto</button></form></article><div class="bf-notes-content"><div class="bf-heading-row"><select id="bfNoteFilter" aria-label="Categoria appunti"><option value="all" ${choice === "all" ? "selected" : ""}>Tutte le categorie</option><option value="machine" ${choice === "machine" ? "selected" : ""}>Settaggi macchina</option><option value="general" ${choice === "general" ? "selected" : ""}>Appunti generali</option><option value="procedure" ${choice === "procedure" ? "selected" : ""}>Procedure</option></select><input id="bfNoteSearch" type="search" placeholder="Cerca negli appunti..." value="${esc(root.dataset.query || "")}"></div><div class="bf-note-grid">${notes.map((n) => `<article class="panel bf-note-card"><div class="bf-heading-row"><span class="bf-note-tag">${{ machine: "Settaggi macchina", general: "Appunti generali", procedure: "Procedura" }[n.category] || "Appunto"}</span><button data-bf-note-delete="${esc(n.id)}" class="bf-small-delete" aria-label="Elimina appunto">×</button></div><h3>${esc(n.title)}</h3>${n.machine ? `<p class="bf-note-machine">${esc(n.machine)}</p>` : ""}<p class="bf-note-body">${esc(n.body)}</p><small>Aggiornato ${formatDate(n.updatedAt || n.createdAt)}</small><button class="btn subtle" data-bf-note-edit="${esc(n.id)}">Modifica</button></article>`).join("") || '<p class="empty">Nessun appunto in questa categoria.</p>'}</div></div></div>`;
}
let bfEditingNote = null;
document.addEventListener("submit", async (e) => {
  if (e.target.id === "bfTaskForm") {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    db.tasks.push({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...v,
      done: false,
      createdAt: now(),
      updatedAt: now(),
    });
    await saveAndSync("Attività salvata.");
    switchView("planner");
  }
  if (e.target.id === "bfNoteForm") {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (bfEditingNote) {
      const n = db.notes.find((n) => n.id === bfEditingNote);
      if (n) Object.assign(n, v, { updatedAt: now() });
      bfEditingNote = null;
    } else
      db.notes.push({
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        ...v,
        createdAt: now(),
        updatedAt: now(),
      });
    await saveAndSync("Appunto salvato.");
    switchView("notes");
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.matches("[data-bf-task-toggle]")) {
    const t = db.tasks.find((x) => x.id === e.target.dataset.bfTaskToggle);
    if (t) {
      t.done = e.target.checked;
      t.updatedAt = now();
      await saveAndSync("Attività aggiornata.");
    }
  }
  if (e.target.id === "bfNoteFilter") {
    const el = $("#bfNotes");
    el.dataset.category = e.target.value;
    bfRenderNotes();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "bfNoteSearch") {
    const el = $("#bfNotes"),
      sel = e.target.selectionStart;
    el.dataset.query = e.target.value;
    bfRenderNotes();
    const input = $("#bfNoteSearch");
    input.focus();
    input.setSelectionRange(sel, sel);
  }
});
document.addEventListener("click", async (e) => {
  const m = e.target.closest("[data-bf-month]");
  if (m) {
    const [y, mo] = bfPlannerMonth.split("-").map(Number);
    const d = new Date(y, mo - 1 + Number(m.dataset.bfMonth), 1);
    bfPlannerMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    bfRenderPlanner();
    return;
  }
  const date = e.target.closest("[data-bf-date]");
  if (date) {
    $('#bfTaskForm [name="date"]').value = date.dataset.bfDate;
    $('#bfTaskForm [name="title"]').focus();
    return;
  }
  const td = e.target.closest("[data-bf-task-delete]");
  if (td) {
    const t = db.tasks.find((x) => x.id === td.dataset.bfTaskDelete);
    if (t && confirm("Eliminare questa attività?")) {
      t.deleted = true;
      t.updatedAt = now();
      await saveAndSync("Attività eliminata.");
    }
    return;
  }
  const nd = e.target.closest("[data-bf-note-delete]");
  if (nd) {
    const n = db.notes.find((x) => x.id === nd.dataset.bfNoteDelete);
    if (n && confirm("Eliminare questo appunto?")) {
      n.deleted = true;
      n.updatedAt = now();
      await saveAndSync("Appunto eliminato.");
    }
    return;
  }
  const ne = e.target.closest("[data-bf-note-edit]");
  if (ne) {
    const n = db.notes.find((x) => x.id === ne.dataset.bfNoteEdit);
    if (!n) return;
    bfEditingNote = n.id;
    const form = $("#bfNoteForm");
    ["title", "category", "machine", "body"].forEach(
      (k) => (form.elements[k].value = n[k] || ""),
    );
    form.querySelector("button[type=submit]").textContent = "Salva modifiche";
    form.scrollIntoView({ behavior: "smooth" });
    return;
  }
});

// v7.2 Clienti: schede anagrafiche, collegamento stabile alle commesse, ore per cliente.
const bfClientKey = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("it-IT")
    .replace(/\s+/g, " ");
function bfClientIdForName(name) {
  const key = bfClientKey(name);
  return (
    (db.clients || []).find((c) => !c.deleted && bfClientKey(c.name) === key)
      ?.id || ""
  );
}
function bfClientJobs(client) {
  return db.jobs.filter((j) =>
    j.clientId
      ? j.clientId === client.id
      : bfClientKey(j.client) === bfClientKey(client.name),
  );
}
function bfClientSeconds(job) {
  return (
    bfSessionSeconds(job) +
    (job.timerStartedAt || job.timerAccumulatedSeconds
      ? bfRunningSeconds(job)
      : 0)
  );
}
function bfClientCatalog() {
  const map = new Map();
  for (const c of db.clients || []) {
    if (!c.deleted) map.set(c.id, { ...c });
  }
  for (const job of db.jobs) {
    if (!bfClientKey(job.client)) continue;
    // Never recreate a deleted client from historical orders. Orders and hours remain intact.
    if (
      (db.clients || []).some(
        (c) =>
          c.deleted &&
          (c.id === job.clientId ||
            bfClientKey(c.name) === bfClientKey(job.client)),
      )
    )
      continue;
    if (job.clientId && map.has(job.clientId)) continue;
    if (
      [...map.values()].some(
        (c) => bfClientKey(c.name) === bfClientKey(job.client),
      )
    )
      continue;
    const id = "legacy_" + bfClientKey(job.client);
    if (!map.has(id)) map.set(id, { id, name: job.client, legacy: true });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}
function bfRenderClients() {
  const root = $("#bfClients");
  if (!root) return;
  const selected = root.dataset.selected || "",
    q = (root.dataset.query || "").toLocaleLowerCase("it-IT");
  const clients = bfClientCatalog();
  const filtered = clients.filter((c) =>
    [c.name, c.email, c.phone, c.notes]
      .join(" ")
      .toLocaleLowerCase("it-IT")
      .includes(q),
  );
  const jobsFor = (c) =>
    db.jobs.filter((j) =>
      j.clientId
        ? j.clientId === c.id
        : bfClientKey(j.client) === bfClientKey(c.name),
    );
  const allHours = clients.reduce(
    (n, c) => n + jobsFor(c).reduce((t, j) => t + bfClientSeconds(j), 0),
    0,
  );
  const active = clients.find((c) => c.id === selected);
  root.innerHTML = `<div class="bf-client-top"><div class="bf-client-stat"><small>Clienti</small><strong>${clients.length}</strong></div><div class="bf-client-stat"><small>Ore associate ai clienti</small><strong>${bfHumanHours(allHours)}</strong></div><div class="bf-client-stat"><small>Ordini</small><strong>${db.jobs.filter((j) => j.client).length}</strong></div></div><div class="bf-client-layout"><div class="panel bf-client-left"><div class="bf-client-search"><input id="bfClientSearch" placeholder="Cerca un cliente..." value="${esc(root.dataset.query || "")}"><button class="btn primary" id="bfNewClient">+ Cliente</button></div><div class="bf-client-list">${
    filtered.length
      ? filtered
          .map((c) => {
            const jobs = jobsFor(c);
            return `<button class="bf-client-list-row ${c.id === selected ? "selected" : ""}" data-bf-client="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${jobs.length} ordini · ${bfHumanHours(jobs.reduce((n, j) => n + bfClientSeconds(j), 0))}</small></span><span>›</span></button>`;
          })
          .join("")
      : '<div class="empty">Nessun cliente trovato.</div>'
  }</div></div><div class="panel bf-client-right">${active ? bfClientDetail(active, jobsFor(active)) : `<div class="bf-client-placeholder"><h3>Seleziona un cliente</h3><p>Qui trovi le sue commesse, le ore effettive e i file associati.</p></div>`}</div></div>`;
}
function bfClientDetail(c, jobs) {
  const sec = jobs.reduce((n, j) => n + bfClientSeconds(j), 0);
  const complete = jobs.filter((j) =>
    ["Completata", "Consegnata"].includes(j.status),
  ).length;
  const files = jobs.reduce((n, j) => n + (j.files || []).length, 0);
  return `<div class="bf-client-detail-head"><div><span class="eyebrow">SCHEDA CLIENTE</span><h2>${esc(c.name)}</h2><p>${esc(c.email || "")}${c.phone ? " · " + esc(c.phone) : ""}</p></div><div class="bf-client-head-actions"><button class="btn subtle" data-bf-edit-client="${esc(c.id)}">Modifica</button><button class="btn subtle bf-client-delete" data-bf-delete-client="${esc(c.id)}" aria-label="Elimina cliente ${esc(c.name)}">Elimina cliente</button></div></div><div class="bf-client-metrics"><div><small>Ore complessive</small><strong>${bfHumanHours(sec)}</strong></div><div><small>Ordini totali</small><strong>${jobs.length}</strong></div><div><small>Completati</small><strong>${complete}</strong></div><div><small>File</small><strong>${files}</strong></div></div>${c.notes ? `<div class="bf-client-note"><b>Note cliente</b><p>${esc(c.notes)}</p></div>` : ""}<h3>Ordini del cliente</h3>${
    jobs.length
      ? `<div class="bf-client-orders">${jobs
          .slice()
          .sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt))
          .map(
            (j) =>
              `<button data-open="${esc(j.id)}" class="bf-client-order"><span><b>${esc(j.code)} · ${esc(j.article)}</b><small>${esc(j.status)} · ${formatDate(j.dueDate)} · ${(j.files || []).length} file</small></span><strong>${bfHumanHours(bfClientSeconds(j))}</strong></button>`,
          )
          .join("")}</div>`
      : '<div class="empty">Nessun ordine associato.</div>'
  }<button class="btn primary" id="bfClientNewJob">+ Nuova commessa per questo cliente</button>`;
}
function bfRevealOnMobile(selector) {
  const limit = selector === ".bf-quote-editor" ? 1100 : 860;
  if (!window.matchMedia(`(max-width: ${limit}px)`).matches) return;
  requestAnimationFrame(() => $(selector)?.scrollIntoView({ block: "start", behavior: "instant" }));
}

function bfClientEditor(client) {
  const root = $("#bfClients");
  bfRevealOnMobile(".bf-client-right");
  root.dataset.editing = client?.id || "";
  root.querySelector(".bf-client-right").innerHTML =
    `<h2>${client ? "Modifica cliente" : "Nuovo cliente"}</h2><form id="bfClientForm" class="bf-client-form"><label>Nome o ragione sociale *<input name="name" required maxlength="150" value="${esc(client?.name || "")}"></label><label>Email<input name="email" type="email" value="${esc(client?.email || "")}"></label><label>Telefono<input name="phone" value="${esc(client?.phone || "")}"></label><label>Note<textarea name="notes" rows="4">${esc(client?.notes || "")}</textarea></label><div class="bf-client-actions"><button class="btn primary" type="submit">Salva cliente</button><button class="btn subtle" type="button" id="bfCancelClient">Annulla</button></div></form>`;
}
document.addEventListener("click", (e) => {
  const root = $("#bfClients");
  if (!root) return;
  const row = e.target.closest("[data-bf-client]");
  if (row) {
    root.dataset.selected = row.dataset.bfClient;
    bfRenderClients();
    bfRevealOnMobile(".bf-client-right");
    return;
  }
  if (e.target.closest("#bfNewClient")) {
    bfClientEditor(null);
    return;
  }
  const edit = e.target.closest("[data-bf-edit-client]");
  if (edit) {
    bfClientEditor(
      bfClientCatalog().find((c) => c.id === edit.dataset.bfEditClient),
    );
    return;
  }
  const del = e.target.closest("[data-bf-delete-client]");
  if (del) {
    bfDeleteClient(del.dataset.bfDeleteClient);
    return;
  }
  if (e.target.closest("#bfCancelClient")) {
    bfRenderClients();
    return;
  }
  if (e.target.closest("#bfClientNewJob")) {
    const active = bfClientCatalog().find(
      (c) => c.id === root.dataset.selected,
    );
    openNewJob();
    const inp = $('#jobForm [name="client"]');
    if (inp && active) inp.value = active.name;
    return;
  }
});
async function bfDeleteClient(id) {
  const root = $("#bfClients"),
    client = bfClientCatalog().find((c) => c.id === id);
  if (!client) return toast("Cliente non trovato.", true);
  const linked = bfClientJobs(client);
  const msg = linked.length
    ? `Eliminare la scheda cliente "${client.name}"?\n\nLe ${linked.length} commesse associate, i file e le ore di lavoro NON saranno cancellati. Rimarranno consultabili nella sezione Commesse.`
    : `Eliminare il cliente "${client.name}"? Questa azione rimuove la sua scheda dall'elenco clienti.`;
  if (!window.confirm(msg)) return;
  // Soft delete survives merges with older copies from Google Drive.
  let record = (db.clients || []).find((c) => c.id === client.id);
  if (!record) {
    record = { id: client.id, name: client.name, createdAt: now() };
    db.clients.push(record);
  }
  record.deleted = true;
  record.deletedAt = now();
  record.updatedAt = record.deletedAt;
  root.dataset.selected = "";
  root.dataset.editing = "";
  await saveAndSync("Cliente eliminato. Commesse e ore conservate.");
  switchView("clients");
}
document.addEventListener("input", (e) => {
  if (e.target.id === "bfClientSearch") {
    const root = $("#bfClients"),
      pos = e.target.selectionStart;
    root.dataset.query = e.target.value;
    bfRenderClients();
    const el = $("#bfClientSearch");
    el.focus();
    el.setSelectionRange(pos, pos);
  }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "bfClientForm") return;
  e.preventDefault();
  const root = $("#bfClients"),
    data = Object.fromEntries(new FormData(e.target));
  data.name = String(data.name || "").trim();
  if (!data.name) return toast("Inserisci il nome del cliente.", true);
  const old = bfClientCatalog().find((c) => c.id === root.dataset.editing);
  const duplicate = (db.clients || []).find(
    (c) =>
      !c.deleted &&
      c.id !== old?.id &&
      bfClientKey(c.name) === bfClientKey(data.name),
  );
  if (duplicate) return toast("Un cliente con questo nome esiste già.", true);
  let record;
  if (old && !old.legacy) {
    record = db.clients.find((c) => c.id === old.id);
    const oldName = record.name;
    Object.assign(record, data, { updatedAt: now() });
    for (const j of db.jobs) {
      if (
        j.clientId === record.id ||
        (!j.clientId && bfClientKey(j.client) === bfClientKey(oldName))
      ) {
        j.clientId = record.id;
        j.client = record.name;
        j.updatedAt = now();
      }
    }
  } else {
    record = {
      id: `client_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...data,
      createdAt: now(),
      updatedAt: now(),
    };
    db.clients.push(record);
    const match = old?.name || data.name;
    for (const j of db.jobs) {
      if (!j.clientId && bfClientKey(j.client) === bfClientKey(match)) {
        j.clientId = record.id;
        j.client = record.name;
        j.updatedAt = now();
      }
    }
  }
  root.dataset.selected = record.id;
  root.dataset.editing = "";
  await saveAndSync("Cliente salvato.");
  switchView("clients");
});

function initEvents() {
  document.addEventListener("click", async (e) => {
    const create = e.target.closest("[data-create-job]");
    if (create) {
      openNewJob();
      return;
    }
    const nav = e.target.closest("[data-view]");
    if (nav) {
      switchView(nav.dataset.view);
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      openDetail(open.dataset.open);
      return;
    }
    const upload = e.target.closest("[data-upload]");
    if (upload) {
      try {
        await ensureConnected();
        pendingUploadCategory = upload.dataset.upload;
        const input = $("#hiddenFileInput");
        input.accept = ACCEPTS[pendingUploadCategory] || "";
        input.value = "";
        input.click();
      } catch {}
      return;
    }
    const driveOpen = e.target.closest("[data-drive-open]");
    if (driveOpen) {
      const id = driveOpen.dataset.driveOpen;
      if (id) window.open(BadfishDrive.driveFileUrl(id), "_blank", "noopener");
      return;
    }
    const remove = e.target.closest("[data-file-remove]");
    if (remove) {
      const job = db.jobs.find((j) => j.id === selectedJobId),
        file = job?.files.find((f) => f.id === remove.dataset.fileRemove);
      if (!job || !file) return;
      if (
        !confirm(
          file.repeatCopyFromDriveId && !file.driveFileId
            ? `Rimuovere ${file.name} dai file da copiare? Il file originale resta nella lavorazione precedente.`
            : `Rimuovere ${file.name}? Il file verrà eliminato anche da Google Drive.`,
        )
      )
        return;
      try {
        if (file.driveFileId) {
          await ensureConnected();
          await BadfishDrive.deleteFile(file.driveFileId);
        }
        job.files = job.files.filter((f) => f.id !== file.id);
        job.updatedAt = now();
        await saveAndSync("File eliminato.");
        if (selectedJobId === job.id) openDetail(job.id);
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }
  });
  $("#hiddenFileInput").addEventListener("change", async (e) => {
    try {
      await uploadFiles([...e.target.files], pendingUploadCategory);
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#newJobBtn").addEventListener("click", openNewJob);
  $("#closeModalBtn").addEventListener("click", closeNewJob);
  $("#cancelModalBtn").addEventListener("click", closeNewJob);
  $("#modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeNewJob();
  });
  $("#detailBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "detailBackdrop") closeDetail();
  });
  $("#jobSearch").addEventListener("input", renderJobs);
  $("#statusFilter").addEventListener("change", renderJobs);
  $("#fileSearch").addEventListener("input", renderFiles);
  $("#fileCategoryFilter").addEventListener("change", renderFiles);
  ["bfArchiveClient", "bfArchiveGroup", "bfArchiveOrder"].forEach((id) =>
    $("#" + id)?.addEventListener("change", renderFiles),
  );
  $("#jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (
      db.jobs.some(
        (j) =>
          j.code.toLowerCase() === String(payload.code).trim().toLowerCase(),
      )
    )
      return toast("Esiste già una commessa con questo codice.", true);
    let job = {
      id: `job_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      code: String(payload.code).trim(),
      client: String(payload.client).trim(),
      clientId: bfClientIdForName(String(payload.client).trim()),
      article: String(payload.article).trim(),
      material: String(payload.material || "").trim(),
      quantity: Number(payload.quantity || 0),
      dueDate: payload.dueDate || "",
      status: payload.status || "Da progettare",
      notes: payload.notes || "",
      createdAt: now(),
      updatedAt: now(),
      files: [],
    };
    try { job = window.BadfishRepeats?.build(job) || job; }
    catch (error) { toast(error.message, true); return; }
    db.jobs.unshift(job);
    closeNewJob();
    openDetail(job.id);
    await saveAndSync(job.repeatedFrom ? "Nuova lavorazione creata." : "Commessa creata.");
    if (job.repeatedFrom && selectedJobId === job.id) openDetail(job.id);
  });
  const doConnect = () => connectDrive({ silent: false });
  $("#connectDriveBtn").addEventListener("click", doConnect);
  $("#settingsConnectBtn").addEventListener("click", doConnect);
  $("#dashboardDriveAction").addEventListener("click", async () => {
    if (BadfishDrive.isConnected()) {
      try {
        await syncDrive(true);
      } catch {}
    } else await doConnect();
  });
  const doSync = async () => {
    try {
      await ensureConnected();
      await syncDrive(true);
    } catch {}
  };
  $("#syncBtn").addEventListener("click", doSync);
  $("#sidebarSyncBtn").addEventListener("click", doSync);
  $("#disconnectDriveBtn").addEventListener("click", () => {
    BadfishDrive.clearToken();
    driveRefs = null;
    const email = getPreferredGoogleEmail();
    setSyncState(
      "",
      "Drive non collegato",
      email ? `Account salvato: ${email}` : "Cache locale disponibile",
    );
    toast("Drive disconnesso. L’email salvata resta memorizzata.");
  });
  $("#saveClientIdBtn").addEventListener("click", () => {
    BadfishDrive.setClientId($("#googleClientId").value);
    BadfishDrive.clearToken();
    driveRefs = null;
    setSyncState("", "Drive non collegato", "Client ID salvato");
    toast("Client ID salvato.");
  });
  $("#googleEmailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = setPreferredGoogleEmail(
        $("#googleAccountEmail").value,
        $("#rememberGoogleEmail").checked,
      );
      BadfishDrive.clearToken();
      driveRefs = null;
      hideGoogleEmailSetup();
      toast(`Account ${email} salvato.`);
      await connectDrive({ email, silent: false });
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#skipGoogleEmailBtn").addEventListener("click", () => {
    hideGoogleEmailSetup();
    setSyncState("", "Modalità offline", "Configura Drive dalle Impostazioni");
  });
  $("#forgetGoogleEmailBtn").addEventListener("click", () => {
    if (!confirm("Dimenticare l’account Google salvato su questo dispositivo?"))
      return;
    clearPreferredGoogleEmail();
    setSyncState("", "Drive non collegato", "Nessun account configurato");
    showGoogleEmailSetup();
  });
  $("#savePreferredGoogleEmailBtn").addEventListener("click", () => {
    try {
      const email = setPreferredGoogleEmail(
        $("#preferredGoogleEmail").value,
        true,
      );
      BadfishDrive.clearToken();
      driveRefs = null;
      setSyncState("", "Drive non collegato", `Account salvato: ${email}`);
      toast(
        `Account ${email} salvato. Premi “Collega Drive” per autorizzarlo.`,
      );
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#saveSettingsBtn").addEventListener("click", async () => {
    db.settings.companyName =
      $("#companyName").value.trim() || "Badfish Body Jewelry";
    ["companyAddress", "companyVat", "companyContacts"].forEach((key) => {
      db.settings[key] = $("#" + key).value.trim();
    });
    await saveAndSync("Impostazioni salvate.");
  });
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#closeDetail,[data-close-detail]")) closeDetail();
    if (e.target.closest("#openDriveFolderBtn")) {
      const job = db.jobs.find((j) => j.id === selectedJobId);
      if (job?.driveFolderId)
        window.open(
          BadfishDrive.folderUrl(job.driveFolderId),
          "_blank",
          "noopener",
        );
    }
    if (e.target.closest("#saveDetailBtn")) {
      const job = db.jobs.find((j) => j.id === selectedJobId);
      if (!job) return;
      const code = $("#detailCode").value.trim();
      const client = $("#detailClient").value.trim();
      const article = $("#detailArticle").value.trim();
      const quantityInput = $("#detailQuantity");
      if (!code || !client || !article) return toast("Compila codice, cliente e articolo.", true);
      if (db.jobs.some((j) => j.id !== job.id && String(j.code || "").trim().toLowerCase() === code.toLowerCase()))
        return toast("Esiste già una commessa con questo codice.", true);
      if (quantityInput.value !== "" && (!quantityInput.validity.valid || !Number.isFinite(Number(quantityInput.value))))
        return toast("Inserisci una quantità intera pari o superiore a zero.", true);
      if (bfClientKey(client) !== bfClientKey(job.client)) job.clientId = bfClientIdForName(client);
      job.code = code;
      job.client = client;
      job.article = article;
      job.material = $("#detailMaterial").value.trim();
      job.quantity = quantityInput.value === "" ? 0 : Number(quantityInput.value);
      job.status = $("#detailStatus").value;
      job.dueDate = $("#detailDueDate").value;
      job.notes = $("#detailNotes").value;
      job.updatedAt = now();
      await saveAndSync("Commessa aggiornata.");
      if (selectedJobId === job.id) openDetail(job.id);
    }
    if (e.target.closest("#deleteJobBtn")) {
      const job = db.jobs.find((j) => j.id === selectedJobId);
      if (!job) return;
      if (
        !confirm(
          `Eliminare ${job.code} dal gestionale? I file su Drive non verranno cancellati.`,
        )
      )
        return;
      db.jobs = db.jobs.filter((j) => j.id !== job.id);
      db.deletedJobs.push({ id: job.id, deletedAt: now() });
      closeDetail();
      await saveAndSync("Commessa rimossa dal gestionale.");
    }
  });
  document.addEventListener("click", async (e) => {
    const action = e.target.closest(
      "#bfStartTimer,#bfPauseTimer,#bfStopTimer,#bfAddManual",
    );
    if (!action) return;
    const j = db.jobs.find((x) => x.id === selectedJobId);
    if (!j) return;
    if (action.id === "bfStartTimer") {
      if (j.timerStartedAt) return;
      j.timerStartedAt = now();
      j.timerPhase = $("#bfPhase").value;
    } else if (action.id === "bfPauseTimer") {
      if (!j.timerStartedAt) return;
      j.timerAccumulatedSeconds = bfRunningSeconds(j);
      delete j.timerStartedAt;
    } else if (action.id === "bfStopTimer") {
      if (!j.timerStartedAt && !j.timerAccumulatedSeconds) return;
      const end = now(),
        seconds = bfRunningSeconds(j),
        minutes = seconds / 60;
      j.workSessions = j.workSessions || [];
      j.workSessions.push({
        id: `session_${Date.now()}`,
        phase: j.timerPhase || "Lavorazione CNC",
        minutes,
        seconds,
        startedAt: j.timerStartedAt || null,
        endedAt: end,
      });
      delete j.timerStartedAt;
      delete j.timerPhase;
      delete j.timerAccumulatedSeconds;
    } else if (action.id === "bfAddManual") {
      const h = Number($("#bfManualHours").value),
        m = Number($("#bfManualMinutes").value);
      if (
        !Number.isInteger(h) ||
        !Number.isInteger(m) ||
        h < 0 ||
        h > 100000 ||
        m < 0 ||
        m > 59 ||
        h * 60 + m <= 0
      ) {
        toast("Inserisci un tempo valido maggiore di zero.", true);
        return;
      }
      j.workSessions = j.workSessions || [];
      j.workSessions.push({
        id: `session_${Date.now()}`,
        phase: $("#bfPhase").value,
        minutes: h * 60 + m,
        seconds: (h * 60 + m) * 60,
        createdAt: now(),
        endedAt: now(),
        manual: true,
      });
    }
    j.updatedAt = now();
    await saveAndSync("Lavorazione aggiornata.");
    if (selectedJobId === j.id) openDetail(j.id);
  });
  document.addEventListener("click", async (e) => {
    const add = e.target.closest("#bfAddRawPiece"),
      del = e.target.closest("[data-piece-delete]"),
      run = e.target.closest("[data-piece-analyze]");
    if (!add && !del && !run) return;
    const job = db.jobs.find((j) => j.id === selectedJobId);
    if (!job) return;
    job.rawPieces = Array.isArray(job.rawPieces) ? job.rawPieces : [];
    if (add)
      job.rawPieces.push({
        id: `piece_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `Pezzo ${job.rawPieces.length + 1}`,
        fusionFileId: "",
      });
    if (del) {
      if (
        !confirm(
          "Eliminare questo pezzo e le sue misure? I file su Drive restano archiviati.",
        )
      )
        return;
      job.rawPieces = job.rawPieces.filter(
        (p) => p.id !== del.dataset.pieceDelete,
      );
    }
    if (run) {
      const piece = job.rawPieces.find(
        (p) => p.id === run.dataset.pieceAnalyze,
      );
      if (!piece) return;
      const f = (job.files || []).find((x) => x.id === piece.fusionFileId);
      if (!f?.driveFileId) {
        toast(
          "Seleziona un progetto .f3d della commessa oppure leggilo dal dispositivo.",
          true,
        );
        return;
      }
      if (!window.BadfishDrive?.isConnected()) {
        toast(
          "Collega Google Drive per leggere il progetto, oppure usa un file dal dispositivo.",
          true,
        );
        return;
      }
      const token = {};
      bfStockReads.set(piece, token);
      try {
        run.disabled = true;
        run.textContent = "Lettura in corso…";
        const buffer = await BadfishDrive.downloadBinary(f.driveFileId);
        if (
          bfStockReads.get(piece) !== token ||
          piece.fusionFileId !== f.id ||
          !job.rawPieces.includes(piece)
        )
          return;
        bfApplyFusionSetups(piece, BadfishFusionStock.read(buffer), {
          fileName: f.name,
          fileId: f.id,
          driveFileId: f.driveFileId,
          measuredAt: now(),
        });
      } catch (err) {
        if (bfStockReads.get(piece) !== token || !job.rawPieces.includes(piece))
          return;
        piece.stock = null;
        piece.fusionSetups = [];
        piece.stockError = err.message;
        toast("Lettura grezzo non riuscita: " + err.message, true);
      }
    }
    job.updatedAt = now();
    await saveAndSync("Pezzi e misure salvati.");
    if (selectedJobId === job.id) openDetail(job.id);
  });
  document.addEventListener("change", async (e) => {
    const id =
      e.target.dataset.pieceTitle ||
      e.target.dataset.pieceFile ||
      e.target.dataset.pieceSetup ||
      e.target.dataset.pieceLocal;
    if (!id) return;
    const job = db.jobs.find((j) => j.id === selectedJobId),
      piece = job?.rawPieces?.find((p) => p.id === id);
    if (!piece) return;
    if (e.target.dataset.pieceTitle) {
      piece.title = e.target.value.trim().slice(0, 160) || "Senza titolo";
      const heading = e.target.closest(".bf-piece-card")?.querySelector("h4");
      if (heading) heading.textContent = piece.title;
      job.updatedAt = now();
      await saveAndSync("Titolo del pezzo salvato.");
      return;
    }
    if (e.target.dataset.pieceFile) {
      bfStockReads.set(piece, {});
      piece.fusionFileId = e.target.value;
      piece.stock = null;
      piece.fusionSetups = [];
      piece.stockError = "";
    }
    if (e.target.dataset.pieceSetup) {
      const s = piece.fusionSetups?.find((s) => s.id === e.target.value);
      piece.stock = s && !s.error ? s : null;
      piece.stockError = s?.error || "";
    }
    if (e.target.dataset.pieceLocal) {
      const file = e.target.files?.[0];
      if (!file) return;
      const token = {};
      bfStockReads.set(piece, token);
      try {
        if (!/\.f3d$/i.test(file.name))
          throw Error("Seleziona un singolo progetto .f3d.");
        if (file.size > 200 * 1024 * 1024)
          throw Error("File Fusion troppo grande (massimo 200 MB).");
        e.target.disabled = true;
        const buffer = await file.arrayBuffer();
        if (bfStockReads.get(piece) !== token || !job.rawPieces.includes(piece))
          return;
        bfApplyFusionSetups(piece, BadfishFusionStock.read(buffer), {
          fileName: file.name,
          fileId: null,
          measuredAt: now(),
        });
        piece.fusionFileId = "";
      } catch (err) {
        if (bfStockReads.get(piece) !== token || !job.rawPieces.includes(piece))
          return;
        piece.stock = null;
        piece.fusionSetups = [];
        piece.stockError = err.message;
        toast(err.message, true);
      }
    }
    job.updatedAt = now();
    await saveAndSync("Dati del pezzo salvati.");
    if (selectedJobId === job.id) openDetail(job.id);
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-bf-remove-session]");
    if (!b) return;
    const job = db.jobs.find((j) => j.id === selectedJobId);
    if (!job) return;
    if (!confirm("Eliminare questa sessione di lavoro?")) return;
    job.workSessions = (job.workSessions || []).filter(
      (s) => s.id !== b.dataset.bfRemoveSession,
    );
    job.updatedAt = now();
    await saveAndSync("Sessione eliminata.");
    if (selectedJobId === job.id) openDetail(job.id);
  });
  window.setInterval(() => {
    if (!selectedJobId) return;
    const j = db.jobs.find((x) => x.id === selectedJobId);
    const target = $("#bfTimerClock");
    if (target && j?.timerStartedAt)
      target.textContent = bfClockFormat(bfRunningSeconds(j));
  }, 1000);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("#installPwaBtn").classList.remove("hidden");
  });
  $("#installPwaBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#installPwaBtn").classList.add("hidden");
  });
  window.addEventListener("online", () => {
    const email = getPreferredGoogleEmail();
    setSyncState(
      BadfishDrive.isConnected() ? "ok" : "",
      BadfishDrive.isConnected() ? "Drive collegato" : "Online",
      email || "Pronto",
    );
    if (BadfishDrive.isConnected()) syncDrive(false).catch(() => {});
  });
  window.addEventListener("offline", () =>
    setSyncState("", "Modalità offline", "Dati locali disponibili"),
  );
}

if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update())
      .catch(() => {}),
  );

// Preventivi, compatibilità dati precedenti ed etichette QR.
const bfEuro = (n) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
const bfFloat = (v) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
function bfQuoteDefaults(j) {
  return {
    hoursMode: "recorded",
    hours: 0,
    hourlyRate: 25,
    machineRate: 5,
    materials: 0,
    other: 0,
    salePrice: 0,
    description: j.article || "",
    validUntil: "",
    notes: "",
    ...(j.estimate || {}),
  };
}
function bfBusinessPanel(j) {
  return ` <div class="bf-business-panel"><h4>Etichetta QR della commessa</h4><div class="bf-qr-panel"><div class="bf-qr-box" id="bfQrDisplay"></div><div><p class="bf-invoice-note"><b>${esc(j.code)}</b> · ${esc(j.article)}<br>Scansiona per aprire questa commessa nel gestionale.</p><button type="button" class="btn primary" id="bfPrintQR">Stampa etichetta QR</button></div></div><p class="bf-invoice-note">Il codice contiene soltanto il link e l'identificativo della commessa, non i dati del cliente. L'accesso ai file Drive richiede le autorizzazioni necessarie.</p></div>`;
}
function bfJobUrl(j) {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("job", j.id);
  return u.href;
}
function bfQrMarkup(text) {
  const qr = new window.BadfishQRCode(0, window.BadfishQRError.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(),
    cells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c))
        cells.push(`<rect x="${c + 4}" y="${r + 4}" width="1" height="1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR commessa"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells.join("")}</g></svg>`;
}
function bfMountQR() {
  const j = db.jobs.find((x) => x.id === selectedJobId),
    root = $("#bfQrDisplay");
  if (j && root) {
    try {
      root.innerHTML = bfQrMarkup(bfJobUrl(j));
    } catch (e) {
      root.textContent = "QR non disponibile: " + e.message;
    }
  }
}
async function bfPrintDocument(html) {
  document.querySelector(".bf-print-area")?.remove();
  const page = document.createElement("section");
  page.className = "bf-print-area";
  page.innerHTML = html;
  document.body.appendChild(page);
  await Promise.all([...page.querySelectorAll("img")].map((img) =>
    img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
  if (document.fonts?.ready) await document.fonts.ready;
  window.print();
}
const bfOrigOpenDetail = openDetail;
openDetail = function (id) {
  bfOrigOpenDetail(id);
  bfMountQR();
};
document.addEventListener("click", (e) => {
  if (!e.target.closest("#bfPrintQR")) return;
  const j = db.jobs.find((x) => x.id === selectedJobId);
  if (!j) return;
  const svg = bfQrMarkup(bfJobUrl(j));
  bfPrintDocument(
    `<h1>BADFISH · ETICHETTA COMMESSA</h1><div class="bf-print-qr">${svg}</div><h2>${esc(j.code)}</h2><p>${esc(j.article)}</p><p class="bf-print-muted">${esc(j.material || "")} · ${formatDate(j.dueDate)}</p>`,
  );
});

// Preventivi indipendenti salvati nel database sincronizzato con Drive.
let bfEditingQuoteId = "";
function bfQuoteNew() {
  return {
    id: "quote_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    number:
      "PREV-" +
      new Date().getFullYear() +
      "-" +
      String((db.quotes || []).filter((q) => !q.deleted).length + 1).padStart(
        3,
        "0",
      ),
    date: new Date().toISOString().slice(0, 10),
    customer: "",
    customerDetails: "",
    delivery: "",
    payment: "",
    vatRate: "",
    subject: "",
    jobId: "",
    status: "Bozza",
    validUntil: "",
    intro: "",
    items: [{ description: "", qty: 1, unit: "pz", price: 0 }],
    notes: "",
    conditions: "",
    hours: 0,
    labourRate: 0,
    machineRate: 0,
    materialCost: 0,
    extraCost: 0,
    createdAt: now(),
    updatedAt: now(),
  };
}
function bfQuoteSum(q) {
  return (q.items || []).reduce(
    (n, i) => n + (Number(i.qty) || 0) * (Number(i.price) || 0),
    0,
  );
}
// IVA facoltativa: i documenti precedenti mantengono il totale originale.
function bfQuoteVatRate(q) {
  return q.vatRate !== "" && q.vatRate != null && [0, 4, 5, 10, 22].includes(Number(q.vatRate))
    ? Number(q.vatRate) : null;
}
function bfQuoteVat(q) {
  return Math.round((Math.round(bfQuoteSum(q) * 100) / 100) * (bfQuoteVatRate(q) || 0)) / 100;
}
function bfQuoteTotal(q) {
  return Math.round(bfQuoteSum(q) * 100) / 100 + bfQuoteVat(q);
}
function bfQuoteCost(q) {
  return (
    Math.max(0, Number(q.hours) || 0) *
      (Math.max(0, Number(q.labourRate) || 0) +
        Math.max(0, Number(q.machineRate) || 0)) +
    Math.max(0, Number(q.materialCost) || 0) +
    Math.max(0, Number(q.extraCost) || 0)
  );
}
function bfQuoteEscape(v) {
  return esc(v ?? "");
}
function bfRenderQuotes() {
  const root = $("#bfQuotes");
  if (!root) return;
  const all = (db.quotes || [])
    .filter((q) => !q.deleted)
    .sort((a, b) => dateMs(b.updatedAt) - dateMs(a.updatedAt));
  const q = bfEditingQuoteId
    ? all.find((x) => x.id === bfEditingQuoteId)
    : null;
  const keepCostsOpen = root.dataset.quoteId === q?.id && root.querySelector(".bf-quote-internal")?.open;
  root.dataset.quoteId = q?.id || "";
  root.innerHTML = `<div class="bf-quote-head"><button class="btn primary" id="bfQuoteNew">+ Nuovo preventivo</button><p class="bf-help">Crea un preventivo libero. Cliente e commessa sono facoltativi; descrizioni e importi sono scritti da te.</p></div><div class="bf-quote-layout"><article class="panel bf-quote-list"><h3>Preventivi salvati <small>(${all.length})</small></h3>${all.map((x) => `<button type="button" class="bf-quote-entry ${q?.id === x.id ? "selected" : ""}" data-bf-open-quote="${bfQuoteEscape(x.id)}"><strong>${bfQuoteEscape(x.number)}</strong><span>${bfQuoteEscape(x.customer || "Cliente da definire")}</span><small>${bfQuoteEscape(x.subject || "Nessun oggetto")} · ${bfEuro(bfQuoteTotal(x))}</small><small>${bfQuoteEscape(x.status || "Bozza")}</small></button>`).join("") || '<p class="bf-help">Nessun preventivo. Premi “Nuovo preventivo”.</p>'}${
    db.jobs.filter((j) => j.estimate).length
      ? `<div class="bf-quote-old"><b>Preventivi precedenti</b><p>Quelli salvati dentro le commesse non vengono cancellati.</p>${db.jobs
          .filter((j) => j.estimate)
          .map(
            (j) =>
              `<button class="btn subtle" data-bf-import-job="${bfQuoteEscape(j.id)}">Importa ${bfQuoteEscape(j.code)}</button>`,
          )
          .join("")}</div>`
      : ""
  }</article><article class="panel bf-quote-editor">${q ? bfQuoteForm(q) : '<div class="bf-quote-empty"><h3>Il tuo spazio preventivi</h3><p>Apri un documento o creane uno. Puoi scrivere liberamente cosa stai proponendo, aggiungere righe e definire il prezzo.</p></div>'}</article></div>`;
  if (keepCostsOpen && root.querySelector(".bf-quote-internal"))
    root.querySelector(".bf-quote-internal").open = true;
}
function bfQuoteForm(q) {
  return `<form id="bfQuoteIndependentForm" autocomplete="off"><div class="bf-heading-row"><h3>Modifica preventivo</h3><span class="bf-tag">${bfQuoteEscape(q.status)}</span></div><div class="bf-quote-fields"><label>Numero preventivo<input name="number" required maxlength="70" value="${bfQuoteEscape(q.number)}"></label><label>Data<input name="date" type="date" value="${bfQuoteEscape(q.date)}"></label><label>Cliente / destinatario<input name="customer" placeholder="Scrivi liberamente il destinatario" value="${bfQuoteEscape(q.customer)}"></label><label class="bf-span-all">Dati cliente per il PDF<textarea name="customerDetails" rows="2" placeholder="Indirizzo, partita IVA o altri riferimenti">${bfQuoteEscape(q.customerDetails)}</textarea></label><label>Stato<select name="status">${["Bozza", "Inviato", "Accettato", "Rifiutato"].map((v) => `<option ${q.status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="bf-span-all">Oggetto o titolo<input name="subject" placeholder="Esempio: Taglio di pietre su misura" value="${bfQuoteEscape(q.subject)}"></label><label class="bf-span-all">Commessa associata (facoltativa)<select name="jobId"><option value="">Nessuna commessa: preventivo indipendente</option>${db.jobs.map((j) => `<option value="${bfQuoteEscape(j.id)}" ${q.jobId === j.id ? "selected" : ""}>${bfQuoteEscape(j.code)} · ${bfQuoteEscape(j.article)}</option>`).join("")}</select></label><label>Validità fino al<input type="date" name="validUntil" value="${bfQuoteEscape(q.validUntil)}"></label><label>Tempi di consegna<input name="delivery" placeholder="Es. 15 giorni lavorativi dalla conferma" value="${bfQuoteEscape(q.delivery)}"></label><label>Pagamento<input name="payment" placeholder="Es. Bonifico a 30 giorni" value="${bfQuoteEscape(q.payment)}"></label><label>IVA nel PDF<select name="vatRate">${[["", "Non calcolata / da specificare"], ["0", "0%"], ["4", "4%"], ["5", "5%"], ["10", "10%"], ["22", "22%"]].map(([v, label]) => `<option value="${v}" ${String(q.vatRate ?? "") === v ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="bf-span-all">Presentazione / descrizione libera<textarea name="intro" rows="3" placeholder="Descrivi il lavoro come preferisci">${bfQuoteEscape(q.intro)}</textarea></label></div><div class="bf77-template-wrap"><label>Modello rapido<select id="bf77QuoteTemplate"><option value="">Preventivo libero (nessun modello)</option><option value="taglio">Taglio pietra</option><option value="lucidatura">Lucidatura</option><option value="cnc">Lavorazione CNC</option></select></label><small>Il modello aggiunge una riga modificabile senza cancellare le tue descrizioni.</small></div><h4>Voci del preventivo</h4><p class="bf-help">Aggiungi tutti gli articoli o servizi che vuoi, con quantità e importo unitario.</p><div class="bf-quote-items">${(q.items || []).map((it, i) => bfQuoteRow(it, i)).join("")}</div><button type="button" class="btn subtle" id="bfQuoteAddRow">+ Aggiungi riga</button><div class="bf-quote-total">Totale preventivo: <strong id="bfQuoteLiveTotal">${bfEuro(bfQuoteTotal(q))}</strong></div><div class="bf-quote-fields"><label class="bf-span-all">Note per il cliente<textarea name="notes" rows="3">${bfQuoteEscape(q.notes)}</textarea></label><label class="bf-span-all">Condizioni / pagamenti<textarea name="conditions" rows="3">${bfQuoteEscape(q.conditions)}</textarea></label></div><details class="bf-quote-internal"><summary>Calcolo costi interni (non visibili nel PDF cliente)</summary><div class="bf-quote-fields">${[
    ["hours", "Ore previste"],
    ["labourRate", "Manodopera €/h"],
    ["machineRate", "Macchina €/h"],
    ["materialCost", "Materiali €"],
    ["extraCost", "Altri costi €"],
  ]
    .map(
      ([k, l]) =>
        `<label>${l}<input type="number" min="0" step="0.01" name="${k}" value="${bfQuoteEscape(q[k] || 0)}"></label>`,
    )
    .join(
      "",
    )}</div><p class="bf-help" id="bfQuoteCostSummary">Costo stimato ${bfEuro(bfQuoteCost(q))} · Margine stimato ${bfEuro(bfQuoteSum(q) - bfQuoteCost(q))}</p></details><div class="bf-quote-actions"><button type="submit" class="btn primary">Salva preventivo</button><button type="button" class="btn secondary" id="bf77QuotePreview">Anteprima</button><button type="button" class="btn secondary" id="bf77QuoteDuplicate">Duplica</button><button type="button" class="btn secondary" id="bfQuotePrint">Stampa / PDF</button><button type="button" class="btn danger" id="bfQuoteDelete">Elimina</button></div><p class="bf-help">Il PDF non è una fattura. I prezzi delle voci sono al netto dell’eventuale IVA selezionata. Completa l’intestazione in Impostazioni → Dati azienda e preventivi.</p></form>`;
}
function bfQuoteRow(it, i) {
  return `<div class="bf-quote-line"><label>Descrizione<textarea data-qi="description" rows="2" placeholder="Lavorazione / materiale">${bfQuoteEscape(it.description)}</textarea></label><label>Quantità<input data-qi="qty" type="number" min="0" step="0.01" value="${bfQuoteEscape(it.qty)}"></label><label>Unità<input data-qi="unit" value="${bfQuoteEscape(it.unit)}" maxlength="15"></label><label>Prezzo unitario €<input data-qi="price" type="number" min="0" step="0.01" value="${bfQuoteEscape(it.price)}"></label><button type="button" class="bf-quote-remove" title="Elimina riga">×</button></div>`;
}
function bfReadQuotePage() {
  const form = $("#bfQuoteIndependentForm");
  if (!form) throw Error("Apri prima un preventivo.");
  const fd = new FormData(form);
  const q = (db.quotes || []).find((x) => x.id === bfEditingQuoteId);
  const result = { ...q };
  [
    "number",
    "date",
    "customer",
    "customerDetails",
    "delivery",
    "payment",
    "vatRate",
    "subject",
    "jobId",
    "status",
    "validUntil",
    "intro",
    "notes",
    "conditions",
  ].forEach((k) => (result[k] = String(fd.get(k) || "")));
  ["hours", "labourRate", "machineRate", "materialCost", "extraCost"].forEach(
    (k) => (result[k] = Math.max(0, Number(fd.get(k)) || 0)),
  );
  result.items = [...form.querySelectorAll(".bf-quote-line")].map((row) => {
    const get = (k) => row.querySelector(`[data-qi="${k}"]`)?.value || "";
    return {
      description: get("description"),
      qty: Math.max(0, Number(get("qty")) || 0),
      unit: get("unit"),
      price: Math.max(0, Number(get("price")) || 0),
    };
  });
  return result;
}
function bfQuotePreview() {
  if (!$("#bfQuoteIndependentForm")) return;
  try {
    const q = bfReadQuotePage();
    $("#bfQuoteLiveTotal").textContent = bfEuro(bfQuoteTotal(q));
    $("#bfQuoteCostSummary").textContent =
      `Costo stimato ${bfEuro(bfQuoteCost(q))} · Margine stimato ${bfEuro(bfQuoteSum(q) - bfQuoteCost(q))}`;
  } catch {}
}
function bfQuoteDocumentHTML(q) {
  const nl = (v) => esc(v || "").replace(/\n/g, "<br>");
  const company = nl(db.settings.companyName || "BFBJ · Taglieria pietre");
  const vat = bfQuoteVatRate(q);
  const rows = (q.items || []).map((it) => {
    const [title, ...details] = String(it.description || "").split("\n");
    return `<tr><td><strong>${esc(title)}</strong>${details.length ? `<span class="bfp-detail">${nl(details.join("\n"))}</span>` : ""}</td><td>${esc(it.qty)}<span class="bfp-unit">${esc(it.unit || "")}</span></td><td>${bfEuro(it.price)}</td><td><strong>${bfEuro((Number(it.qty) || 0) * (Number(it.price) || 0))}</strong></td></tr>`;
  }).join("");
  const terms = [
    q.validUntil && ["VALIDITÀ", `Fino al ${formatDate(q.validUntil)}`],
    q.delivery && ["CONSEGNA", q.delivery],
    q.payment && ["PAGAMENTO", q.payment],
  ].filter(Boolean);
  return `<article class="bfp-root">
    <header class="bfp-brand"><img class="bfp-logo" src="./assets/badfish-logo.png?v=91" alt="BFBJ - Taglieria pietre"><div class="bfp-company"><strong>${company}</strong>${db.settings.companyAddress ? `<p>${nl(db.settings.companyAddress)}</p>` : ""}${db.settings.companyVat ? `<p>P. IVA ${nl(db.settings.companyVat)}</p>` : ""}${db.settings.companyContacts ? `<p>${nl(db.settings.companyContacts)}</p>` : ""}</div></header>
    <section class="bfp-title"><div><small>OFFERTA ECONOMICA</small><h1>Preventivo</h1></div><div class="bfp-number"><strong>${esc(q.number || "—")}</strong><span>Data ${formatDate(q.date)}</span></div></section>
    <section class="bfp-meta"><div><small>SPETTABILE</small><strong>${nl(q.customer) || "Destinatario da definire"}</strong>${q.customerDetails ? `<p>${nl(q.customerDetails)}</p>` : ""}</div><div><small>OGGETTO</small><strong>${nl(q.subject) || "Preventivo di lavorazione"}</strong></div></section>
    ${q.intro ? `<section class="bfp-intro">${nl(q.intro)}</section>` : ""}
    <small class="bfp-table-label">DETTAGLIO LAVORAZIONI</small>
    <table class="bfp-table"><colgroup><col style="width:55%"><col style="width:12%"><col style="width:16%"><col style="width:17%"></colgroup><thead><tr><th>Descrizione</th><th>Q.tà</th><th>Prezzo unit.</th><th>Importo</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nessuna voce inserita</td></tr>'}</tbody></table>
    <div class="bfp-closing"><section class="bfp-summary">${q.notes ? `<div class="bfp-notes"><small>NOTE DI LAVORAZIONE</small><p>${nl(q.notes)}</p></div>` : '<div></div>'}<div class="bfp-totals">${vat !== null ? `<div><span>Imponibile</span><span>${bfEuro(bfQuoteSum(q))}</span></div><div><span>IVA ${vat}%</span><span>${bfEuro(bfQuoteVat(q))}</span></div>` : ""}<div class="bfp-total"><span>TOTALE</span><strong>${bfEuro(bfQuoteTotal(q))}</strong></div>${vat === null ? '<p class="bfp-tax-note">IVA non calcolata. Eventuale applicazione da specificare nelle condizioni.</p>' : ""}</div></section>
    ${terms.length ? `<section class="bfp-terms">${terms.map(([title, value]) => `<div><small>${title}</small><p>${nl(value)}</p></div>`).join("")}</section>` : ""}
    ${q.conditions ? `<section class="bfp-conditions"><small>CONDIZIONI E PAGAMENTI</small><p>${nl(q.conditions)}</p></section>` : ""}
    <div class="bfp-signature"><span>Per accettazione</span><span class="bfp-sign-line"></span></div>
    <footer class="bfp-footer"><span>Documento di preventivo, non fattura fiscale.</span><span>${esc(q.number || "")}</span></footer></div>
  </article>`;
}
function bfQuotePrintPage(q) {
  bfPrintDocument(bfQuoteDocumentHTML(q));
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest(
    "#bfQuoteNew,[data-bf-open-quote],[data-bf-import-job],#bfQuoteAddRow,.bf-quote-remove,#bfQuotePrint,#bfQuoteDelete,#bf77QuotePreview,#bf77QuoteDuplicate",
  );
  if (!b) return;
  if (b.id === "bf77QuoteDuplicate") {
    const original = bfReadQuotePage(),
      copy = bfQuoteNew();
    Object.assign(copy, original, {
      id: copy.id,
      number: copy.number,
      date: new Date().toISOString().slice(0, 10),
      status: "Bozza",
      createdAt: now(),
      updatedAt: now(),
      items: (original.items || []).map((it) => ({ ...it })),
    });
    db.quotes.push(copy);
    bfEditingQuoteId = copy.id;
    await saveAndSync("Preventivo duplicato.");
    bfRenderQuotes();
    bfRevealOnMobile(".bf-quote-editor");
    return;
  }
  if (b.id === "bf77QuotePreview") {
    const q = bfReadQuotePage();
    let popup = document.getElementById("bf77PreviewOverlay");
    if (popup) popup.remove();
    popup = document.createElement("div");
    popup.id = "bf77PreviewOverlay";
    popup.className = "bf77-preview-backdrop";
    popup.innerHTML = `<div class="bf77-preview-paper" role="dialog" aria-modal="true" aria-label="Anteprima preventivo"><button type="button" class="btn secondary" id="bf77PreviewClose">Chiudi anteprima ×</button><div class="bf77-paper-content">${bfQuoteDocumentHTML(q)}</div></div>`;
    document.body.appendChild(popup);
    popup
      .querySelector("#bf77PreviewClose")
      .addEventListener("click", () => popup.remove());
    popup.addEventListener("click", (event) => {
      if (event.target === popup) popup.remove();
    });
    return;
  }
  if (b.id === "bfQuoteNew") {
    const q = bfQuoteNew();
    db.quotes.push(q);
    bfEditingQuoteId = q.id;
    await saveAndSync("Bozza preventivo creata.");
    bfRenderQuotes();
    bfRevealOnMobile(".bf-quote-editor");
    return;
  }
  if (b.dataset.bfOpenQuote) {
    bfEditingQuoteId = b.dataset.bfOpenQuote;
    bfRenderQuotes();
    bfRevealOnMobile(".bf-quote-editor");
    return;
  }
  if (b.dataset.bfImportJob) {
    const j = db.jobs.find((j) => j.id === b.dataset.bfImportJob);
    if (!j) return;
    const v = bfQuoteDefaults(j),
      q = bfQuoteNew();
    Object.assign(q, {
      customer: j.client,
      subject: v.description || j.article,
      intro: v.description || "",
      jobId: j.id,
      validUntil: v.validUntil || "",
      notes: v.notes || "",
      items: [
        {
          description: v.description || j.article,
          qty: 1,
          unit: "lavoro",
          price: Number(v.salePrice) || 0,
        },
      ],
      hours:
        v.hoursMode === "manual"
          ? v.hours
          : (bfSessionSeconds(j) + bfRunningSeconds(j)) / 3600,
      labourRate: v.hourlyRate,
      machineRate: v.machineRate,
      materialCost: v.materials,
      extraCost: v.other,
    });
    db.quotes.push(q);
    bfEditingQuoteId = q.id;
    await saveAndSync("Preventivo precedente importato come copia.");
    bfRenderQuotes();
    bfRevealOnMobile(".bf-quote-editor");
    return;
  }
  if (b.id === "bfQuoteAddRow") {
    const q = bfReadQuotePage();
    q.items.push({ description: "", qty: 1, unit: "pz", price: 0 });
    const old = db.quotes.find((x) => x.id === q.id);
    Object.assign(old, q);
    bfRenderQuotes();
    const field = $(".bf-quote-line:last-child [data-qi=description]");
    field?.focus({ preventScroll: true });
    bfRevealOnMobile(".bf-quote-line:last-child");
    return;
  }
  if (b.classList.contains("bf-quote-remove")) {
    const q = bfReadQuotePage();
    const i = [
      ...$("#bfQuoteIndependentForm").querySelectorAll(".bf-quote-line"),
    ].indexOf(b.closest(".bf-quote-line"));
    q.items.splice(i, 1);
    Object.assign(
      db.quotes.find((x) => x.id === q.id),
      q,
    );
    bfRenderQuotes();
    return;
  }
  if (b.id === "bfQuotePrint") {
    const q = bfReadQuotePage();
    if (!q.number.trim()) {
      toast("Inserisci un numero preventivo.", true);
      return;
    }
    bfQuotePrintPage(q);
    return;
  }
  if (b.id === "bfQuoteDelete") {
    const q = db.quotes.find((x) => x.id === bfEditingQuoteId);
    if (!q || !confirm(`Eliminare il preventivo ${q.number}?`)) return;
    q.deleted = true;
    q.updatedAt = now();
    bfEditingQuoteId = "";
    await saveAndSync("Preventivo eliminato.");
    bfRenderQuotes();
    return;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.closest("#bfQuoteIndependentForm")) bfQuotePreview();
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "bfQuoteIndependentForm") return;
  e.preventDefault();
  const q = bfReadQuotePage();
  if (!q.number.trim()) {
    toast("Inserisci il numero del preventivo.", true);
    return;
  }
  q.updatedAt = now();
  Object.assign(
    db.quotes.find((x) => x.id === q.id),
    q,
  );
  await saveAndSync("Preventivo salvato.");
  bfRenderQuotes();
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "bf77QuoteTemplate" || !e.target.value) return;
  const choices = {
    taglio: "Taglio pietra su misura",
    lucidatura: "Lucidatura pietra",
    cnc: "Lavorazione CNC su specifica",
  };
  const title = choices[e.target.value];
  if (!title) return;
  const q = bfReadQuotePage();
  q.items.push({ description: title, qty: 1, unit: "pz", price: 0 });
  const old = db.quotes.find((x) => x.id === q.id);
  if (old) Object.assign(old, q);
  bfRenderQuotes();
});

function bootBadfish() {
  try {
    if (!window.BadfishDrive)
      throw new Error("Modulo Google Drive non caricato. Ricarica la pagina.");
    render();
    initEvents();
    const requestedView = new URLSearchParams(location.search).get("view");
    switchView(
      [
        "jobs",
        "files",
        "settings",
        "planner",
        "notes",
        "clients",
        "quotes",
        "stats",
      ].includes(requestedView)
        ? requestedView
        : "dashboard",
    );
    const jobLink = new URLSearchParams(location.search).get("job");
    if (jobLink) {
      const linked = db.jobs.find((j) => j.id === jobLink);
      if (linked) {
        switchView("jobs");
        openDetail(linked.id);
      } else
        toast(
          "Commessa non presente sul dispositivo: sincronizza Google Drive.",
          true,
        );
    }
    const startupEmail = getPreferredGoogleEmail();
    setSyncState(
      "",
      navigator.onLine ? "Drive non collegato" : "Modalità offline",
      startupEmail
        ? `Account salvato: ${startupEmail}`
        : navigator.onLine
          ? "Configura l’account Google"
          : "Dati locali disponibili",
    );
    if (!startupEmail) showGoogleEmailSetup();
    document.documentElement.dataset.badfishReady = "1";
  } catch (err) {
    console.error("Badfish boot error:", err);
    const toastEl = document.querySelector("#toast");
    if (toastEl) {
      toastEl.textContent = `Errore avvio: ${err.message}`;
      toastEl.className = "toast error";
    }
    document.documentElement.dataset.badfishReady = "0";
  }
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", bootBadfish, { once: true });
else bootBadfish();
