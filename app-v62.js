const LOCAL_DB_KEY = 'badfish_manager_db_v3';
const LAST_SYNC_KEY = 'badfish_manager_last_sync';
const GOOGLE_EMAIL_KEY = 'badfish_google_email_v1';
const ACCEPTS = {
  fusion: '.f3d,.f3z', step: '.stp,.step', nc: '.nc,.tap,.cnc,.gcode,.txt',
  drawings: '.pdf,.dwg,.dxf', photos: 'image/*,.heic,.heif'
};
const STATUSES = ['Da progettare','Progettazione','Da programmare','In lavorazione','Controllo qualità','Completata','Consegnata'];
const CATEGORY_LABELS = {fusion:'Fusion 360',step:'STEP',nc:'Programma NC',drawings:'Disegno / PDF',photos:'Foto'};
const CATEGORY_SHORT = {fusion:'FUSION',step:'STEP',nc:'NC',drawings:'PDF',photos:'FOTO'};

let db = loadLocal();
let selectedJobId = null;
let driveRefs = null;
let pendingUploadCategory = null;
let deferredInstallPrompt = null;
let syncing = false;
let sessionGoogleEmail = '';
let currentView = 'dashboard';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function now(){ return new Date().toISOString(); }
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function defaultDb(){
  return {settings:{companyName:'Badfish Body Jewelry',schemaVersion:6,googleAccountEmail:'',rememberGoogleAccount:true},jobs:[],deletedJobs:[],meta:{updatedAt:now()}};
}
function normalizeDb(value){
  const base=defaultDb();
  return {...base,...(value||{}),settings:{...base.settings,...(value?.settings||{}),schemaVersion:6},jobs:Array.isArray(value?.jobs)?value.jobs.map(j=>({...j,files:Array.isArray(j.files)?j.files:[]})):[],deletedJobs:Array.isArray(value?.deletedJobs)?value.deletedJobs:[],meta:{...base.meta,...(value?.meta||{})}};
}
function loadLocal(){try{return normalizeDb(JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'null'));}catch{return defaultDb();}}
function persistLocal({renderNow=true}={}){db.meta.updatedAt=now();localStorage.setItem(LOCAL_DB_KEY,JSON.stringify(db));if(renderNow)render();}
function dateMs(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0;}
function mergeDb(a,b){
  a=normalizeDb(a);b=normalizeDb(b);
  const tomb=new Map();[...a.deletedJobs,...b.deletedJobs].forEach(x=>{const old=tomb.get(x.id);if(!old||dateMs(x.deletedAt)>dateMs(old.deletedAt))tomb.set(x.id,x);});
  const jobs=new Map();[...a.jobs,...b.jobs].forEach(j=>{const old=jobs.get(j.id);if(!old||dateMs(j.updatedAt)>dateMs(old.updatedAt))jobs.set(j.id,j);});
  for(const[id,del]of tomb){const job=jobs.get(id);if(!job||dateMs(del.deletedAt)>=dateMs(job.updatedAt))jobs.delete(id);}
  const settings=dateMs(a.meta.updatedAt)>=dateMs(b.meta.updatedAt)?a.settings:b.settings;
  return normalizeDb({settings,jobs:[...jobs.values()].sort((x,y)=>dateMs(y.updatedAt||y.createdAt)-dateMs(x.updatedAt||x.createdAt)),deletedJobs:[...tomb.values()],meta:{updatedAt:now()}});
}
function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function formatDate(value){if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);}
function formatDateTime(value){if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(d);}
function formatSize(bytes){if(!bytes)return '0 KB';const units=['B','KB','MB','GB'];let n=Number(bytes),i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=`toast${error?' error':''}`;clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.add('hidden'),3600);}
function statusClass(status){if(['Completata','Consegnata'].includes(status))return'done';if(['In lavorazione','Controllo qualità','Da programmare'].includes(status))return'working';return'';}
function isOverdue(job){if(!job.dueDate||['Completata','Consegnata'].includes(job.status))return false;const end=new Date(`${job.dueDate}T23:59:59`);return end.getTime()<Date.now();}
function categoryLabel(cat){return CATEGORY_LABELS[cat]||cat;}
function normalizeEmail(value=''){return String(value||'').trim().toLowerCase();}
function getPreferredGoogleEmail(){return normalizeEmail(sessionGoogleEmail||localStorage.getItem(GOOGLE_EMAIL_KEY)||db.settings.googleAccountEmail||'');}
function isGoogleEmailRemembered(){return Boolean(localStorage.getItem(GOOGLE_EMAIL_KEY));}
function setPreferredGoogleEmail(email,remember=true){
  const clean=normalizeEmail(email);if(!clean||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))throw new Error('Inserisci un indirizzo email Google valido.');
  sessionGoogleEmail=clean;
  if(remember){localStorage.setItem(GOOGLE_EMAIL_KEY,clean);db.settings.googleAccountEmail=clean;db.settings.rememberGoogleAccount=true;}
  else{localStorage.removeItem(GOOGLE_EMAIL_KEY);db.settings.googleAccountEmail='';db.settings.rememberGoogleAccount=false;}
  persistLocal();return clean;
}
function clearPreferredGoogleEmail(){sessionGoogleEmail='';localStorage.removeItem(GOOGLE_EMAIL_KEY);db.settings.googleAccountEmail='';db.settings.rememberGoogleAccount=false;BadfishDrive.clearToken();driveRefs=null;persistLocal();}
function showGoogleEmailSetup(){const email=getPreferredGoogleEmail();$('#googleAccountEmail').value=email;$('#rememberGoogleEmail').checked=true;$('#accountSetupText').textContent=email?'Modifica l’account Google che Badfish deve usare come archivio Drive.':'Inserisci l’account Google dedicato alla web app. Lo salvi una volta e Badfish lo userà come account preferito per Drive.';$('#accountSetupBackdrop').classList.remove('hidden');setTimeout(()=>$('#googleAccountEmail')?.focus(),80);}
function hideGoogleEmailSetup(){$('#accountSetupBackdrop').classList.add('hidden');}
function accountInitial(email){const raw=(email||db.settings.companyName||'B').trim();return(raw[0]||'B').toUpperCase();}

