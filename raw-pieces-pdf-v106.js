/* Printable cutting sheet. Uses only saved Fusion stock measurements. */
function bfRawPiecesDocument(job) {
  const pieces = Array.isArray(job.rawPieces) ? job.rawPieces : [];
  const valid = (p) => p.stock?.sourceType === "fusion-stock" &&
    Array.isArray(p.stock.dimensions) && p.stock.dimensions.length === 3 &&
    p.stock.dimensions.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  const fmt = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 6 });
  const missing = pieces.filter((p) => !valid(p)).length;
  const rows = pieces.map((p, i) => `<tr><td>${i + 1}</td><td><strong>${esc(p.title || `Pezzo ${i + 1}`)}</strong>${valid(p) ? `<small>${esc(p.stock.fileName || "")}<br>Setup: ${esc(p.stock.name || "—")}</small>` : ""}</td>${valid(p) ? p.stock.dimensions.map((n) => `<td class="raw-size">${fmt(n)}</td>`).join("") : '<td colspan="3"><strong>MISURE MANCANTI — DA VERIFICARE</strong></td>'}</tr>`).join("");
  return `<style>
    @media print {
      .raw-sheet { font-size: 10pt; line-height: 1.4; }
      .raw-sheet header { display:flex; align-items:center; gap:20px; border-bottom:2px solid #222; padding-bottom:12px; }
      .raw-sheet header img { width:90px; height:65px; object-fit:contain; }
      .raw-sheet h1 { margin:0; font-size:20pt; }
      .raw-sheet p { overflow-wrap:anywhere; }
      .raw-sheet table { table-layout:fixed; font-size:10pt; }
      .raw-sheet th, .raw-sheet td { overflow-wrap:anywhere; vertical-align:top; }
      .raw-sheet thead { display:table-header-group; }
      .raw-sheet tr { break-inside:avoid; }
      .raw-sheet small { display:block; font-size:8pt; color:#444; margin-top:5px; }
      .raw-sheet .raw-size { font-weight:bold; font-variant-numeric:tabular-nums; }
      .raw-sheet .raw-warning { border:2px solid #222; padding:10px; }
    }
  </style><article class="raw-sheet"><header><img src="./assets/badfish-logo.png?v=91" alt="BFBJ"><div><h1>Distinta grezzi per il taglio</h1><span>${esc(db.settings?.companyName || "BFBJ · Taglieria")}</span></div></header>
  <p><strong>Commessa:</strong> ${esc(job.code || "—")} · ${esc(job.article || "—")}<br><strong>Cliente:</strong> ${esc(job.client || "—")}<br><strong>Materiale:</strong> ${esc(job.material || "Non specificato")}<br><strong>Consegna:</strong> ${esc(formatDate(job.dueDate))}<br><strong>Data stampa:</strong> ${new Date().toLocaleDateString("it-IT")}</p>
  <p><strong>${pieces.length} schede grezzo · Tutte le dimensioni sono in millimetri (mm).</strong></p>
  ${missing ? `<p class="raw-warning">ATTENZIONE: ${missing} schede senza misure valide. Completare le misure prima del taglio.</p>` : ""}
  <table><colgroup><col style="width:6%"><col style="width:40%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup><thead><tr><th>N.</th><th>Pezzo / riferimento</th><th>Lunghezza X<br>mm</th><th>Larghezza Y<br>mm</th><th>Altezza Z<br>mm</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Misure dei grezzi configurati nei setup Fusion salvati. Non sono le dimensioni del pezzo finito. Nessun sovrametallo aggiunto automaticamente. Ogni riga corrisponde a una scheda: verificare separatamente le quantità da tagliare.</p></article>`;
}
document.addEventListener("click", async (event) => {
  if (!event.target.closest("#bfPrintRawPieces")) return;
  const job = db.jobs.find((j) => j.id === selectedJobId);
  if (!job) return;
  if (!job.rawPieces?.length) return toast("Aggiungi almeno un pezzo prima di stampare.", true);
  const previousTitle = document.title;
  document.title = `Grezzi - ${job.code || "Commessa"}`;
  const restoreTitle = () => { document.title = previousTitle; };
  window.addEventListener("afterprint", restoreTitle, { once: true });
  try { await bfPrintDocument(bfRawPiecesDocument(job)); }
  catch (error) { restoreTitle(); toast("Stampa non riuscita: " + error.message, true); }
});
