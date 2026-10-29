/* Backup e recupero guidato. Nessun collegamento automatico a Drive dopo il recupero. */
(() => {
  'use strict';
  const KEY = 'badfish_manager_db_v3', SAFETY = 'badfish_before_restore_v105';
  const core = window.BadfishBackupCore;
  let candidate = null, previewFingerprint = '', opener;
  const status = (message, error = false) => { const el = document.getElementById('bfBackupStatus'); el.textContent = message; el.classList.toggle('bf105-error', error); };
  const payload = database => ({backupFormat: 'badfish-db-backup-v1', createdAt: new Date().toISOString(), origin: location.origin, database});
  function download(value, prefix = 'badfish-backup') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function read(file) {
    if (file.size > 25 * 1024 * 1024) throw Error('Il file supera il limite di 25 MB.');
    const value = JSON.parse(await file.text()); core.validate(value); return value;
  }
  function refreshPreview() {
    if (!candidate) return;
    const overwrite = document.getElementById('bf105RestoreOverwrite').checked;
    const {counts} = core.plan(db, candidate, overwrite, now());
    previewFingerprint = JSON.stringify(db);
    const names = {jobs:'Commesse', clients:'Clienti', quotes:'Preventivi', tasks:'Attività', notes:'Appunti', machines:'Macchine'};
    document.getElementById('bf105RestorePreview').innerHTML = `<p>Backup del <b>${esc(Number.isFinite(Date.parse(candidate.createdAt)) ? formatDateTime(candidate.createdAt) : 'data non disponibile')}</b></p><div class="bf105-table-scroll"><table class="bf105-restore-table"><thead><tr><th>Contenuto</th><th>Da aggiungere</th><th>Da ripristinare</th><th>Lasciati invariati</th></tr></thead><tbody>${core.sections.map(k => `<tr><th>${names[k]}</th><td>${counts[k].added}</td><td>${counts[k].updated}</td><td>${counts[k].skipped}</td></tr>`).join('')}</tbody></table></div>`;
    document.getElementById('bf105RestoreConfirm').disabled = !Object.values(counts).some(c => c.added || c.updated);
  }
  function close() { document.getElementById('bf105RestoreDialog').close(); candidate = null; opener?.focus(); }
  document.addEventListener('click', async event => {
    try {
      if (event.target.closest('#bfExportBackup')) { const value = payload(JSON.parse(localStorage.getItem(KEY) || 'null')); core.validate(value); download(value); status('Backup preparato. I file effettivi restano su Drive.'); }
      if (event.target.closest('#bf105SafetyDownload')) { const raw = localStorage.getItem(SAFETY); if (!raw) throw Error('Non è presente una copia precedente al recupero.'); download(JSON.parse(raw), 'badfish-prima-del-ripristino'); }
      if (event.target.closest('[data-restore-close]')) close();
      if (!event.target.closest('#bf105RestoreConfirm')) return;
      const button = document.getElementById('bf105RestoreConfirm'); button.disabled = true;
      try {
        if (!candidate) throw Error('Seleziona un backup.');
        if (syncPromise) await syncPromise;
        if (JSON.stringify(db) !== previewFingerprint) { refreshPreview(); throw Error('I dati sono cambiati: controlla la nuova anteprima e conferma di nuovo.'); }
        const overwrite = document.getElementById('bf105RestoreOverwrite').checked;
        const {next} = core.plan(db, candidate, overwrite, now());
        const safety = payload(JSON.parse(JSON.stringify(db)));
        // Entrambe le scritture devono riuscire prima di sostituire i dati in memoria.
        localStorage.setItem(SAFETY, JSON.stringify(safety));
        localStorage.setItem(KEY, JSON.stringify(next));
        db = next;
        BadfishDrive.clearToken(); driveRefs = null;
        closeDetail(); close(); render();
        setSyncState('', 'Ripristino sul dispositivo', 'Controlla i dati prima di ricollegare Drive');
        status('Recupero completato sul dispositivo. Copia precedente conservata. Controlla i dati, poi ricollega Drive per sincronizzare.');
        document.getElementById('bf105SafetyDownload').hidden = false;
        try { await window.BadfishPush?.flush(); } catch { status('Recupero completato sul dispositivo. Avvisi CNC da aggiornare: riconnetti la rete e premi Aggiorna scadenze. Il precedente avviso può ancora arrivare.', true); }
      } catch (error) { if (candidate) refreshPreview(); throw error; }
    } catch (error) { status(error.message || 'Operazione non riuscita.', true); const el = document.getElementById('bf105RestoreError'); if (el) el.textContent = error.message; }
  });
  document.addEventListener('change', async event => {
    if (event.target.id === 'bf105RestoreOverwrite') { refreshPreview(); return; }
    if (!['bfVerifyBackup', 'bf105RestoreFile'].includes(event.target.id)) return;
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const value = await read(file);
      if (event.target.id === 'bfVerifyBackup') { const n = core.validate(value); status(`Backup valido: ${n.jobs} commesse, ${n.clients} clienti, ${n.quotes} preventivi. Nessun dato modificato.`); return; }
      candidate = value; opener = document.getElementById('bf105RestoreLabel');
      document.getElementById('bf105RestoreOverwrite').checked = false;
      document.getElementById('bf105RestoreError').textContent = '';
      refreshPreview(); document.getElementById('bf105RestoreDialog').showModal();
    } catch (error) { candidate = null; status('Backup non utilizzabile: ' + error.message, true); }
  });
  document.getElementById('bf105RestoreLabel').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); document.getElementById('bf105RestoreFile').click(); } });
  document.getElementById('bf105RestoreDialog').addEventListener('cancel', () => { candidate = null; });
  document.getElementById('bf105SafetyDownload').hidden = !localStorage.getItem(SAFETY);
})();
