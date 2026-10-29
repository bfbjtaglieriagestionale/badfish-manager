/* Preparazione pura del recupero: nessuna scrittura o connessione. */
(function(root) {
  'use strict';
  const sections = ['jobs', 'clients', 'quotes', 'tasks', 'notes', 'machines'];
  const clone = v => JSON.parse(JSON.stringify(v));
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  function validate(payload) {
    if (!object(payload) || payload.backupFormat !== 'badfish-db-backup-v1' || !object(payload.database)) throw Error('Il file non è un backup Badfish riconosciuto.');
    const source = payload.database;
    if (!object(source.settings) || !Array.isArray(source.deletedJobs)) throw Error('Impostazioni o elenco eliminazioni mancanti.');
    const walk = value => { if (!value || typeof value !== 'object') return; for (const key of Object.keys(value)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Il file contiene proprietà non ammesse.'); walk(value[key]); } };
    walk(source);
    if (source.deletedJobs.some(e => !object(e) || typeof e.id !== 'string')) throw Error('Elenco eliminazioni non valido.');
    for (const key of sections) {
      if (key === 'machines' && source[key] == null) continue;
      if (!Array.isArray(source[key])) throw Error('Sezione non valida: ' + key);
      const ids = new Set();
      for (const entry of source[key]) {
        if (!object(entry) || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 200 || ids.has(entry.id)) throw Error('Identificativi mancanti o duplicati nella sezione ' + key + '.');
        ids.add(entry.id);
        if (key === 'jobs' && (!Array.isArray(entry.files) || typeof entry.code !== 'string' || typeof entry.article !== 'string')) throw Error('Commessa incompleta: ' + entry.id);
        if (key === 'jobs' && entry.workSessions != null && !Array.isArray(entry.workSessions)) throw Error('Registro ore non valido.');
        if (key === 'jobs') {
          for (const field of ['files','workSessions','rawPieces']) {
            if (entry[field] != null && (!Array.isArray(entry[field]) || entry[field].some(v => !object(v)))) throw Error('Dati non validi nella commessa: ' + field);
          }
          for (const piece of entry.rawPieces || []) if (piece.fusionSetups != null && (!Array.isArray(piece.fusionSetups) || piece.fusionSetups.some(v => !object(v)))) throw Error('Setup Fusion non validi.');
        }
        if (key === 'quotes' && (!Array.isArray(entry.items) || entry.items.some(v => !object(v)))) throw Error('Voci del preventivo non valide.');
        if (key === 'machines' && (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 80)) throw Error('Nome macchina non valido.');
      }
    }
    return Object.fromEntries(sections.map(k => [k, (source[k] || []).filter(e => !e.deleted).length]));
  }
  function plan(current, payload, overwrite, stamp) {
    validate(payload);
    const next = clone(current), counts = {};
    const recovered = new Set();
    const deleted = new Set(payload.database.deletedJobs.map(e => e.id));
    for (const key of sections) {
      next[key] ||= [];
      const existing = new Map(next[key].map(e => [e.id, e]));
      const count = counts[key] = {added: 0, updated: 0, skipped: 0};
      for (const source of payload.database[key] || []) {
        if (source.deleted || (key === 'jobs' && deleted.has(source.id))) continue;
        const old = existing.get(source.id);
        if (old && !overwrite) { count.skipped++; continue; }
        if (key === 'jobs' && next.jobs.some(j => j.id !== source.id && String(j.code || '').trim().toLowerCase() === source.code.trim().toLowerCase())) throw Error('Il codice commessa ' + source.code + ' è già usato da un altro elemento: rinominalo prima del recupero.');
        const copy = clone(source);
        if (key === 'jobs') {
          // Recuperiamo le sessioni concluse; un vecchio timer non riparte dopo il recupero.
          delete copy.countdown; delete copy.timerStartedAt;
          copy.timerAccumulatedSeconds = 0;
          recovered.add(copy.id);
        }
        copy.updatedAt = stamp;
        if (old) { next[key][next[key].findIndex(e => e.id === copy.id)] = copy; count.updated++; }
        else { next[key].push(copy); count.added++; }
      }
    }
    next.deletedJobs = (next.deletedJobs || []).filter(e => !recovered.has(e.id));
    next.meta = {...next.meta, updatedAt: stamp};
    return {next, counts};
  }
  const api = {validate, plan, sections};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BadfishBackupCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
