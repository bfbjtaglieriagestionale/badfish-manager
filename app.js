const LOCAL_DB_KEY = 'badfish_manager_db_v3';
const LAST_SYNC_KEY = 'badfish_manager_last_sync';
const ACCEPTS = {
  fusion: '.f3d,.f3z',
  step: '.stp,.step',
  nc: '.nc,.tap,.cnc,.gcode,.txt',
  drawings: '.pdf,.dwg,.dxf',
  photos: 'image/*,.heic,.heif'
};

let db = loadLocal();
let selectedJobId = null;
let driveRefs = null;
let pendingUploadCategory = null;
let deferredInstallPrompt = null;
let syncing = false;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function now() { return new Date().toISOString(); }
function defaultDb() {
  return { settings: { companyName: 'Badfish Body Jewelry', schemaVersion: 3 }, jobs: [], deletedJobs: [], meta: { updatedAt: now() } };
}
function normalizeDb(value) {
  const base = defaultDb();
  return {
    ...base,
    ...(value || {}),
    settings: { ...base.settings, ...(value?.settings || {}), schemaVersion: 3 },
    jobs: Array.isArray(value?.jobs) ? value.jobs.map(j => ({ ...j, files: Array.isArray(j.files) ? j.files : [] })) : [],
    deletedJobs: Array.isArray(value?.deletedJobs) ? value.deletedJobs : [],
    meta: { ...base.meta, ...(value?.meta || {}) }
  };
}
function loadLocal() {
  try { return normalizeDb(JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || 'null')); }
  catch { return defaultDb(); }
}
function saveLocal() {
  db.meta.updatedAt = now();
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  render();
}
function dateMs(v) { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; }
function mergeDb(a, b) {
  a = normalizeDb(a); b = normalizeDb(b);
  const tomb = new Map();
  [...a.deletedJobs, ...b.deletedJobs].forEach(x => {
    const old = tomb.get(x.id);
    if (!old || dateMs(x.deletedAt) > dateMs(old.deletedAt)) tomb.set(x.id, x);
  });
  const jobs = new Map();
  [...a.jobs, ...b.jobs].forEach(j => {
    const old = jobs.get(j.id);
    if (!old || dateMs(j.updatedAt) > dateMs(old.updatedAt)) jobs.set(j.id, j);
  });
  for (const [id, del] of tomb) {
    const job = jobs.get(id);
    if (!job || dateMs(del.deletedAt) >= dateMs(job.updatedAt)) jobs.delete(id);
  }
  const newestSettings = dateMs(a.meta.updatedAt) >= dateMs(b.meta.updatedAt) ? a.settings : b.settings;
  return normalizeDb({ settings: newestSettings, jobs: [...jobs.values()].sort((x,y) => dateMs(y.updatedAt || y.createdAt) - dateMs(x.updatedAt || x.createdAt)), deletedJobs: [...tomb.values()], meta: { updatedAt: now() } });
}
function esc(value='') { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function formatDate(value) { if (!value) return '—'; return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)); }
function formatSize(bytes) { if (!bytes) return '0 KB'; const units=['B','KB','MB','GB']; let n=Number(bytes),i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${units[i]}`; }
function toast(message, error=false) { const el=$('#toast'); el.textContent=message; el.className=`toast${error?' error':''}`; clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.add('hidden'),3500); }
function statusClass(status) { if(['Completata','Consegnata'].includes(status)) return 'done'; if(['In lavorazione','Controllo qualità','Da programmare'].includes(status)) return 'working'; return ''; }
function categoryLabel(cat) { return ({fusion:'FUSION 360',step:'STEP',nc:'PROGRAMMA NC',drawings:'DISEGNO / PDF',photos:'FOTO'})[cat] || cat; }

function setSyncState(type, title, subtitle='') {
  $('#syncTitle').textContent = title;
  $('#syncSubtitle').textContent = subtitle;
  $('#syncDot').className = `status-dot ${type || ''}`;
  $('#driveStateText').textContent = title;
  const connected = BadfishDrive.isConnected();
  $('#connectDriveBtn').textContent = connected ? '☁ Drive collegato' : '☁ Collega Drive';
  $('#settingsConnectBtn').textContent = connected ? 'Ricollega Google Drive' : 'Collega Google Drive';
}

function switchView(view) {
  $$('.view').forEach(v=>v.classList.remove('active'));
  $$('.nav-item').forEach(v=>v.classList.remove('active'));
  $(`#${view}View`).classList.add('active');
  $(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  $('#pageTitle').textContent = view==='dashboard'?'Dashboard':view==='jobs'?'Commesse':'Impostazioni';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  $('#companyName').value = db.settings.companyName || 'Badfish Body Jewelry';
  $('#googleClientId').value = BadfishDrive.getClientId();
  $('#driveFolderText').textContent = window.BADFISH_CONFIG?.driveRootFolder || 'BADFISH_MANAGER';
  const last = localStorage.getItem(LAST_SYNC_KEY);
  $('#lastSyncText').textContent = last ? new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(new Date(last)) : '—';

  $('#statTotal').textContent = db.jobs.length;
  $('#statWorking').textContent = db.jobs.filter(j=>['In lavorazione','Controllo qualità'].includes(j.status)).length;
  $('#statProgramming').textContent = db.jobs.filter(j=>j.status==='Da programmare').length;
  $('#statDone').textContent = db.jobs.filter(j=>['Completata','Consegnata'].includes(j.status)).length;
  renderRecent(); renderJobs();
}

function renderRecent() {
  const jobs=db.jobs.slice(0,6);
  $('#recentJobs').innerHTML=jobs.length?`<table><thead><tr><th>CODICE</th><th>CLIENTE</th><th>ARTICOLO</th><th>STATO</th><th>CONSEGNA</th></tr></thead><tbody>${jobs.map(j=>`<tr data-open="${j.id}"><td><strong>${esc(j.code)}</strong></td><td>${esc(j.client)}</td><td>${esc(j.article)}</td><td><span class="status ${statusClass(j.status)}">${esc(j.status)}</span></td><td>${formatDate(j.dueDate)}</td></tr>`).join('')}</tbody></table>`:`<div class="empty">Nessuna commessa. Crea il primo lavoro per iniziare.</div>`;
}

function renderJobs() {
  const q=$('#jobSearch')?.value.toLowerCase().trim()||'';
  const sf=$('#statusFilter')?.value||'';
  const jobs=db.jobs.filter(j=>{ const hay=[j.code,j.client,j.article,j.material].join(' ').toLowerCase(); return (!q||hay.includes(q))&&(!sf||j.status===sf); });
  $('#jobsList').innerHTML=jobs.length?jobs.map(j=>`<article class="job-card"><div class="job-card-head"><div><div class="job-code">${esc(j.code)}</div><div class="job-client">${esc(j.client)}</div></div><span class="status ${statusClass(j.status)}">${esc(j.status)}</span></div><div class="job-article">${esc(j.article)}</div><div class="job-meta"><div><span>MATERIALE</span><strong>${esc(j.material||'—')}</strong></div><div><span>QUANTITÀ</span><strong>${esc(j.quantity||0)}</strong></div><div><span>CONSEGNA</span><strong>${formatDate(j.dueDate)}</strong></div></div><div class="job-actions"><span class="file-count">${(j.files||[]).length} file</span><button class="btn secondary" data-open="${j.id}">Apri commessa</button></div></article>`).join(''):`<div class="empty full-span">Nessuna commessa trovata.</div>`;
}

function openNewJob() { $('#modalBackdrop').classList.remove('hidden'); }
function closeNewJob() { $('#modalBackdrop').classList.add('hidden'); $('#jobForm').reset(); }

function fileButtons(f) {
  return `<button data-drive-open="${esc(f.driveFileId)}">Apri</button><button data-file-remove="${esc(f.id)}">×</button>`;
}

function openDetail(id) {
  selectedJobId=id;
  const j=db.jobs.find(x=>x.id===id); if(!j) return;
  const files=j.files||[];
  $('#detailContent').innerHTML=`<div class="detail-top"><div class="detail-title"><p class="eyebrow">COMMESSA ${esc(j.code)}</p><h2>${esc(j.article)}</h2><div class="detail-sub">${esc(j.client)} · ${esc(j.material||'Materiale non specificato')} · Q.tà ${esc(j.quantity||0)}</div></div><button class="icon-btn" id="closeDetail">×</button></div><div class="detail-grid"><div><section class="detail-section"><h4>File della commessa</h4><div class="upload-grid"><button class="upload-btn fusion-upload" data-upload="fusion"><b>+ Progetto Fusion 360</b><span>.f3d, .f3z</span></button><button class="upload-btn" data-upload="step"><b>+ File STEP</b><span>.stp, .step</span></button><button class="upload-btn" data-upload="nc"><b>+ Programma macchina</b><span>.nc, .tap, .cnc</span></button><button class="upload-btn" data-upload="drawings"><b>+ Disegni / PDF</b><span>.pdf, .dwg, .dxf</span></button><button class="upload-btn" data-upload="photos"><b>+ Fotografie</b><span>JPG, PNG, HEIC...</span></button></div><p class="upload-note">I file vengono caricati direttamente su Google Drive. Per caricare file è necessario essere online e collegati.</p></section><section class="detail-section section-gap"><h4>Archivio file</h4><div class="file-list">${files.length?files.map(f=>`<div class="file-row"><div class="file-info"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatSize(f.size)} · ${formatDate(f.addedAt)}</span></div><div class="file-actions">${fileButtons(f)}</div></div>`).join(''):`<div class="empty">Non sono ancora stati caricati file.</div>`}</div></section></div><div><section class="detail-section"><h4>Stato lavorazione</h4><label>Stato<select id="detailStatus">${['Da progettare','Progettazione','Da programmare','In lavorazione','Controllo qualità','Completata','Consegnata'].map(s=>`<option ${s===j.status?'selected':''}>${s}</option>`).join('')}</select></label><label>Data consegna<input id="detailDueDate" type="date" value="${esc(j.dueDate||'')}"></label><label>Note<textarea id="detailNotes" rows="7">${esc(j.notes||'')}</textarea></label><button id="saveDetailBtn" class="btn primary wide">Salva modifiche</button></section><section class="detail-section section-gap"><h4>Google Drive</h4><div class="path-box">${j.driveFolderId ? 'Cartella cloud collegata' : 'La cartella Drive verrà creata alla prima sincronizzazione o al primo upload.'}</div>${j.driveFolderId?`<button id="openDriveFolderBtn" class="btn secondary wide">Apri cartella su Drive</button>`:''}</section><button id="deleteJobBtn" class="btn danger wide delete-gap">Elimina dal gestionale</button></div></div>`;
  $('#detailBackdrop').classList.remove('hidden');
}

