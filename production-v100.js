/* Quantità e consegne: calcoli condivisi, senza accesso ai dati salvati. */
(function (root) {
  "use strict";
  function count(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }
  function validate(total, completed, rework) {
    if ([total, completed, rework].some((n) => !Number.isSafeInteger(n) || n < 0))
      return "Inserisci quantità intere pari o superiori a zero.";
    if (completed > total || rework > total - completed)
      return "Completati e da rilavorare non possono superare la quantità totale.";
    return "";
  }
  function progress(job) {
    const total = count(job.production?.total);
    const completed = count(job.production?.completed);
    const rework = count(job.production?.rework);
    return {
      total, completed, rework,
      remaining: Math.max(0, total - completed - rework),
      percent: total ? Math.min(100, Math.round(completed / total * 100)) : 0,
      recorded: !!job.production,
      error: validate(total, completed, rework),
    };
  }
  function localDay(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && localDay(date) === value;
  }
  function deliveries(jobs, date = new Date()) {
    const start = localDay(date);
    const last = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6, 12);
    const end = localDay(last);
    const due = jobs.filter((job) => job.status !== "Consegnata" && validDay(job.dueDate))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || String(a.code || "").localeCompare(String(b.code || ""), "it", { numeric: true }));
    return { start, end, overdue: due.filter((j) => j.dueDate < start), upcoming: due.filter((j) => j.dueDate >= start && j.dueDate <= end) };
  }
  const api = { validate, progress, deliveries, localDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BadfishProduction = api;
})(typeof window !== "undefined" ? window : globalThis);
