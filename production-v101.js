/* Consegne: calcoli condivisi, senza accesso ai dati salvati. */
(function (root) {
  "use strict";
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
  const api = { deliveries, localDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BadfishProduction = api;
})(typeof window !== "undefined" ? window : globalThis);