async function ensureConnected() {
  if (BadfishDrive.isConnected()) return true;
  await connectDrive();
  return BadfishDrive.isConnected();
}

async function connectDrive() {
  try {
    setSyncState('syncing','Connessione a Drive…','Autorizzazione Google');
    await BadfishDrive.connect();
    await syncDrive(true);
  } catch (err) {
    setSyncState('','Drive non collegato','Cache locale disponibile');
    toast(err.message,true);
    throw err;
  }
}

async function syncDrive(showToast=false) {
  if (syncing) return;
  if (!BadfishDrive.isConnected()) { if(showToast) toast('Collega prima Google Drive.',true); return; }
  syncing=true;
  try {
    setSyncState('syncing','Sincronizzazione…','Google Drive');
    driveRefs = await BadfishDrive.ensureRootStructure();
    const remote = normalizeDb(await BadfishDrive.downloadJson(driveRefs.dbFile.id));
    db = mergeDb(db, remote);

    for (const job of db.jobs) {
      if (!job.driveFolderId) {
        const folders = await BadfishDrive.ensureJobStructure(job, driveRefs.jobs.id);
        job.driveFolderId = folders.jobFolder.id;
        job.driveFolderUrl = BadfishDrive.folderUrl(folders.jobFolder.id);
        job.updatedAt = now();
      }
    }

    db.meta.updatedAt = now();
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
    await BadfishDrive.updateMedia(driveRefs.dbFile.id, new Blob([JSON.stringify(db,null,2)],{type:'application/json'}), 'application/json');
    const stamp=now(); localStorage.setItem(LAST_SYNC_KEY,stamp);
    render();
    setSyncState('ok','Drive sincronizzato',new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(stamp)));
    if(showToast) toast('Google Drive sincronizzato.');
  } catch(err) {
    setSyncState('error','Errore sincronizzazione','Dati locali conservati');
    if(showToast) toast(err.message,true);
    throw err;
  } finally { syncing=false; }
}