function setSyncState(type,title,subtitle=''){
  $('#syncTitle').textContent=title;$('#syncSubtitle').textContent=subtitle;$('#syncDot').className=`status-dot ${type||''}`;
  $$('.drive-chip .status-dot').forEach(x=>x.className=`status-dot ${type||''}`);$('#driveOverviewDot').className=`status-dot ${type||''}`;
  $('#driveStateText').textContent=title;$('#driveOverviewTitle').textContent=title;
  const connected=BadfishDrive.isConnected();$('#connectDriveBtn').classList.toggle('connected',connected);$('.drive-chip-text').textContent=connected?'Drive OK':'Drive';
  $('#settingsConnectBtn').innerHTML=connected?`${icon('refresh')} Ricollega Drive`:`${icon('cloud')} Collega Drive`;
  $('#dashboardDriveAction').innerHTML=connected?`${icon('refresh')} Sincronizza ora`:`${icon('cloud')} Collega Drive`;
  const user=BadfishDrive.getCurrentUser?.();const preferred=getPreferredGoogleEmail();const email=user?.emailAddress||preferred||'';
  $('#driveAccountText').textContent=email||'—';$('#driveOverviewEmail').textContent=email||'Configura l’account Badfish';$('#savedGoogleEmailText').textContent=preferred||'—';$('#preferredGoogleEmail').value=preferred;$('#accountInitial').textContent=accountInitial(email);
}

function switchView(view){
  currentView=view;
  $$('.view').forEach(v=>v.classList.remove('active'));$$('[data-view]').forEach(v=>v.classList.remove('active'));
  $(`#${view}View`)?.classList.add('active');$$(`[data-view="${view}"]`).forEach(v=>v.classList.add('active'));
  const titles={dashboard:['PANORAMICA','Dashboard'],jobs:['PRODUZIONE','Commesse'],files:['ARCHIVIO','File'],settings:['PREFERENZE','Impostazioni']};
  $('#pageKicker').textContent=titles[view]?.[0]||'';$('#pageTitle').textContent=titles[view]?.[1]||'Badfish';
  if(view==='files')renderFiles();if(view==='jobs')renderJobs();window.scrollTo({top:0,behavior:'smooth'});
}

