/* Badfish v7.8: esportazione e verifica non distruttiva di un backup locale. */
(() => {
  "use strict";
  const KEY = "badfish_manager_db_v3";
  const $ = (s) => document.querySelector(s);
  const status = (msg, err = false) => {
    const el = $("#bfBackupStatus");
    if (el) {
      el.textContent = msg;
      el.style.color = err ? "#b42318" : "";
    }
  };
  function validate(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw Error("Formato backup non valido.");
    if (payload.backupFormat !== "badfish-db-backup-v1")
      throw Error("Il file non è un backup Badfish riconosciuto.");
    const db = payload.database;
    if (!db || typeof db !== "object" || Array.isArray(db))
      throw Error("Database assente.");
    for (const k of [
      "jobs",
      "clients",
      "quotes",
      "tasks",
      "notes",
      "deletedJobs",
    ])
      if (!Array.isArray(db[k])) throw Error("Sezione non valida: " + k);
    if (!db.settings || typeof db.settings !== "object")
      throw Error("Impostazioni mancanti.");
    return {
      jobs: db.jobs.length,
      clients: db.clients.length,
      quotes: db.quotes.length,
      tasks: db.tasks.length,
      notes: db.notes.length,
    };
  }
  function download() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw)
        throw Error(
          "Nessun database locale trovato. Prima sincronizza il gestionale.",
        );
      const database = JSON.parse(raw);
      // Non esportare eventuali token/sessioni (questo database non dovrebbe contenerli).
      const payload = {
        backupFormat: "badfish-db-backup-v1",
        createdAt: new Date().toISOString(),
        origin: location.origin,
        database,
      };
      const numbers = validate(payload);
      const date = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "badfish-backup-" + date + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status(
        `Backup preparato: ${numbers.jobs} commesse, ${numbers.clients} clienti, ${numbers.quotes} preventivi. Conserva il file in luogo sicuro.`,
      );
    } catch (err) {
      status("Esportazione non riuscita: " + err.message, true);
    }
  }
  async function verify(file) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("Il file supera il limite di verifica (25 MB).");
      const payload = JSON.parse(await file.text());
      const n = validate(payload);
      status(
        `Backup valido del ${new Date(payload.createdAt).toLocaleString("it-IT")}: ${n.jobs} commesse, ${n.clients} clienti, ${n.quotes} preventivi, ${n.tasks} attività, ${n.notes} appunti. Nessun dato è stato modificato.`,
      );
    } catch (err) {
      status("Verifica fallita: " + err.message, true);
    }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#bfExportBackup")) download();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "bfVerifyBackup") {
      verify(e.target.files?.[0]);
      e.target.value = "";
    }
  });
})();
