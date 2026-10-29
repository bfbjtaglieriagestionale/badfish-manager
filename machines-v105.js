/* Macchine condivise con Drive. L'occupazione comprende pause e fine da confermare. */
(() => {
  'use strict';
  const list = () => (db.machines || []).filter(m => !m.deleted);
  const busy = (id, except) => db.jobs.filter(j => j.id !== except && j.machineId === id && j.countdown);
  const name = id => (db.machines || []).find(m => m.id === id)?.name || 'Macchina non assegnata';
  function options(job) {
    const entries = list();
    if (job.machineId && !entries.some(m => m.id === job.machineId)) entries.push({id: job.machineId, name: name(job.machineId)});
    return `<label class="field-label">Macchina<select id="bf105Machine" ${job.countdown ? 'disabled' : ''}><option value="">Non assegnata</option>${entries.map(m => `<option value="${esc(m.id)}" ${m.id === job.machineId ? 'selected' : ''} ${busy(m.id, job.id).length ? 'disabled' : ''}>${esc(m.name)}${busy(m.id, job.id).length ? ' · occupata' : ''}</option>`).join('')}</select></label>`;
  }
  function renderMachines() {
    const root = document.getElementById('bf105MachinesList');
    if (root) root.innerHTML = list().map(m => `<div class="bf105-machine-row"><div><b>${esc(m.name)}</b><small>${busy(m.id).length ? `${busy(m.id).length} lavorazioni assegnate` : 'Disponibile'}</small></div><div><button type="button" class="btn subtle" data-machine-rename="${esc(m.id)}">Rinomina</button><button type="button" class="btn subtle" data-machine-remove="${esc(m.id)}" ${busy(m.id).length ? 'disabled' : ''}>Rimuovi</button></div></div>`).join('') || '<p class="bf-help">Aggiungi le macchine del laboratorio per assegnare le lavorazioni.</p>';
    let board = document.getElementById('bf105MachineBoard');
    if (!board) { const anchor = document.getElementById('bf99Deliveries'); if (!anchor) return; board = document.createElement('section'); board.id = 'bf105MachineBoard'; board.className = 'panel bf105-machine-board'; anchor.before(board); }
    board.hidden = !list().length;
    board.innerHTML = `<span class="eyebrow">LABORATORIO</span><h3>Situazione macchine</h3><div class="bf105-machine-grid">${list().map(m => { const jobs = busy(m.id); return `<article class="bf105-machine-card ${jobs.length > 1 ? 'is-conflict' : ''}"><b>${esc(m.name)}</b><span>${jobs.length > 1 ? 'Conflitto: più lavori assegnati' : !jobs.length ? 'Disponibile' : jobs[0].countdown.finished ? 'Fine da confermare' : jobs[0].countdown.endAt ? 'In lavorazione' : 'In pausa'}</span>${jobs.map(j => `<button class="btn subtle" type="button" data-open="${esc(j.id)}">${esc(j.code)} · ${esc(j.countdown.label || j.article)}</button>`).join('')}</article>`; }).join('')}</div>`;
  }
  document.addEventListener('change', async event => {
    if (event.target.id !== 'bf105Machine') return;
    const job = db.jobs.find(j => j.id === selectedJobId); if (!job || job.countdown) return;
    const chosen = event.target.value;
    if (chosen && (!list().some(m => m.id === chosen) || busy(chosen, job.id).length)) { event.target.value = job.machineId || ''; return toast('Macchina occupata o non disponibile.', true); }
    const old = job.machineId, stamp = job.updatedAt;
    job.machineId = chosen; job.updatedAt = now();
    try { await saveAndSync('Macchina assegnata.'); } catch { job.machineId = old; job.updatedAt = stamp; event.target.value = old || ''; toast('Assegnazione non salvata.', true); }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'bf105MachineForm') return;
    event.preventDefault();
    const input = event.target.elements.name, value = input.value.trim();
    if (!value || value.length > 80) return toast('Inserisci un nome entro 80 caratteri.', true);
    if (list().some(m => m.name.toLocaleLowerCase('it') === value.toLocaleLowerCase('it'))) return toast('Esiste già una macchina con questo nome.', true);
    const machine = {id: 'machine_' + crypto.randomUUID(), name: value, createdAt: now(), updatedAt: now()};
    db.machines ||= []; db.machines.push(machine);
    try { await saveAndSync('Macchina aggiunta.'); input.value = ''; } catch { db.machines = db.machines.filter(m => m !== machine); renderMachines(); toast('Macchina non salvata.', true); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-machine-rename],[data-machine-remove]'); if (!button) return;
    const m = list().find(m => m.id === (button.dataset.machineRename || button.dataset.machineRemove)); if (!m) return;
    const old = {...m};
    if (button.dataset.machineRename) {
      const value = prompt('Nome della macchina', m.name); if (value === null) return;
      const clean = value.trim();
      if (!clean || clean.length > 80 || list().some(x => x.id !== m.id && x.name.toLocaleLowerCase('it') === clean.toLocaleLowerCase('it'))) return toast('Nome vuoto, troppo lungo o già utilizzato.', true);
      m.name = clean;
    } else {
      if (busy(m.id).length) return toast('Conferma prima la fine delle lavorazioni assegnate.', true);
      if (!confirm(`Rimuovere ${m.name} dall’elenco delle macchine?`)) return;
      m.deleted = true;
    }
    m.updatedAt = now();
    try { await saveAndSync('Elenco macchine aggiornato.'); } catch { Object.keys(m).forEach(k => delete m[k]); Object.assign(m, old); renderMachines(); toast('Modifica non salvata.', true); }
  });
  window.BadfishMachines = {list, busy, name, options, render: renderMachines};
})();