function render(){
  $('#companyName').value=db.settings.companyName||'Badfish Body Jewelry';$('#googleClientId').value=BadfishDrive.getClientId();$('#driveFolderText').textContent=window.BADFISH_CONFIG?.driveRootFolder||'BADFISH_MANAGER';
  const preferred=getPreferredGoogleEmail();$('#preferredGoogleEmail').value=preferred;$('#savedGoogleEmailText').textContent=preferred||'—';$('#accountInitial').textContent=accountInitial(BadfishDrive.getCurrentUser?.()?.emailAddress||preferred);
  const last=localStorage.getItem(LAST_SYNC_KEY);$('#lastSyncText').textContent=last?formatDateTime(last):'—';
  $('#statTotal').textContent=db.jobs.length;$('#statWorking').textContent=db.jobs.filter(j=>['In lavorazione','Controllo qualità'].includes(j.status)).length;$('#statProgramming').textContent=db.jobs.filter(j=>j.status==='Da programmare').length;$('#statDone').textContent=db.jobs.filter(j=>['Completata','Consegnata'].includes(j.status)).length;$('#navJobsCount').textContent=db.jobs.length;
  renderRecent();renderJobs();renderFiles();
}

function fileCategories(job){const set=new Set((job.files||[]).map(f=>f.category));return Object.keys(CATEGORY_LABELS).map(cat=>`<span class="file-pill ${set.has(cat)?'has':''}">${CATEGORY_SHORT[cat]}</span>`).join('');}
function renderRecent(){
  const jobs=[...db.jobs].sort((a,b)=>dateMs(b.updatedAt||b.createdAt)-dateMs(a.updatedAt||a.createdAt)).slice(0,6);
  $('#recentJobs').innerHTML=jobs.length?jobs.map(j=>`<button class="recent-row" data-open="${esc(j.id)}"><span class="recent-code"><strong>${esc(j.code)}</strong><span>${esc(j.client)}</span></span><span class="recent-main"><b>${esc(j.article)}</b><span>Agg. ${formatDate(j.updatedAt||j.createdAt)}</span></span><span class="status ${statusClass(j.status)} ${isOverdue(j)?'overdue':''}">${isOverdue(j)?'In ritardo':esc(j.status)}</span><span class="recent-open">${icon('chevron')}</span></button>`).join(''):`<div class="empty">Nessuna commessa. Crea il primo lavoro per iniziare.</div>`;
}
function renderJobs(){
  const q=($('#jobSearch')?.value||'').toLowerCase().trim(),sf=$('#statusFilter')?.value||'';
  const jobs=db.jobs.filter(j=>{const hay=[j.code,j.client,j.article,j.material,j.notes].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!sf||j.status===sf);});
  $('#jobsList').innerHTML=jobs.length?jobs.map(j=>`<article class="job-card" data-open="${esc(j.id)}"><div class="job-card-head"><div><div class="job-code">${esc(j.code)}</div><div class="job-client">${esc(j.client)}</div></div><span class="status ${statusClass(j.status)} ${isOverdue(j)?'overdue':''}">${isOverdue(j)?'In ritardo':esc(j.status)}</span></div><div class="job-article">${esc(j.article)}</div><div class="job-meta"><div><span>Materiale</span><strong>${esc(j.material||'—')}</strong></div><div><span>Q.tà</span><strong>${esc(j.quantity||0)}</strong></div><div><span>Consegna</span><strong>${formatDate(j.dueDate)}</strong></div></div><div class="job-file-strip">${fileCategories(j)}</div><div class="job-actions"><span class="file-count">${(j.files||[]).length} ${(j.files||[]).length===1?'file':'file'}</span><span class="open-link">Apri ${icon('chevron')}</span></div></article>`).join(''):`<div class="empty full-span">Nessuna commessa trovata.</div>`;
}
function allFiles(){return db.jobs.flatMap(job=>(job.files||[]).map(file=>({...file,jobId:job.id,jobCode:job.code,jobArticle:job.article,jobClient:job.client}))).sort((a,b)=>dateMs(b.addedAt)-dateMs(a.addedAt));}
function renderFiles(){
  const files=allFiles(),counts={fusion:0,step:0,nc:0,drawings:0,photos:0};files.forEach(f=>{if(counts[f.category]!=null)counts[f.category]++;});
  $('#fileStats').innerHTML=Object.entries(counts).map(([k,n])=>`<div class="file-stat"><span>${CATEGORY_LABELS[k]}</span><strong>${n}</strong></div>`).join('');
  const q=($('#fileSearch')?.value||'').toLowerCase().trim(),cat=$('#fileCategoryFilter')?.value||'';
  const filtered=files.filter(f=>(!cat||f.category===cat)&&(!q||[f.name,f.jobCode,f.jobArticle,f.jobClient].join(' ').toLowerCase().includes(q)));
  $('#allFilesList').innerHTML=filtered.length?filtered.map(f=>`<div class="archive-row"><div class="archive-icon">${esc(CATEGORY_SHORT[f.category]||'FILE')}</div><div class="archive-name"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatDate(f.addedAt)}</span></div><button class="archive-job" data-open="${esc(f.jobId)}"><strong>${esc(f.jobCode)}</strong><span>${esc(f.jobArticle)}</span></button><div class="archive-size">${formatSize(f.size)}</div><button class="archive-open" data-drive-open="${esc(f.driveFileId||'')}" aria-label="Apri su Drive">${icon('external')}</button></div>`).join(''):`<div class="empty">Nessun file trovato nell'archivio.</div>`;
}