async function saveAndSync(message='Salvato.') {
  saveLocal();
  if (BadfishDrive.isConnected() && navigator.onLine) {
    try { await syncDrive(false); toast(message); }
    catch { toast(`${message} Sync Drive da riprovare.`,true); }
  } else toast(`${message} Salvato nella cache locale.`);
}

async function uploadFiles(files, category) {
  if (!files.length) return;
  if (!navigator.onLine) throw new Error('Per caricare file su Drive devi essere online.');
  await ensureConnected();
  if (!driveRefs) driveRefs = await BadfishDrive.ensureRootStructure();
  const job=db.jobs.find(j=>j.id===selectedJobId); if(!job) throw new Error('Commessa non trovata.');
  const folders=await BadfishDrive.ensureJobStructure(job,driveRefs.jobs.id);
  job.driveFolderId=folders.jobFolder.id;
  job.driveFolderUrl=BadfishDrive.folderUrl(folders.jobFolder.id);

  let count=0;
  for (const file of files) {
    setSyncState('syncing',`Caricamento ${count+1}/${files.length}…`,file.name);
    const uploaded=await BadfishDrive.uploadJobFile(file,category,folders);
    job.files.push({
      id:`file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      driveFileId:uploaded.id,
      name:uploaded.name||file.name,
      category,
      size:Number(uploaded.size||file.size||0),
      mimeType:uploaded.mimeType||file.type||'',
      addedAt:now()
    });
    count++;
  }
  job.updatedAt=now();
  await saveAndSync(`${count} file caricati.`);
  openDetail(job.id);
}

function initEvents() {
  document.addEventListener('click',async e=>{
    const nav=e.target.closest('[data-view]'); if(nav) switchView(nav.dataset.view);
    const go=e.target.closest('[data-go]'); if(go) switchView(go.dataset.go);
    const open=e.target.closest('[data-open]'); if(open) openDetail(open.dataset.open);

    const upload=e.target.closest('[data-upload]');
    if(upload){
      try {
        await ensureConnected();
        pendingUploadCategory=upload.dataset.upload;
        const input=$('#hiddenFileInput'); input.accept=ACCEPTS[pendingUploadCategory]||''; input.value=''; input.click();
      } catch {}
    }

    const driveOpen=e.target.closest('[data-drive-open]');
    if(driveOpen){ window.open(BadfishDrive.driveFileUrl(driveOpen.dataset.driveOpen),'_blank','noopener'); }

    const remove=e.target.closest('[data-file-remove]');
    if(remove){
      const job=db.jobs.find(j=>j.id===selectedJobId); const file=job?.files.find(f=>f.id===remove.dataset.fileRemove); if(!job||!file)return;
      if(!confirm(`Rimuovere ${file.name}? Il file verrà eliminato anche da Google Drive.`))return;
      try {
        if(file.driveFileId){ await ensureConnected(); await BadfishDrive.deleteFile(file.driveFileId); }
        job.files=job.files.filter(f=>f.id!==file.id); job.updatedAt=now(); await saveAndSync('File eliminato.'); openDetail(job.id);
      }catch(err){toast(err.message,true)}
    }
  });

  $('#hiddenFileInput').addEventListener('change',async e=>{
    try { await uploadFiles([...e.target.files],pendingUploadCategory); }
    catch(err){toast(err.message,true)}
  });

  $('#newJobBtn').addEventListener('click',openNewJob);
  $('#closeModalBtn').addEventListener('click',closeNewJob);
  $('#cancelModalBtn').addEventListener('click',closeNewJob);
  $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeNewJob()});
  $('#detailBackdrop').addEventListener('click',e=>{if(e.target.id==='detailBackdrop')e.currentTarget.classList.add('hidden')});
  $('#jobSearch').addEventListener('input',renderJobs);
  $('#statusFilter').addEventListener('change',renderJobs);

  $('#jobForm').addEventListener('submit',async e=>{
    e.preventDefault(); const payload=Object.fromEntries(new FormData(e.currentTarget).entries());
    if(db.jobs.some(j=>j.code.toLowerCase()===String(payload.code).trim().toLowerCase())) return toast('Esiste già una commessa con questo codice.',true);
    const job={ id:`job_${Date.now()}_${Math.random().toString(16).slice(2)}`, code:String(payload.code).trim(), client:String(payload.client).trim(), article:String(payload.article).trim(), material:String(payload.material||'').trim(), quantity:Number(payload.quantity||0), dueDate:payload.dueDate||'', status:payload.status||'Da progettare', notes:payload.notes||'', createdAt:now(), updatedAt:now(), files:[] };
    db.jobs.unshift(job); closeNewJob(); await saveAndSync('Commessa creata.'); openDetail(job.id);
  });

  $('#connectDriveBtn').addEventListener('click',()=>connectDrive().catch(()=>{}));
  $('#settingsConnectBtn').addEventListener('click',()=>connectDrive().catch(()=>{}));
  $('#syncBtn').addEventListener('click',async()=>{try{await ensureConnected();await syncDrive(true)}catch{}});
  $('#disconnectDriveBtn').addEventListener('click',()=>{BadfishDrive.clearToken();driveRefs=null;setSyncState('','Drive non collegato','Cache locale disponibile');toast('Drive disconnesso da questa sessione.');});
  $('#saveClientIdBtn').addEventListener('click',()=>{BadfishDrive.setClientId($('#googleClientId').value); BadfishDrive.clearToken(); driveRefs=null; setSyncState('','Drive non collegato','Client ID salvato'); toast('Client ID salvato su questo dispositivo.');});
  $('#saveSettingsBtn').addEventListener('click',async()=>{db.settings.companyName=$('#companyName').value.trim()||'Badfish Body Jewelry';await saveAndSync('Impostazioni salvate.');});

  document.addEventListener('click',async e=>{
    if(e.target.id==='closeDetail') $('#detailBackdrop').classList.add('hidden');
    if(e.target.id==='openDriveFolderBtn'){
      const job=db.jobs.find(j=>j.id===selectedJobId); if(job?.driveFolderId) window.open(BadfishDrive.folderUrl(job.driveFolderId),'_blank','noopener');
    }
    if(e.target.id==='saveDetailBtn'){
      const job=db.jobs.find(j=>j.id===selectedJobId); if(!job)return;
      job.status=$('#detailStatus').value; job.dueDate=$('#detailDueDate').value; job.notes=$('#detailNotes').value; job.updatedAt=now(); await saveAndSync('Commessa aggiornata.'); openDetail(job.id);
    }
    if(e.target.id==='deleteJobBtn'){
      const job=db.jobs.find(j=>j.id===selectedJobId); if(!job)return;
      if(!confirm(`Eliminare ${job.code} dal gestionale? I file Drive non verranno cancellati.`))return;
      db.jobs=db.jobs.filter(j=>j.id!==job.id); db.deletedJobs.push({id:job.id,deletedAt:now()}); $('#detailBackdrop').classList.add('hidden'); selectedJobId=null; await saveAndSync('Commessa rimossa dal gestionale.');
    }
  });

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installPwaBtn').classList.remove('hidden');});
  $('#installPwaBtn').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installPwaBtn').classList.add('hidden');});
  window.addEventListener('online',()=>{ if(BadfishDrive.isConnected()) syncDrive(false).catch(()=>{}); });
}

if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

render(); initEvents();
setSyncState('','Drive non collegato',navigator.onLine?'Pronto per la connessione':'Modalità offline');