function openNewJob(){const form=$('#jobForm');form.reset();form.elements.quantity.value=1;$('#modalBackdrop').classList.remove('hidden');setTimeout(()=>form.elements.code?.focus(),100);}
function closeNewJob(){$('#modalBackdrop').classList.add('hidden');}
function fileButtons(f){return `<button data-drive-open="${esc(f.driveFileId||'')}">Apri Drive</button><button data-file-remove="${esc(f.id)}" aria-label="Elimina file">×</button>`;}
function openDetail(id){
  selectedJobId=id;const j=db.jobs.find(x=>x.id===id);if(!j)return;const files=j.files||[];
  $('#detailContent').innerHTML=`<div class="detail-shell"><div class="detail-top"><div class="detail-title"><span class="eyebrow">COMMESSA ${esc(j.code)}</span><h2>${esc(j.article)}</h2><div class="detail-sub">${esc(j.client)} · ${esc(j.material||'Materiale non specificato')}</div></div><button class="icon-btn" id="closeDetail">${icon('x')}</button></div><div class="detail-summary"><div><span>Stato</span><strong>${esc(j.status)}</strong></div><div><span>Quantità</span><strong>${esc(j.quantity||0)}</strong></div><div><span>Consegna</span><strong>${formatDate(j.dueDate)}</strong></div><div><span>File</span><strong>${files.length}</strong></div></div><div class="detail-grid"><div><section class="detail-section"><h4>Carica file</h4><div class="upload-grid"><button class="upload-btn fusion-upload" data-upload="fusion"><b>+ Progetto Fusion 360</b><span>.f3d, .f3z · versione precedente archiviata</span></button><button class="upload-btn" data-upload="step"><b>+ File STEP</b><span>.stp, .step</span></button><button class="upload-btn" data-upload="nc"><b>+ Programma NC</b><span>.nc, .tap, .cnc</span></button><button class="upload-btn" data-upload="drawings"><b>+ Disegni / PDF</b><span>.pdf, .dwg, .dxf</span></button><button class="upload-btn" data-upload="photos"><b>+ Fotografie</b><span>JPG, PNG, HEIC...</span></button></div><p class="upload-note">I file vengono caricati direttamente nel Google Drive Badfish.</p></section><section class="detail-section"><h4>Archivio della commessa</h4><div class="file-list">${files.length?files.map(f=>`<div class="file-row"><div class="file-info"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatSize(f.size)} · ${formatDate(f.addedAt)}</span></div><div class="file-actions">${fileButtons(f)}</div></div>`).join(''):`<div class="empty">Non sono ancora stati caricati file.</div>`}</div></section></div><div><section class="detail-section"><h4>Lavorazione</h4><label class="field-label">Stato<select id="detailStatus">${STATUSES.map(s=>`<option ${s===j.status?'selected':''}>${s}</option>`).join('')}</select></label><label class="field-label">Data consegna<input id="detailDueDate" type="date" value="${esc(j.dueDate||'')}"></label><label class="field-label">Note<textarea id="detailNotes" rows="7">${esc(j.notes||'')}</textarea></label><button id="saveDetailBtn" class="btn primary wide">Salva modifiche</button></section><section class="detail-section"><h4>Google Drive</h4><div class="path-box">${j.driveFolderId?'La cartella cloud della commessa è collegata.':'La cartella verrà creata alla prima sincronizzazione o al primo upload.'}</div>${j.driveFolderId?`<button id="openDriveFolderBtn" class="btn subtle wide">${icon('external')} Apri cartella Drive</button>`:''}</section><button id="deleteJobBtn" class="btn danger wide delete-gap">${icon('trash')} Elimina dal gestionale</button></div></div></div>`;
  $('#detailBackdrop').classList.remove('hidden');
}
function closeDetail(){$('#detailBackdrop').classList.add('hidden');selectedJobId=null;}

async function ensureConnected(){if(BadfishDrive.isConnected())return true;const email=getPreferredGoogleEmail();if(!email){showGoogleEmailSetup();throw new Error('Configura prima l’email Google Badfish.');}const ok=await connectDrive({email,silent:false});if(!ok)throw new Error('Google Drive non è collegato.');return true;}
async function connectDrive({email='',silent=false}={}){
  const preferred=normalizeEmail(email||getPreferredGoogleEmail());if(!preferred){showGoogleEmailSetup();if(!silent)toast('Inserisci prima l’email Google dedicata a Badfish.',true);return false;}
  if(!navigator.onLine){if(!silent)toast('Sei offline. I dati locali restano disponibili.',true);return false;}
  try{
    setSyncState('syncing','Connessione a Drive…',preferred);
    const connection=await BadfishDrive.connect({email:preferred,prompt:''});const actual=normalizeEmail(connection?.user?.emailAddress||'');if(actual&&actual!==preferred)throw new Error(`Account Google errato: ${actual}. Badfish è configurato per ${preferred}.`);
    if(isGoogleEmailRemembered()){db.settings.googleAccountEmail=preferred;db.settings.rememberGoogleAccount=true;persistLocal({renderNow:false});}
    await syncDrive(!silent);return true;
  }catch(err){setSyncState('','Drive non collegato',`Account salvato: ${preferred}`);if(!silent)toast(err.message,true);return false;}
}
async function syncDrive(showToast=false){
  if(syncing)return;if(!BadfishDrive.isConnected()){if(showToast)toast('Collega prima Google Drive.',true);return;}syncing=true;
  try{
    setSyncState('syncing','Sincronizzazione…','Google Drive');driveRefs=await BadfishDrive.ensureRootStructure();const remote=normalizeDb(await BadfishDrive.downloadJson(driveRefs.dbFile.id));db=mergeDb(db,remote);const preferred=getPreferredGoogleEmail();if(preferred&&isGoogleEmailRemembered()){db.settings.googleAccountEmail=preferred;db.settings.rememberGoogleAccount=true;}
    for(const job of db.jobs){if(!job.driveFolderId){const folders=await BadfishDrive.ensureJobStructure(job,driveRefs.jobs.id);job.driveFolderId=folders.jobFolder.id;job.driveFolderUrl=BadfishDrive.folderUrl(folders.jobFolder.id);job.updatedAt=now();}}
    db.meta.updatedAt=now();localStorage.setItem(LOCAL_DB_KEY,JSON.stringify(db));await BadfishDrive.updateMedia(driveRefs.dbFile.id,new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),'application/json');const stamp=now();localStorage.setItem(LAST_SYNC_KEY,stamp);render();setSyncState('ok','Drive sincronizzato',new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(stamp)));if(showToast)toast('Google Drive sincronizzato.');
  }catch(err){setSyncState('error','Errore sincronizzazione','Dati locali conservati');if(showToast)toast(err.message,true);throw err;}finally{syncing=false;}
}
async function saveAndSync(message='Salvato.'){
  persistLocal();if(BadfishDrive.isConnected()&&navigator.onLine){try{await syncDrive(false);toast(message);}catch{toast(`${message} Sincronizzazione Drive da riprovare.`,true);}}else toast(`${message} Salvato sul dispositivo.`);
}
async function uploadFiles(files,category){
  if(!files.length)return;if(!navigator.onLine)throw new Error('Per caricare file su Drive devi essere online.');await ensureConnected();if(!driveRefs)driveRefs=await BadfishDrive.ensureRootStructure();const job=db.jobs.find(j=>j.id===selectedJobId);if(!job)throw new Error('Commessa non trovata.');const folders=await BadfishDrive.ensureJobStructure(job,driveRefs.jobs.id);job.driveFolderId=folders.jobFolder.id;job.driveFolderUrl=BadfishDrive.folderUrl(folders.jobFolder.id);
  let count=0;for(const file of files){setSyncState('syncing',`Caricamento ${count+1}/${files.length}…`,file.name);const uploaded=await BadfishDrive.uploadJobFile(file,category,folders);job.files.push({id:`file_${Date.now()}_${Math.random().toString(16).slice(2)}`,driveFileId:uploaded.id,name:uploaded.name||file.name,category,size:Number(uploaded.size||file.size||0),mimeType:uploaded.mimeType||file.type||'',addedAt:now()});count++;}
  job.updatedAt=now();await saveAndSync(`${count} file caricati.`);openDetail(job.id);
}

function initEvents(){
  document.addEventListener('click',async e=>{
    const create=e.target.closest('[data-create-job]');if(create){openNewJob();return;}
    const nav=e.target.closest('[data-view]');if(nav){switchView(nav.dataset.view);return;}
    const open=e.target.closest('[data-open]');if(open){openDetail(open.dataset.open);return;}
    const upload=e.target.closest('[data-upload]');if(upload){try{await ensureConnected();pendingUploadCategory=upload.dataset.upload;const input=$('#hiddenFileInput');input.accept=ACCEPTS[pendingUploadCategory]||'';input.value='';input.click();}catch{}return;}
    const driveOpen=e.target.closest('[data-drive-open]');if(driveOpen){const id=driveOpen.dataset.driveOpen;if(id)window.open(BadfishDrive.driveFileUrl(id),'_blank','noopener');return;}
    const remove=e.target.closest('[data-file-remove]');if(remove){const job=db.jobs.find(j=>j.id===selectedJobId),file=job?.files.find(f=>f.id===remove.dataset.fileRemove);if(!job||!file)return;if(!confirm(`Rimuovere ${file.name}? Il file verrà eliminato anche da Google Drive.`))return;try{if(file.driveFileId){await ensureConnected();await BadfishDrive.deleteFile(file.driveFileId);}job.files=job.files.filter(f=>f.id!==file.id);job.updatedAt=now();await saveAndSync('File eliminato.');openDetail(job.id);}catch(err){toast(err.message,true);}return;}
  });
  $('#hiddenFileInput').addEventListener('change',async e=>{try{await uploadFiles([...e.target.files],pendingUploadCategory);}catch(err){toast(err.message,true);}});
  $('#newJobBtn').addEventListener('click',openNewJob);$('#closeModalBtn').addEventListener('click',closeNewJob);$('#cancelModalBtn').addEventListener('click',closeNewJob);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeNewJob();});$('#detailBackdrop').addEventListener('click',e=>{if(e.target.id==='detailBackdrop')closeDetail();});
  $('#jobSearch').addEventListener('input',renderJobs);$('#statusFilter').addEventListener('change',renderJobs);$('#fileSearch').addEventListener('input',renderFiles);$('#fileCategoryFilter').addEventListener('change',renderFiles);
  $('#jobForm').addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());if(db.jobs.some(j=>j.code.toLowerCase()===String(payload.code).trim().toLowerCase()))return toast('Esiste già una commessa con questo codice.',true);const job={id:`job_${Date.now()}_${Math.random().toString(16).slice(2)}`,code:String(payload.code).trim(),client:String(payload.client).trim(),article:String(payload.article).trim(),material:String(payload.material||'').trim(),quantity:Number(payload.quantity||0),dueDate:payload.dueDate||'',status:payload.status||'Da progettare',notes:payload.notes||'',createdAt:now(),updatedAt:now(),files:[]};db.jobs.unshift(job);closeNewJob();await saveAndSync('Commessa creata.');openDetail(job.id);});
  const doConnect=()=>connectDrive({silent:false});$('#connectDriveBtn').addEventListener('click',doConnect);$('#settingsConnectBtn').addEventListener('click',doConnect);$('#dashboardDriveAction').addEventListener('click',async()=>{if(BadfishDrive.isConnected()){try{await syncDrive(true);}catch{}}else await doConnect();});
  const doSync=async()=>{try{await ensureConnected();await syncDrive(true);}catch{}};$('#syncBtn').addEventListener('click',doSync);$('#sidebarSyncBtn').addEventListener('click',doSync);
  $('#disconnectDriveBtn').addEventListener('click',()=>{BadfishDrive.clearToken();driveRefs=null;const email=getPreferredGoogleEmail();setSyncState('','Drive non collegato',email?`Account salvato: ${email}`:'Cache locale disponibile');toast('Drive disconnesso. L’email salvata resta memorizzata.');});
  $('#saveClientIdBtn').addEventListener('click',()=>{BadfishDrive.setClientId($('#googleClientId').value);BadfishDrive.clearToken();driveRefs=null;setSyncState('','Drive non collegato','Client ID salvato');toast('Client ID salvato.');});
  $('#googleEmailForm').addEventListener('submit',async e=>{e.preventDefault();try{const email=setPreferredGoogleEmail($('#googleAccountEmail').value,$('#rememberGoogleEmail').checked);BadfishDrive.clearToken();driveRefs=null;hideGoogleEmailSetup();toast(`Account ${email} salvato.`);await connectDrive({email,silent:false});}catch(err){toast(err.message,true);}});
  $('#skipGoogleEmailBtn').addEventListener('click',()=>{hideGoogleEmailSetup();setSyncState('','Modalità offline','Configura Drive dalle Impostazioni');});
  $('#forgetGoogleEmailBtn').addEventListener('click',()=>{if(!confirm('Dimenticare l’account Google salvato su questo dispositivo?'))return;clearPreferredGoogleEmail();setSyncState('','Drive non collegato','Nessun account configurato');showGoogleEmailSetup();});
  $('#savePreferredGoogleEmailBtn').addEventListener('click',()=>{try{const email=setPreferredGoogleEmail($('#preferredGoogleEmail').value,true);BadfishDrive.clearToken();driveRefs=null;setSyncState('','Drive non collegato',`Account salvato: ${email}`);toast(`Account ${email} salvato. Premi “Collega Drive” per autorizzarlo.`);}catch(err){toast(err.message,true);}});
  $('#saveSettingsBtn').addEventListener('click',async()=>{db.settings.companyName=$('#companyName').value.trim()||'Badfish Body Jewelry';await saveAndSync('Impostazioni salvate.');});
  document.addEventListener('click',async e=>{if(e.target.closest('#closeDetail'))closeDetail();if(e.target.closest('#openDriveFolderBtn')){const job=db.jobs.find(j=>j.id===selectedJobId);if(job?.driveFolderId)window.open(BadfishDrive.folderUrl(job.driveFolderId),'_blank','noopener');}if(e.target.closest('#saveDetailBtn')){const job=db.jobs.find(j=>j.id===selectedJobId);if(!job)return;job.status=$('#detailStatus').value;job.dueDate=$('#detailDueDate').value;job.notes=$('#detailNotes').value;job.updatedAt=now();await saveAndSync('Commessa aggiornata.');openDetail(job.id);}if(e.target.closest('#deleteJobBtn')){const job=db.jobs.find(j=>j.id===selectedJobId);if(!job)return;if(!confirm(`Eliminare ${job.code} dal gestionale? I file su Drive non verranno cancellati.`))return;db.jobs=db.jobs.filter(j=>j.id!==job.id);db.deletedJobs.push({id:job.id,deletedAt:now()});closeDetail();await saveAndSync('Commessa rimossa dal gestionale.');}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installPwaBtn').classList.remove('hidden');});$('#installPwaBtn').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installPwaBtn').classList.add('hidden');});
  window.addEventListener('online',()=>{const email=getPreferredGoogleEmail();setSyncState(BadfishDrive.isConnected()?'ok':'',BadfishDrive.isConnected()?'Drive collegato':'Online',email||'Pronto');if(BadfishDrive.isConnected())syncDrive(false).catch(()=>{});});window.addEventListener('offline',()=>setSyncState('','Modalità offline','Dati locali disponibili'));
}

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw-v62.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{}));

function bootBadfish(){
  try {
    if (!window.BadfishDrive) throw new Error('Modulo Google Drive non caricato. Ricarica la pagina.');
    render();
    initEvents();
    const requestedView=new URLSearchParams(location.search).get('view');
    switchView(['jobs','files','settings'].includes(requestedView)?requestedView:'dashboard');
    const startupEmail=getPreferredGoogleEmail();
    setSyncState('',navigator.onLine?'Drive non collegato':'Modalità offline',startupEmail?`Account salvato: ${startupEmail}`:(navigator.onLine?'Configura l’account Google':'Dati locali disponibili'));
    if(!startupEmail)showGoogleEmailSetup();
    document.documentElement.dataset.badfishReady='1';
  } catch (err) {
    console.error('Badfish boot error:', err);
    const toastEl=document.querySelector('#toast');
    if(toastEl){toastEl.textContent=`Errore avvio: ${err.message}`;toastEl.className='toast error';}
    document.documentElement.dataset.badfishReady='0';
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootBadfish,{once:true});
else bootBadfish();
