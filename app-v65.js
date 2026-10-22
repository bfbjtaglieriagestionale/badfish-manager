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


// STEP reader: OpenCascade WebAssembly. The CAD geometry is processed locally in the browser.
// A STEP file contains geometry, but does not specify whether that geometry is the raw stock.
let bfOcctPromise = null;
function bfLoadOcct(){
  if(bfOcctPromise)return bfOcctPromise;
  bfOcctPromise=new Promise((resolve,reject)=>{
    if(typeof window.occtimportjs==='function'){resolve(window.occtimportjs());return;}
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
    script.onload=()=>typeof window.occtimportjs==='function'?resolve(window.occtimportjs()):reject(new Error('Motore STEP non disponibile.'));
    script.onerror=()=>reject(new Error('Impossibile caricare il motore STEP: controlla la connessione a Internet.'));
    document.head.appendChild(script);
  }).catch(err=>{bfOcctPromise=null;throw err;});
  return bfOcctPromise;
}
function bfBoundsFromMeshes(meshes){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let count=0;
  for(const mesh of meshes||[]){
    const pos=mesh?.attributes?.position?.array;
    if(!pos)continue;
    for(let i=0;i+2<pos.length;i+=3){
      for(let k=0;k<3;k++){const v=Number(pos[i+k]);if(!Number.isFinite(v))continue;lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);}count++;
    }
  }
  if(!count || lo.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(hi[i])))throw new Error('Il file STEP non contiene una geometria misurabile.');
  const dims=lo.map((v,i)=>Math.round((hi[i]-v)*1000)/1000);
  if(dims.some(n=>n<=0))throw new Error('Geometria senza volume 3D: verifica che il modello sia un solido.');
  return dims;
}
async function bfReadStepDimensions(file){
  if(!/\.(stp|step)$/i.test(file.name))throw new Error('Seleziona un file STEP (.stp o .step).');
  if(file.size>100*1024*1024)throw new Error('STEP troppo grande (limite 100 MB).');
  const occt=await bfLoadOcct();
  const result=occt.ReadStepFile(new Uint8Array(await file.arrayBuffer()), {linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:0.05,angularDeflection:0.3});
  if(!result?.success)throw new Error('Il motore CAD non riesce a interpretare questo file STEP.');
  return bfBoundsFromMeshes(result.meshes);
}
function bfWriteMeasuredDimensions(job,kind,dims,fileName){
  job.dimensions=job.dimensions||{};
  job.dimensions[kind]=dims;
  job.dimensionSources=job.dimensionSources||{};
  job.dimensionSources[kind]={fileName,method:'STEP / OpenCascade',measuredAt:now(),units:'mm',kind:'axis-aligned bounding box'};
}


// G-code geometric envelope estimator: not a measurement of the physical stock.
function bfEstimateNC(source, allowance=2){
  const a=Number(allowance); if(!Number.isFinite(a)||a<0||a>1000)throw Error('Margine non valido.');
  const text=String(source).replace(/\([^)]*\)/g,'').replace(/;[^\n]*/g,'').toUpperCase();
  let position={X:0,Y:0,Z:0}, modal=0,absolute=true,scale=1,started=false;
  let low={X:Infinity,Y:Infinity,Z:Infinity},high={X:-Infinity,Y:-Infinity,Z:-Infinity};
  let count=0, rapid=0, arc=0, unsupported=new Set(), units='mm', cuttingZ=[];
  for(const originalLine of text.split(/\r?\n/)){
    const line=originalLine.replace(/^\s*N\d+\s*/,'').replace(/\s+/g,'');if(!line||line==='%')continue;
    const words=[...line.matchAll(/([A-Z])([+-]?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?)/g)];
    const codes=words.filter(w=>w[1]==='G').map(w=>Number(w[2]));
    for(const c of codes){if(c===20){scale=25.4;units='inch → mm';}else if(c===21){scale=1;units='mm';}else if(c===90)absolute=true;else if(c===91)absolute=false;else if([0,1,2,3].includes(c))modal=c;else if([17,18,19,40,43,49,54,55,56,57,58,59,80,94].includes(c)){}else unsupported.add('G'+c);}
    if(codes.some(c=>[28,30,53,92].includes(c))){unsupported.add('coordinate speciali (G28/G30/G53/G92)');continue;}
    const changes={};for(const w of words){if('XYZ'.includes(w[1]))changes[w[1]]=Number(w[2])*scale;}
    if(!Object.keys(changes).length)continue;
    const next={...position};for(const axis of Object.keys(changes)){next[axis]=absolute?changes[axis]:position[axis]+changes[axis];}
    if(modal===2||modal===3){arc++;unsupported.add('archi G2/G3: estremi non descrivono tutto l’arco');}
    if(modal===0)rapid++;
    if(modal===1||modal===2||modal===3){
      for(const pt of [position,next])for(const axis of ['X','Y','Z']){low[axis]=Math.min(low[axis],pt[axis]);high[axis]=Math.max(high[axis],pt[axis]);}
      if(!started){ // First cutting segment may originate at a safe machine location.
        for(const axis of ['X','Y','Z']){low[axis]=next[axis];high[axis]=next[axis];}
        started=true;
      }
      count++;cuttingZ.push(next.Z);
    }
    position=next;
  }
  if(count===0)throw Error('Nessuna traiettoria di taglio G1/G2/G3 trovata.');
  const dx=high.X-low.X,dy=high.Y-low.Y;
  if(!(dx>0&&dy>0))throw Error('Traiettoria insufficiente per stimare X e Y.');
  const bounds={x:[low.X,high.X],y:[low.Y,high.Y],z:[low.Z,high.Z]};
  // Z of stock cannot be established from NC alone; display depth of toolpath only.
  return {x:Math.round((dx+2*a)*1000)/1000,y:Math.round((dy+2*a)*1000)/1000,zDepth:Math.round((high.Z-low.Z)*1000)/1000,bounds,allowance:a,lines:count,rapid,arc,units,warnings:[...unsupported], method:'NC toolpath X/Y + margin; Z depth only'};
}
function bfNCPanel(j){const r=j.ncEstimate;return `<section class="detail-section bf-nc-panel"><div class="bf-section-title"><h4>Stima grezzo dal programma NC</h4><span class="bf-tag">STIMA · NON MISURA</span></div><p class="bf-help">Legge i movimenti X/Y/Z del G-code. Calcola X e Y da traiettorie di taglio più un margine; la quota Z mostra solo l’escursione utensile. La dimensione reale del grezzo e il diametro fresa non sono ricavabili in modo affidabile dal solo NC.</p><div class="bf-nc-grid"><label class="field-label">Margine per lato (mm)<input id="bfNcMargin" type="number" min="0" max="1000" step="0.1" value="${esc(r?.allowance??2)}"></label><label class="field-label">Programma NC<input id="bfNcInput" type="file" accept=".nc,.tap,.cnc,.gcode,.txt"></label></div><button class="btn primary wide" id="bfAnalyzeNC">Analizza programma NC</button><div id="bfNcResult">${r?bfRenderNCResult(r):'<p class="bf-help">Seleziona il file NC usato sulla macchina per ottenere una stima.</p>'}</div></section>`;}
function bfRenderNCResult(r){return `<div class="bf-nc-results"><div class="bf-nc-number"><small>X stimata</small><strong>${Number(r.x).toLocaleString('it-IT')} mm</strong></div><div class="bf-nc-number"><small>Y stimata</small><strong>${Number(r.y).toLocaleString('it-IT')} mm</strong></div><div class="bf-nc-number"><small>Escursione Z utensile</small><strong>${Number(r.zDepth).toLocaleString('it-IT')} mm</strong></div></div><p class="bf-help">${esc(r.fileName||'NC')} · ${r.lines} segmenti · margine ${r.allowance} mm/lato${r.units==='inch → mm'?' · pollici convertiti':''}</p>${r.warnings?.length?`<p class="bf-nc-warn">⚠️ Analisi parziale: ${esc(r.warnings.join(' · '))}. Controlla le misure in CAM.</p>`:''}<p class="bf-help"><b>Non sono inclusi:</b> raggio utensile, orientamento del grezzo, fissaggi, superfici da spianare e quote reali dello stock.</p>`;}
function bfClockFormat(sec){sec=Math.max(0,Math.floor(sec||0));return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec%3600/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function bfRunningSeconds(j){return j.timerStartedAt?Math.max(0,Math.floor((Date.now()-Date.parse(j.timerStartedAt))/1000))+Math.max(0,Number(j.timerAccumulatedSeconds)||0):Math.max(0,Number(j.timerAccumulatedSeconds)||0);}
function bfSessionSeconds(j){return (j.workSessions||[]).reduce((n,s)=>n+(Number.isFinite(Number(s.seconds))?Number(s.seconds):Number(s.minutes||0)*60),0);}
function bfTimerPanel(j){const running=!!j.timerStartedAt,paused=!running&&!!j.timerAccumulatedSeconds;const sessions=j.workSessions||[];return `<section class="detail-section bf-clock-panel"><div class="bf-section-title"><h4>Registro ore di lavoro</h4><span class="bf-tag">${running?'● IN CORSO':paused?'IN PAUSA':'PRONTO'}</span></div><p class="bf-help">Il cronometro usa l'ora reale: continua a conteggiare anche se chiudi la pagina. Salva ogni sessione nella commessa.</p><div class="bf-clock-display" id="bfTimerClock">${bfClockFormat(bfRunningSeconds(j))}</div><label class="field-label">Fase di lavoro<select id="bfPhase">${['Preparazione','Lavorazione CNC','Finitura','Altro'].map(x=>`<option ${x===(j.timerPhase||'Lavorazione CNC')?'selected':''}>${x}</option>`).join('')}</select></label><div class="bf-clock-actions">${running?'<button id="bfPauseTimer" class="btn secondary">Ⅱ Pausa</button><button id="bfStopTimer" class="btn primary">■ Termina e registra</button>':`<button id="bfStartTimer" class="btn primary">${paused?'▶ Riprendi':'▶ Avvia'}</button>${paused?'<button id="bfStopTimer" class="btn secondary">■ Termina e registra</button>':''}`}</div><div class="bf-manual"><label>Ore<input type="number" id="bfManualHours" min="0" max="100000" value="0"></label><label>Minuti<input type="number" id="bfManualMinutes" min="0" max="59" value="0"></label><button class="btn secondary" id="bfAddManual">+ Aggiungi tempo</button></div><div class="bf-totals"><span>Tempo registrato</span><strong>${bfClockFormat(bfSessionSeconds(j))}</strong></div><div class="bf-session-list">${sessions.length?sessions.slice().reverse().map(t=>`<div class="bf-session"><span><b>${esc(t.phase||'Lavorazione')}</b><small>${formatDateTime(t.endedAt||t.createdAt)} ${t.manual?'· manuale':''}</small></span><strong>${bfClockFormat(Number.isFinite(Number(t.seconds))?Number(t.seconds):Number(t.minutes||0)*60)}</strong><button class="bf-delete-session" data-bf-remove-session="${esc(t.id)}" title="Elimina sessione">×</button></div>`).join(''):'<p class="bf-help">Nessuna sessione registrata.</p>'}</div></section>`;}

let db = loadLocal();
let selectedJobId = null;
let driveRefs = null;
let pendingUploadCategory = null;
let pendingStepRole = 'finished';
let deferredInstallPrompt = null;
let syncing = false;
let sessionGoogleEmail = '';
let currentView = 'dashboard';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function now(){ return new Date().toISOString(); }
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function defaultDb(){
  return {settings:{companyName:'Badfish Body Jewelry',schemaVersion:6,googleAccountEmail:'',rememberGoogleAccount:true},jobs:[],deletedJobs:[],tasks:[],notes:[],clients:[],quotes:[],meta:{updatedAt:now()}};
}
function normalizeDb(value){
  const base=defaultDb();
  return {...base,...(value||{}),settings:{...base.settings,...(value?.settings||{}),schemaVersion:6},jobs:Array.isArray(value?.jobs)?value.jobs.map(j=>({...j,files:Array.isArray(j.files)?j.files:[]})):[],deletedJobs:Array.isArray(value?.deletedJobs)?value.deletedJobs:[],tasks:Array.isArray(value?.tasks)?value.tasks:[],notes:Array.isArray(value?.notes)?value.notes:[],clients:Array.isArray(value?.clients)?value.clients:[],quotes:Array.isArray(value?.quotes)?value.quotes:[],meta:{...base.meta,...(value?.meta||{})}};
}
function loadLocal(){try{return normalizeDb(JSON.parse(localStorage.getItem(LOCAL_DB_KEY)||'null'));}catch{return defaultDb();}}
function persistLocal({renderNow=true}={}){db.meta.updatedAt=now();localStorage.setItem(LOCAL_DB_KEY,JSON.stringify(db));if(renderNow)render();}
function dateMs(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0;}
function mergeDb(a,b){
  a=normalizeDb(a);b=normalizeDb(b);
  const tomb=new Map();[...a.deletedJobs,...b.deletedJobs].forEach(x=>{const old=tomb.get(x.id);if(!old||dateMs(x.deletedAt)>dateMs(old.deletedAt))tomb.set(x.id,x);});
  const jobs=new Map();[...a.jobs,...b.jobs].forEach(j=>{const old=jobs.get(j.id);if(!old||dateMs(j.updatedAt)>dateMs(old.updatedAt))jobs.set(j.id,j);});
  for(const[id,del]of tomb){const job=jobs.get(id);if(!job||dateMs(del.deletedAt)>=dateMs(job.updatedAt))jobs.delete(id);}
  const mergedItems=(aa,bb)=>{const out=new Map();[...(aa||[]),...(bb||[])].forEach(x=>{const prev=out.get(x.id);if(!prev||dateMs(x.updatedAt||x.createdAt)>=dateMs(prev.updatedAt||prev.createdAt))out.set(x.id,x);});return [...out.values()];};
  const tasks=mergedItems(a.tasks,b.tasks),notes=mergedItems(a.notes,b.notes),clients=mergedItems(a.clients,b.clients),quotes=mergedItems(a.quotes,b.quotes);
  const settings=dateMs(a.meta.updatedAt)>=dateMs(b.meta.updatedAt)?a.settings:b.settings;
  return normalizeDb({settings,tasks,notes,clients,quotes,jobs:[...jobs.values()].sort((x,y)=>dateMs(y.updatedAt||y.createdAt)-dateMs(x.updatedAt||x.createdAt)),deletedJobs:[...tomb.values()],meta:{updatedAt:now()}});
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
  const titles={dashboard:['PANORAMICA','Home'],jobs:['PRODUZIONE','Commesse'],files:['ARCHIVIO','File'],planner:['ORGANIZZAZIONE','Calendario e attività'],notes:['CONOSCENZE','Appunti'],clients:['RELAZIONI','Clienti'],quotes:['DOCUMENTI','Preventivi'],settings:['PREFERENZE','Impostazioni']};
  $('#pageKicker').textContent=titles[view]?.[0]||'';$('#pageTitle').textContent=titles[view]?.[1]||'Badfish';
  if(view==='files')renderFiles();if(view==='jobs')renderJobs();if(view==='planner')bfRenderPlanner();if(view==='notes')bfRenderNotes();if(view==='clients')bfRenderClients();if(view==='quotes')bfRenderQuotes();window.scrollTo({top:0,behavior:'smooth'});
}

function render(){
  $('#companyName').value=db.settings.companyName||'Badfish Body Jewelry';$('#googleClientId').value=BadfishDrive.getClientId();$('#driveFolderText').textContent=window.BADFISH_CONFIG?.driveRootFolder||'BADFISH_MANAGER';
  const preferred=getPreferredGoogleEmail();$('#preferredGoogleEmail').value=preferred;$('#savedGoogleEmailText').textContent=preferred||'—';$('#accountInitial').textContent=accountInitial(BadfishDrive.getCurrentUser?.()?.emailAddress||preferred);
  const last=localStorage.getItem(LAST_SYNC_KEY);$('#lastSyncText').textContent=last?formatDateTime(last):'—';
  $('#statTotal').textContent=db.jobs.length;$('#statWorking').textContent=db.jobs.filter(j=>['In lavorazione','Controllo qualità'].includes(j.status)).length;$('#statProgramming').textContent=db.jobs.filter(j=>j.status==='Da programmare').length;$('#statDone').textContent=db.jobs.filter(j=>['Completata','Consegnata'].includes(j.status)).length;$('#navJobsCount').textContent=db.jobs.length;
  renderRecent();renderJobs();renderFiles();bfRenderSummary();bfRenderPlanner();bfRenderNotes();bfRenderClients();bfRenderQuotes();
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
  $('#allFilesList').innerHTML=filtered.length?filtered.sort((a,b)=>(a.category||'').localeCompare(b.category||'')||(a.jobCode||'').localeCompare(b.jobCode||'')||(a.name||'').localeCompare(b.name||'')).map(f=>`<div class="archive-row"><div class="archive-icon">${esc(CATEGORY_SHORT[f.category]||'FILE')}</div><div class="archive-name"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatDate(f.addedAt)}</span></div><button class="archive-job" data-open="${esc(f.jobId)}"><strong>${esc(f.jobCode)}</strong><span>${esc(f.jobArticle)}</span></button><div class="archive-size">${formatSize(f.size)}</div><button class="archive-open" data-drive-open="${esc(f.driveFileId||'')}" aria-label="Apri su Drive">${icon('external')}</button></div>`).join(''):`<div class="empty">Nessun file trovato nell'archivio.</div>`;
}

function openNewJob(){const form=$('#jobForm');form.reset();form.elements.quantity.value=1;$('#modalBackdrop').classList.remove('hidden');setTimeout(()=>form.elements.code?.focus(),100);}
function closeNewJob(){$('#modalBackdrop').classList.add('hidden');}
function fileButtons(f){return `<button data-drive-open="${esc(f.driveFileId||'')}">Apri Drive</button><button data-file-remove="${esc(f.id)}" aria-label="Elimina file">×</button>`;}
// Badfish v64: registrazione misure e tempi per ciascuna commessa.
function bfMinutes(job){return (job.workSessions||[]).reduce((sum,s)=>sum+(Number(s.minutes)||0),0);}
function bfTime(minutes){const m=Math.max(0,Math.round(minutes||0));return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;}
function bfElapsed(job){return job.timerStartedAt?Math.max(0,Math.floor((Date.now()-Date.parse(job.timerStartedAt))/60000)):0;}
function bfDimFields(kind,dimensions){const labels=['Lunghezza','Larghezza','Spessore'];return `<div class="bf-dim-set"><b>${kind==='raw'?'Grezzo iniziale':'Pezzo finito'}</b><div class="bf-dims">${labels.map((name,i)=>`<label>${name}<input type="number" inputmode="decimal" min="0" max="100000" step="any" data-dimension="${kind}" data-axis="${i}" value="${esc(dimensions?.[i]??'')}" placeholder="mm"></label>`).join('')}</div></div>`;}
function bfWorkPanel(j){
 const raw=j.dimensions?.raw||[], finished=j.dimensions?.finished||[];
 return `<div class="bf-work-layout">${bfNCPanel(j)}<section class="detail-section bf-tech-panel"><div class="bf-section-title"><h4>Misure del grezzo e pezzo finito</h4><span class="bf-tag">mm</span></div><p class="bf-help">Puoi correggere le misure manualmente oppure ricavarle dal modello STEP. La stima NC riguarda solamente X/Y della traiettoria.</p>${bfDimFields('raw',raw)}${bfDimFields('finished',finished)}<div class="bf-step-tools"><label class="field-label">File STEP<select id="bfStepRole"><option value="finished">Pezzo finito</option><option value="raw">Grezzo</option></select></label><button class="btn secondary" id="bfAnalyzeStep">Leggi STEP</button><input type="file" id="bfStepMeasureInput" accept=".stp,.step" hidden><span id="bfStepStatus"></span></div><button class="btn secondary wide" id="bfSaveDimensions">Salva misure</button></section>${bfTimerPanel(j)}</div>`;
}
function openDetail(id){
  selectedJobId=id;const j=db.jobs.find(x=>x.id===id);if(!j)return;const files=j.files||[];
  $('#detailContent').innerHTML=`<div class="detail-shell"><div class="detail-top"><div class="detail-title"><span class="eyebrow">COMMESSA ${esc(j.code)}</span><h2>${esc(j.article)}</h2><div class="detail-sub">${esc(j.client)} · ${esc(j.material||'Materiale non specificato')}</div></div><button type="button" class="icon-btn detail-close-btn" id="closeDetail" aria-label="Chiudi commessa">${icon('x')}</button></div><div class="detail-summary"><div><span>Stato</span><strong>${esc(j.status)}</strong></div><div><span>Quantità</span><strong>${esc(j.quantity||0)}</strong></div><div><span>Consegna</span><strong>${formatDate(j.dueDate)}</strong></div><div><span>File</span><strong>${files.length}</strong></div></div>${bfWorkPanel(j)}${bfBusinessPanel(j)}<div class="detail-grid"><div><section class="detail-section"><h4>Carica file</h4><div class="upload-grid"><button class="upload-btn fusion-upload" data-upload="fusion"><b>+ Progetto Fusion 360</b><span>.f3d, .f3z · versione precedente archiviata</span></button><button class="upload-btn" data-upload="step"><b>+ File STEP</b><span>.stp, .step</span></button><button class="upload-btn" data-upload="nc"><b>+ Programma NC</b><span>.nc, .tap, .cnc</span></button><button class="upload-btn" data-upload="drawings"><b>+ Disegni / PDF</b><span>.pdf, .dwg, .dxf</span></button><button class="upload-btn" data-upload="photos"><b>+ Fotografie</b><span>JPG, PNG, HEIC...</span></button></div><p class="upload-note">I file vengono caricati direttamente nel Google Drive Badfish.</p></section><section class="detail-section"><h4>Archivio della commessa</h4><div class="file-list">${files.length?files.map(f=>`<div class="file-row"><div class="file-info"><strong>${esc(f.name)}</strong><span>${categoryLabel(f.category)} · ${formatSize(f.size)} · ${formatDate(f.addedAt)}</span></div><div class="file-actions">${fileButtons(f)}</div></div>`).join(''):`<div class="empty">Non sono ancora stati caricati file.</div>`}</div></section></div><div><section class="detail-section"><h4>Lavorazione</h4><label class="field-label">Stato<select id="detailStatus">${STATUSES.map(s=>`<option ${s===j.status?'selected':''}>${s}</option>`).join('')}</select></label><label class="field-label">Data consegna<input id="detailDueDate" type="date" value="${esc(j.dueDate||'')}"></label><label class="field-label">Note<textarea id="detailNotes" rows="7">${esc(j.notes||'')}</textarea></label><button id="saveDetailBtn" class="btn primary wide">Salva modifiche</button></section><section class="detail-section"><h4>Google Drive</h4><div class="path-box">${j.driveFolderId?'La cartella cloud della commessa è collegata.':'La cartella verrà creata alla prima sincronizzazione o al primo upload.'}</div>${j.driveFolderId?`<button id="openDriveFolderBtn" class="btn subtle wide">${icon('external')} Apri cartella Drive</button>`:''}</section><button id="deleteJobBtn" class="btn danger wide delete-gap">${icon('trash')} Elimina dal gestionale</button></div></div></div>`;
  const closeBtn=$('#closeDetail');
  if(closeBtn){
    closeBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeDetail();},{once:true});
  }
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
  let count=0;for(const file of files){setSyncState('syncing',`Caricamento ${count+1}/${files.length}…`,file.name);if(category==='step'){try{const dimensions=await bfReadStepDimensions(file);bfWriteMeasuredDimensions(job,pendingStepRole||'finished',dimensions,file.name);toast(`STEP analizzato: ${dimensions.join(' × ')} mm`);}catch(error){toast(`STEP archiviato senza misure automatiche: ${error.message}`,true);}}const uploaded=await BadfishDrive.uploadJobFile(file,category,folders);job.files.push({id:`file_${Date.now()}_${Math.random().toString(16).slice(2)}`,driveFileId:uploaded.id,name:uploaded.name||file.name,category,size:Number(uploaded.size||file.size||0),mimeType:uploaded.mimeType||file.type||'',addedAt:now()});count++;}
  job.updatedAt=now();await saveAndSync(`${count} file caricati.`);openDetail(job.id);
}


// v7.1 - planning, knowledge base, and complete work hour totals.
const bfHoursTotal = () => db.jobs.reduce((sum,j)=>sum+bfSessionSeconds(j)+(j.timerStartedAt?bfRunningSeconds(j):0),0);
const bfHumanHours = secs => `${Math.floor(Math.max(0,secs)/3600)}h ${String(Math.floor(Math.max(0,secs)%3600/60)).padStart(2,'0')}m`;
function bfRenderSummary(){
 const t=$('#bfTotalHours'); if(t)t.textContent=bfHumanHours(bfHoursTotal());
 const taskCount=$('#bfOpenTasks'); if(taskCount)taskCount.textContent=(db.tasks||[]).filter(x=>!x.done&&!x.deleted).length;
 const urgent=$('#bfTodayTasks');if(urgent){const today=new Date().toLocaleDateString('sv-SE');const entries=(db.tasks||[]).filter(t=>!t.done&&!t.deleted&&(t.date||'')<=today).sort((a,b)=>(a.date||'').localeCompare(b.date||''));urgent.innerHTML=entries.length?entries.slice(0,4).map(t=>`<button class="bf-home-task" data-view="planner"><span>${esc(t.title)}</span><small>${esc(t.date||'Senza data')}</small></button>`).join(''):'<p class="bf-help">Nessuna attività in scadenza. Ottimo!</p>';}
}
let bfPlannerMonth=new Date().toISOString().slice(0,7);
function bfRenderPlanner(){const root=$('#bfPlanner');if(!root)return;const items=(db.tasks||[]).filter(t=>!t.deleted);const [year,month]=bfPlannerMonth.split('-').map(Number);const start=new Date(year,month-1,1),days=new Date(year,month,0).getDate();const offset=(start.getDay()+6)%7;const today=new Date().toLocaleDateString('sv-SE');const names=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
 const grid=[...names.map(x=>`<span class="bf-cal-dayname">${x}</span>`),...Array.from({length:offset},()=>'<span></span>'),...Array.from({length:days},(_,i)=>{const d=`${bfPlannerMonth}-${String(i+1).padStart(2,'0')}`,n=items.filter(t=>t.date===d&&!t.done).length;return `<button class="bf-day ${d===today?'today':''} ${n?'has-tasks':''}" data-bf-date="${d}"><strong>${i+1}</strong>${n?`<small>${n} attività</small>`:''}</button>`;})].join('');
 root.innerHTML=`<div class="bf-planner-layout"><article class="panel bf-planner-calendar"><div class="bf-heading-row"><div><span class="eyebrow">PIANIFICAZIONE</span><h3>${new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(start)}</h3></div><div class="bf-button-group"><button class="btn subtle" data-bf-month="-1" aria-label="Mese precedente">←</button><button class="btn subtle" data-bf-month="1" aria-label="Mese successivo">→</button></div></div><div class="bf-cal-grid">${grid}</div></article><article class="panel bf-form-card"><h3>Nuova attività</h3><p class="bf-help">Una scadenza o un promemoria, anche senza commessa.</p><form id="bfTaskForm" class="bf-inline-form"><label>Attività<input name="title" required maxlength="180" placeholder="Es. Preparare grezzo in quarzo"></label><label>Data<input name="date" type="date" value="${today}"></label><label>Commessa (facoltativa)<select name="jobId"><option value="">Attività generale</option>${db.jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.code)} · ${esc(j.article)}</option>`).join('')}</select></label><label>Dettagli<textarea name="description" rows="2" placeholder="Informazioni utili..."></textarea></label><button class="btn primary" type="submit">+ Aggiungi attività</button></form></article></div><article class="panel bf-list-panel"><div class="bf-heading-row"><h3>Le tue attività</h3><span class="bf-muted">${items.filter(t=>!t.done).length} da fare</span></div><div class="bf-task-items">${items.sort((a,b)=>(a.done-b.done)||(a.date||'9999').localeCompare(b.date||'9999')).map(t=>`<div class="bf-task-row ${t.done?'completed':''}"><input type="checkbox" aria-label="Completa attività" data-bf-task-toggle="${esc(t.id)}" ${t.done?'checked':''}><div><strong>${esc(t.title)}</strong><small>${esc(t.date||'Senza scadenza')}${t.jobId?' · '+esc(db.jobs.find(j=>j.id===t.jobId)?.code||'Commessa'):''}</small>${t.description?`<p>${esc(t.description)}</p>`:''}</div><button class="bf-small-delete" data-bf-task-delete="${esc(t.id)}" aria-label="Elimina attività">×</button></div>`).join('')||'<p class="empty">Nessuna attività. Aggiungine una usando il modulo.</p>'}</div></article>`;
}
function bfRenderNotes(){const root=$('#bfNotes');if(!root)return;let notes=(db.notes||[]).filter(n=>!n.deleted);const choice=root.dataset.category||'all';const query=(root.dataset.query||'').toLowerCase();notes=notes.filter(n=>(choice==='all'||n.category===choice)&&(!query||[n.title,n.body,n.machine].join(' ').toLowerCase().includes(query))).sort((a,b)=>dateMs(b.updatedAt||b.createdAt)-dateMs(a.updatedAt||a.createdAt));
 root.innerHTML=`<div class="bf-notes-intro"><div><span class="eyebrow">MANUALE DI OFFICINA</span><h3>Appunti sempre a portata di mano</h3><p>Impostazioni delle macchine, prove, procedure e note generali. Usa titoli chiari per ritrovare subito ciò che cerchi.</p></div></div><div class="bf-notes-layout"><article class="panel bf-form-card"><h3>Salva un appunto</h3><form id="bfNoteForm" class="bf-inline-form"><label>Categoria<select name="category"><option value="machine">Settaggi macchina</option><option value="general">Appunti generali</option><option value="procedure">Procedure / controlli</option></select></label><label>Titolo<input name="title" required maxlength="180" placeholder="Es. Quarzo — punta diamantata 3 mm"></label><label>Macchina / strumento (facoltativo)<input name="machine" placeholder="Es. Genmitsu 3030"></label><label>Descrizione e parametri<textarea name="body" rows="7" required placeholder="Mandrino, avanzamento, profondità, refrigerazione, osservazioni..."></textarea></label><button class="btn primary" type="submit">Salva appunto</button></form></article><div class="bf-notes-content"><div class="bf-heading-row"><select id="bfNoteFilter" aria-label="Categoria appunti"><option value="all" ${choice==='all'?'selected':''}>Tutte le categorie</option><option value="machine" ${choice==='machine'?'selected':''}>Settaggi macchina</option><option value="general" ${choice==='general'?'selected':''}>Appunti generali</option><option value="procedure" ${choice==='procedure'?'selected':''}>Procedure</option></select><input id="bfNoteSearch" type="search" placeholder="Cerca negli appunti..." value="${esc(root.dataset.query||'')}"></div><div class="bf-note-grid">${notes.map(n=>`<article class="panel bf-note-card"><div class="bf-heading-row"><span class="bf-note-tag">${{machine:'Settaggi macchina',general:'Appunti generali',procedure:'Procedura'}[n.category]||'Appunto'}</span><button data-bf-note-delete="${esc(n.id)}" class="bf-small-delete" aria-label="Elimina appunto">×</button></div><h3>${esc(n.title)}</h3>${n.machine?`<p class="bf-note-machine">${esc(n.machine)}</p>`:''}<p class="bf-note-body">${esc(n.body)}</p><small>Aggiornato ${formatDate(n.updatedAt||n.createdAt)}</small><button class="btn subtle" data-bf-note-edit="${esc(n.id)}">Modifica</button></article>`).join('')||'<p class="empty">Nessun appunto in questa categoria.</p>'}</div></div></div>`;
}
let bfEditingNote=null;
document.addEventListener('submit',async e=>{
 if(e.target.id==='bfTaskForm'){e.preventDefault();const v=Object.fromEntries(new FormData(e.target));db.tasks.push({id:`task_${Date.now()}_${Math.random().toString(36).slice(2)}`,...v,done:false,createdAt:now(),updatedAt:now()});await saveAndSync('Attività salvata.');switchView('planner');}
 if(e.target.id==='bfNoteForm'){e.preventDefault();const v=Object.fromEntries(new FormData(e.target));if(bfEditingNote){const n=db.notes.find(n=>n.id===bfEditingNote);if(n)Object.assign(n,v,{updatedAt:now()});bfEditingNote=null;}else db.notes.push({id:`note_${Date.now()}_${Math.random().toString(36).slice(2)}`,...v,createdAt:now(),updatedAt:now()});await saveAndSync('Appunto salvato.');switchView('notes');}
});
document.addEventListener('change',async e=>{if(e.target.matches('[data-bf-task-toggle]')){const t=db.tasks.find(x=>x.id===e.target.dataset.bfTaskToggle);if(t){t.done=e.target.checked;t.updatedAt=now();await saveAndSync('Attività aggiornata.');}}if(e.target.id==='bfNoteFilter'){const el=$('#bfNotes');el.dataset.category=e.target.value;bfRenderNotes();}});
document.addEventListener('input',e=>{if(e.target.id==='bfNoteSearch'){const el=$('#bfNotes'),sel=e.target.selectionStart;el.dataset.query=e.target.value;bfRenderNotes();const input=$('#bfNoteSearch');input.focus();input.setSelectionRange(sel,sel);}});
document.addEventListener('click',async e=>{const m=e.target.closest('[data-bf-month]');if(m){const [y,mo]=bfPlannerMonth.split('-').map(Number);const d=new Date(y,mo-1+Number(m.dataset.bfMonth),1);bfPlannerMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;bfRenderPlanner();return;}const date=e.target.closest('[data-bf-date]');if(date){$('#bfTaskForm [name="date"]').value=date.dataset.bfDate;$('#bfTaskForm [name="title"]').focus();return;}const td=e.target.closest('[data-bf-task-delete]');if(td){const t=db.tasks.find(x=>x.id===td.dataset.bfTaskDelete);if(t&&confirm('Eliminare questa attività?')){t.deleted=true;t.updatedAt=now();await saveAndSync('Attività eliminata.');}return;}const nd=e.target.closest('[data-bf-note-delete]');if(nd){const n=db.notes.find(x=>x.id===nd.dataset.bfNoteDelete);if(n&&confirm('Eliminare questo appunto?')){n.deleted=true;n.updatedAt=now();await saveAndSync('Appunto eliminato.');}return;}const ne=e.target.closest('[data-bf-note-edit]');if(ne){const n=db.notes.find(x=>x.id===ne.dataset.bfNoteEdit);if(!n)return;bfEditingNote=n.id;const form=$('#bfNoteForm');['title','category','machine','body'].forEach(k=>form.elements[k].value=n[k]||'');form.querySelector('button[type=submit]').textContent='Salva modifiche';form.scrollIntoView({behavior:'smooth'});return;}});

// v7.2 Clienti: schede anagrafiche, collegamento stabile alle commesse, ore per cliente.
const bfClientKey = value => String(value||'').trim().toLocaleLowerCase('it-IT').replace(/\s+/g,' ');
function bfClientIdForName(name){const key=bfClientKey(name);return (db.clients||[]).find(c=>!c.deleted&&bfClientKey(c.name)===key)?.id||'';}
function bfClientJobs(client){return db.jobs.filter(j=>j.clientId?j.clientId===client.id:bfClientKey(j.client)===bfClientKey(client.name));}
function bfClientSeconds(job){return bfSessionSeconds(job)+((job.timerStartedAt||job.timerAccumulatedSeconds)?bfRunningSeconds(job):0);}
function bfClientCatalog(){
 const map=new Map();
 for(const c of db.clients||[]){if(!c.deleted)map.set(c.id,{...c});}
 for(const job of db.jobs){
   if(!bfClientKey(job.client))continue;
   // Never recreate a deleted client from historical orders. Orders and hours remain intact.
   if((db.clients||[]).some(c=>c.deleted&&(c.id===job.clientId||bfClientKey(c.name)===bfClientKey(job.client))))continue;
   if(job.clientId&&map.has(job.clientId))continue;
   if([...map.values()].some(c=>bfClientKey(c.name)===bfClientKey(job.client)))continue;
   const id='legacy_'+bfClientKey(job.client);if(!map.has(id))map.set(id,{id,name:job.client,legacy:true});
 }
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
}
function bfRenderClients(){
 const root=$('#bfClients');if(!root)return;
 const selected=root.dataset.selected||'', q=(root.dataset.query||'').toLocaleLowerCase('it-IT');
 const clients=bfClientCatalog();const filtered=clients.filter(c=>[c.name,c.email,c.phone,c.notes].join(' ').toLocaleLowerCase('it-IT').includes(q));
 const jobsFor=c=>db.jobs.filter(j=>j.clientId?j.clientId===c.id:bfClientKey(j.client)===bfClientKey(c.name));
 const allHours=clients.reduce((n,c)=>n+jobsFor(c).reduce((t,j)=>t+bfClientSeconds(j),0),0);
 const active=clients.find(c=>c.id===selected);
 root.innerHTML=`<div class="bf-client-top"><div class="bf-client-stat"><small>Clienti</small><strong>${clients.length}</strong></div><div class="bf-client-stat"><small>Ore associate ai clienti</small><strong>${bfHumanHours(allHours)}</strong></div><div class="bf-client-stat"><small>Ordini</small><strong>${db.jobs.filter(j=>j.client).length}</strong></div></div><div class="bf-client-layout"><div class="panel bf-client-left"><div class="bf-client-search"><input id="bfClientSearch" placeholder="Cerca un cliente..." value="${esc(root.dataset.query||'')}"><button class="btn primary" id="bfNewClient">+ Cliente</button></div><div class="bf-client-list">${filtered.length?filtered.map(c=>{const jobs=jobsFor(c);return `<button class="bf-client-list-row ${c.id===selected?'selected':''}" data-bf-client="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${jobs.length} ordini · ${bfHumanHours(jobs.reduce((n,j)=>n+bfClientSeconds(j),0))}</small></span><span>›</span></button>`;}).join(''):'<div class="empty">Nessun cliente trovato.</div>'}</div></div><div class="panel bf-client-right">${active?bfClientDetail(active,jobsFor(active)):`<div class="bf-client-placeholder"><h3>Seleziona un cliente</h3><p>Qui trovi le sue commesse, le ore effettive e i file associati.</p></div>`}</div></div>`;
}
function bfClientDetail(c,jobs){const sec=jobs.reduce((n,j)=>n+bfClientSeconds(j),0);const complete=jobs.filter(j=>['Completata','Consegnata'].includes(j.status)).length;const files=jobs.reduce((n,j)=>n+(j.files||[]).length,0);return `<div class="bf-client-detail-head"><div><span class="eyebrow">SCHEDA CLIENTE</span><h2>${esc(c.name)}</h2><p>${esc(c.email||'')}${c.phone?' · '+esc(c.phone):''}</p></div><div class="bf-client-head-actions"><button class="btn subtle" data-bf-edit-client="${esc(c.id)}">Modifica</button><button class="btn subtle bf-client-delete" data-bf-delete-client="${esc(c.id)}" aria-label="Elimina cliente ${esc(c.name)}">Elimina cliente</button></div></div><div class="bf-client-metrics"><div><small>Ore complessive</small><strong>${bfHumanHours(sec)}</strong></div><div><small>Ordini totali</small><strong>${jobs.length}</strong></div><div><small>Completati</small><strong>${complete}</strong></div><div><small>File</small><strong>${files}</strong></div></div>${c.notes?`<div class="bf-client-note"><b>Note cliente</b><p>${esc(c.notes)}</p></div>`:''}<h3>Ordini del cliente</h3>${jobs.length?`<div class="bf-client-orders">${jobs.slice().sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)).map(j=>`<button data-open="${esc(j.id)}" class="bf-client-order"><span><b>${esc(j.code)} · ${esc(j.article)}</b><small>${esc(j.status)} · ${formatDate(j.dueDate)} · ${(j.files||[]).length} file</small></span><strong>${bfHumanHours(bfClientSeconds(j))}</strong></button>`).join('')}</div>`:'<div class="empty">Nessun ordine associato.</div>'}<button class="btn primary" id="bfClientNewJob">+ Nuova commessa per questo cliente</button>`;}
function bfClientEditor(client){const root=$('#bfClients');root.dataset.editing=client?.id||'';root.querySelector('.bf-client-right').innerHTML=`<h2>${client?'Modifica cliente':'Nuovo cliente'}</h2><form id="bfClientForm" class="bf-client-form"><label>Nome o ragione sociale *<input name="name" required maxlength="150" value="${esc(client?.name||'')}"></label><label>Email<input name="email" type="email" value="${esc(client?.email||'')}"></label><label>Telefono<input name="phone" value="${esc(client?.phone||'')}"></label><label>Note<textarea name="notes" rows="4">${esc(client?.notes||'')}</textarea></label><div class="bf-client-actions"><button class="btn primary" type="submit">Salva cliente</button><button class="btn subtle" type="button" id="bfCancelClient">Annulla</button></div></form>`;}
document.addEventListener('click',e=>{
 const root=$('#bfClients');if(!root)return;
 const row=e.target.closest('[data-bf-client]');if(row){root.dataset.selected=row.dataset.bfClient;bfRenderClients();return;}
 if(e.target.closest('#bfNewClient')){bfClientEditor(null);return;}
 const edit=e.target.closest('[data-bf-edit-client]');if(edit){bfClientEditor(bfClientCatalog().find(c=>c.id===edit.dataset.bfEditClient));return;}
 const del=e.target.closest('[data-bf-delete-client]');if(del){bfDeleteClient(del.dataset.bfDeleteClient);return;}
 if(e.target.closest('#bfCancelClient')){bfRenderClients();return;}
 if(e.target.closest('#bfClientNewJob')){const active=bfClientCatalog().find(c=>c.id===root.dataset.selected);openNewJob();const inp=$('#jobForm [name="client"]');if(inp&&active)inp.value=active.name;return;}
});
async function bfDeleteClient(id){
 const root=$('#bfClients'),client=bfClientCatalog().find(c=>c.id===id);
 if(!client)return toast('Cliente non trovato.',true);
 const linked=bfClientJobs(client);
 const msg=linked.length
  ? `Eliminare la scheda cliente "${client.name}"?\n\nLe ${linked.length} commesse associate, i file e le ore di lavoro NON saranno cancellati. Rimarranno consultabili nella sezione Commesse.`
  : `Eliminare il cliente "${client.name}"? Questa azione rimuove la sua scheda dall'elenco clienti.`;
 if(!window.confirm(msg))return;
 // Soft delete survives merges with older copies from Google Drive.
 let record=(db.clients||[]).find(c=>c.id===client.id);
 if(!record){record={id:client.id,name:client.name,createdAt:now()};db.clients.push(record);}
 record.deleted=true;record.deletedAt=now();record.updatedAt=record.deletedAt;
 root.dataset.selected='';root.dataset.editing='';
 await saveAndSync('Cliente eliminato. Commesse e ore conservate.');
 switchView('clients');
}
document.addEventListener('input',e=>{if(e.target.id==='bfClientSearch'){const root=$('#bfClients'),pos=e.target.selectionStart;root.dataset.query=e.target.value;bfRenderClients();const el=$('#bfClientSearch');el.focus();el.setSelectionRange(pos,pos);}});
document.addEventListener('submit',async e=>{if(e.target.id!=='bfClientForm')return;e.preventDefault();const root=$('#bfClients'),data=Object.fromEntries(new FormData(e.target));data.name=String(data.name||'').trim();if(!data.name)return toast('Inserisci il nome del cliente.',true);const old=bfClientCatalog().find(c=>c.id===root.dataset.editing);const duplicate=(db.clients||[]).find(c=>!c.deleted&&c.id!==old?.id&&bfClientKey(c.name)===bfClientKey(data.name));if(duplicate)return toast('Un cliente con questo nome esiste già.',true);
 let record;if(old&&!old.legacy){record=db.clients.find(c=>c.id===old.id);const oldName=record.name;Object.assign(record,data,{updatedAt:now()});for(const j of db.jobs){if(j.clientId===record.id||(!j.clientId&&bfClientKey(j.client)===bfClientKey(oldName))){j.clientId=record.id;j.client=record.name;j.updatedAt=now();}}}
 else {record={id:`client_${Date.now()}_${Math.random().toString(36).slice(2)}`,...data,createdAt:now(),updatedAt:now()};db.clients.push(record);const match=old?.name||data.name;for(const j of db.jobs){if(!j.clientId&&bfClientKey(j.client)===bfClientKey(match)){j.clientId=record.id;j.client=record.name;j.updatedAt=now();}}}
 root.dataset.selected=record.id;root.dataset.editing='';await saveAndSync('Cliente salvato.');switchView('clients');});

function initEvents(){
  document.addEventListener('click',async e=>{
    const create=e.target.closest('[data-create-job]');if(create){openNewJob();return;}
    const nav=e.target.closest('[data-view]');if(nav){switchView(nav.dataset.view);return;}
    const open=e.target.closest('[data-open]');if(open){openDetail(open.dataset.open);return;}
    const upload=e.target.closest('[data-upload]');if(upload){try{await ensureConnected();pendingUploadCategory=upload.dataset.upload;pendingStepRole=$('#bfStepRole')?.value||'finished';const input=$('#hiddenFileInput');input.accept=ACCEPTS[pendingUploadCategory]||'';input.value='';input.click();}catch{}return;}
    const driveOpen=e.target.closest('[data-drive-open]');if(driveOpen){const id=driveOpen.dataset.driveOpen;if(id)window.open(BadfishDrive.driveFileUrl(id),'_blank','noopener');return;}
    const remove=e.target.closest('[data-file-remove]');if(remove){const job=db.jobs.find(j=>j.id===selectedJobId),file=job?.files.find(f=>f.id===remove.dataset.fileRemove);if(!job||!file)return;if(!confirm(`Rimuovere ${file.name}? Il file verrà eliminato anche da Google Drive.`))return;try{if(file.driveFileId){await ensureConnected();await BadfishDrive.deleteFile(file.driveFileId);}job.files=job.files.filter(f=>f.id!==file.id);job.updatedAt=now();await saveAndSync('File eliminato.');openDetail(job.id);}catch(err){toast(err.message,true);}return;}
  });
  $('#hiddenFileInput').addEventListener('change',async e=>{try{await uploadFiles([...e.target.files],pendingUploadCategory);}catch(err){toast(err.message,true);}});
  $('#newJobBtn').addEventListener('click',openNewJob);$('#closeModalBtn').addEventListener('click',closeNewJob);$('#cancelModalBtn').addEventListener('click',closeNewJob);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeNewJob();});$('#detailBackdrop').addEventListener('click',e=>{if(e.target.id==='detailBackdrop')closeDetail();});
  $('#jobSearch').addEventListener('input',renderJobs);$('#statusFilter').addEventListener('change',renderJobs);$('#fileSearch').addEventListener('input',renderFiles);$('#fileCategoryFilter').addEventListener('change',renderFiles);
  $('#jobForm').addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());if(db.jobs.some(j=>j.code.toLowerCase()===String(payload.code).trim().toLowerCase()))return toast('Esiste già una commessa con questo codice.',true);const job={id:`job_${Date.now()}_${Math.random().toString(16).slice(2)}`,code:String(payload.code).trim(),client:String(payload.client).trim(),clientId:bfClientIdForName(String(payload.client).trim()),article:String(payload.article).trim(),material:String(payload.material||'').trim(),quantity:Number(payload.quantity||0),dueDate:payload.dueDate||'',status:payload.status||'Da progettare',notes:payload.notes||'',createdAt:now(),updatedAt:now(),files:[]};db.jobs.unshift(job);closeNewJob();await saveAndSync('Commessa creata.');openDetail(job.id);});
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
  document.addEventListener('click',async e=>{
    const action=e.target.closest('#bfSaveDimensions,#bfStartTimer,#bfPauseTimer,#bfStopTimer,#bfAddManual');if(!action)return;
    const j=db.jobs.find(x=>x.id===selectedJobId);if(!j)return;
    if(action.id==='bfSaveDimensions'){
      const dim={};for(const kind of ['raw','finished']){
        const values=[...document.querySelectorAll(`[data-dimension="${kind}"]`)].map(input=>input.value.trim());
        if(values.some(v=>v!=='')){
          if(values.some(v=>v===''||!Number.isFinite(Number(v))||Number(v)<=0||Number(v)>100000)){toast('Inserisci tre misure positive valide per ciascun elemento.',true);return;}
          dim[kind]=values.map(Number);
        }else dim[kind]=[];
      }
      j.dimensions=dim;delete j.dimensionSources;
    }else if(action.id==='bfStartTimer'){
      if(j.timerStartedAt)return;j.timerStartedAt=now();j.timerPhase=$('#bfPhase').value;
    }else if(action.id==='bfPauseTimer'){
      if(!j.timerStartedAt)return;j.timerAccumulatedSeconds=bfRunningSeconds(j);delete j.timerStartedAt;
    }else if(action.id==='bfStopTimer'){
      if(!j.timerStartedAt&&!j.timerAccumulatedSeconds)return;
      const end=now(), seconds=bfRunningSeconds(j), minutes=seconds/60;
      j.workSessions=j.workSessions||[];
      j.workSessions.push({id:`session_${Date.now()}`,phase:j.timerPhase||'Lavorazione CNC',minutes,seconds,startedAt:j.timerStartedAt||null,endedAt:end});
      delete j.timerStartedAt;delete j.timerPhase;delete j.timerAccumulatedSeconds;
    }else if(action.id==='bfAddManual'){
      const h=Number($('#bfManualHours').value),m=Number($('#bfManualMinutes').value);
      if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>100000||m<0||m>59||h*60+m<=0){toast('Inserisci un tempo valido maggiore di zero.',true);return;}
      j.workSessions=j.workSessions||[];
      j.workSessions.push({id:`session_${Date.now()}`,phase:$('#bfPhase').value,minutes:h*60+m,seconds:(h*60+m)*60,createdAt:now(),endedAt:now(),manual:true});
    }
    j.updatedAt=now();await saveAndSync('Lavorazione aggiornata.');openDetail(j.id);
  });
  document.addEventListener('click',async e=>{
    const btn=e.target.closest('#bfAnalyzeNC');if(!btn)return;
    const input=$('#bfNcInput'),file=input?.files?.[0],margin=$('#bfNcMargin')?.value;
    if(!file)return toast('Seleziona prima un programma NC.',true);
    if(file.size>15*1024*1024)return toast('File NC troppo grande (max 15 MB).',true);
    const job=db.jobs.find(j=>j.id===selectedJobId);if(!job)return;
    try{const result=bfEstimateNC(await file.text(),margin);result.fileName=file.name;result.estimatedAt=now();job.ncEstimate=result;job.updatedAt=now();await saveAndSync('Stima NC salvata nella commessa.');openDetail(job.id);}
    catch(err){toast(err.message,true);}
  });
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-bf-remove-session]');if(!b)return;
    const job=db.jobs.find(j=>j.id===selectedJobId);if(!job)return;
    if(!confirm('Eliminare questa sessione di lavoro?'))return;
    job.workSessions=(job.workSessions||[]).filter(s=>s.id!==b.dataset.bfRemoveSession);job.updatedAt=now();await saveAndSync('Sessione eliminata.');openDetail(job.id);
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('#bfAnalyzeStep'))return;
    const input=$('#bfStepMeasureInput');if(input){input.value='';input.click();}
  });
  document.addEventListener('change',async e=>{
    if(e.target.id!=='bfStepMeasureInput')return;
    const file=e.target.files?.[0],role=$('#bfStepRole')?.value||'finished';
    const jobId=selectedJobId,job=db.jobs.find(j=>j.id===jobId);if(!file||!job)return;
    const status=$('#bfStepStatus');if(status)status.textContent='Analisi STEP in corso…';
    try{
      const dimensions=await bfReadStepDimensions(file);
      bfWriteMeasuredDimensions(job,role,dimensions,file.name);
      job.updatedAt=now();
      await saveAndSync(`Dimensioni ${role==='raw'?'grezzo':'pezzo finito'} lette da STEP e salvate.`);
      if(selectedJobId===jobId)openDetail(jobId);
    }catch(error){if(status)status.textContent=error.message;toast(error.message,true);}
  });
  window.setInterval(()=>{if(!selectedJobId)return;const j=db.jobs.find(x=>x.id===selectedJobId);const target=$('#bfTimerClock');if(target&&j?.timerStartedAt)target.textContent=bfClockFormat(bfRunningSeconds(j));},1000);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installPwaBtn').classList.remove('hidden');});$('#installPwaBtn').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installPwaBtn').classList.add('hidden');});
  window.addEventListener('online',()=>{const email=getPreferredGoogleEmail();setSyncState(BadfishDrive.isConnected()?'ok':'',BadfishDrive.isConnected()?'Drive collegato':'Online',email||'Pronto');if(BadfishDrive.isConnected())syncDrive(false).catch(()=>{});});window.addEventListener('offline',()=>setSyncState('','Modalità offline','Dati locali disponibili'));
}

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw-v65.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{}));


// v7.4 – financial estimate + printable QR labels. Attached to each job to reuse existing Drive merge.
const bfEuro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const bfFloat=v=>Math.max(0,Number.isFinite(Number(v))?Number(v):0);
function bfCostSummary(j,model){
 const hours=bfFloat(model.hoursMode==='manual'?model.hours:((bfSessionSeconds(j)+bfRunningSeconds(j))/3600));
 const labour=hours*bfFloat(model.hourlyRate),machine=hours*bfFloat(model.machineRate),materials=bfFloat(model.materials),other=bfFloat(model.other);
 const cost=labour+machine+materials+other,price=bfFloat(model.salePrice);
 return {hours,labour,machine,materials,other,cost,price,margin:price-cost,percent:price>0?(price-cost)/price*100:0};
}
function bfQuoteDefaults(j){return {hoursMode:'recorded',hours:0,hourlyRate:25,machineRate:5,materials:0,other:0,salePrice:0,description:j.article||'',validUntil:'',notes:'',...(j.estimate||{})};}
function bfBusinessPanel(j){
 const v=bfQuoteDefaults(j),s=bfCostSummary(j,v);
 return ` <div class="bf-business-panel"><h4>Etichetta QR della commessa</h4><div class="bf-qr-panel"><div class="bf-qr-box" id="bfQrDisplay"></div><div><p class="bf-invoice-note"><b>${esc(j.code)}</b> · ${esc(j.article)}<br>Scansiona per aprire questa commessa nel gestionale.</p><button type="button" class="btn primary" id="bfPrintQR">Stampa etichetta QR</button></div></div><p class="bf-invoice-note">Il codice contiene soltanto il link e l'identificativo della commessa, non i dati del cliente. L'accesso ai file Drive richiede le autorizzazioni necessarie.</p></div>`;
}
function bfJobUrl(j){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('job',j.id);return u.href;}
function bfQrMarkup(text){const qr=new window.BadfishQRCode(0,window.BadfishQRError.M);qr.addData(text);qr.make();const n=qr.getModuleCount(),cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))cells.push(`<rect x="${c+4}" y="${r+4}" width="1" height="1"/>`);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+8} ${n+8}" shape-rendering="crispEdges" role="img" aria-label="QR commessa"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells.join('')}</g></svg>`;}
function bfMountQR(){const j=db.jobs.find(x=>x.id===selectedJobId),root=$('#bfQrDisplay');if(j&&root){try{root.innerHTML=bfQrMarkup(bfJobUrl(j));}catch(e){root.textContent='QR non disponibile: '+e.message;}}}
function bfReadQuoteForm(){const get=id=>$('#'+id)?.value||'';return {description:get('bfQuoteDescription'),hoursMode:get('bfHoursMode'),hours:bfFloat(get('bfQuoteHours')),hourlyRate:bfFloat(get('bfHourlyRate')),machineRate:bfFloat(get('bfMachineRate')),materials:bfFloat(get('bfMaterials')),other:bfFloat(get('bfOtherCosts')),salePrice:bfFloat(get('bfSalePrice')),validUntil:get('bfQuoteUntil'),notes:get('bfQuoteNotes')};}
function bfUpdateQuotePreview(){const j=db.jobs.find(x=>x.id===selectedJobId),root=$('#bfQuoteResults');if(!j||!root)return;const s=bfCostSummary(j,bfReadQuoteForm());root.innerHTML=`<div><small>Ore considerate</small><strong>${s.hours.toFixed(2)} h</strong></div><div><small>Costo stimato</small><strong>${bfEuro(s.cost)}</strong></div><div><small>Margine lordo stimato</small><strong>${bfEuro(s.margin)}</strong></div>`;}
function bfPrintDocument(html){document.querySelector('.bf-print-area')?.remove();const page=document.createElement('section');page.className='bf-print-area';page.innerHTML=html;document.body.appendChild(page);window.print();}
const bfOrigOpenDetail=openDetail;
openDetail=function(id){bfOrigOpenDetail(id);bfMountQR();};
document.addEventListener('input',e=>{if(e.target.closest('#bfBusiness')&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))bfUpdateQuotePreview();});
document.addEventListener('change',e=>{if(e.target.closest('#bfBusiness'))bfUpdateQuotePreview();});
document.addEventListener('click',async e=>{
 const btn=e.target.closest('#bfSaveEstimate,#bfPrintEstimate,#bfPrintQR');if(!btn)return;
 const j=db.jobs.find(x=>x.id===selectedJobId);if(!j)return;
 if(btn.id==='bfSaveEstimate'){
   j.estimate={...bfReadQuoteForm(),updatedAt:now()};j.updatedAt=now();await saveAndSync('Preventivo salvato nella commessa.');openDetail(j.id);return;
 }
 if(btn.id==='bfPrintQR'){
   const svg=bfQrMarkup(bfJobUrl(j));bfPrintDocument(`<h1>BADFISH · ETICHETTA COMMESSA</h1><div class="bf-print-qr">${svg}</div><h2>${esc(j.code)}</h2><p>${esc(j.article)}</p><p class="bf-print-muted">${esc(j.material||'')} · ${formatDate(j.dueDate)}</p>`);return;
 }
 if(btn.id==='bfPrintEstimate'){
   const m=bfReadQuoteForm(),s=bfCostSummary(j,m);
   bfPrintDocument(`<h1>${esc(db.settings.companyName||'Badfish')} · PREVENTIVO</h1><p class="bf-print-muted">Creato il ${new Date().toLocaleDateString('it-IT')} · Rif. commessa ${esc(j.code)}</p><h2>Cliente: ${esc(j.client)}</h2><p>${esc(m.description)}</p><table><thead><tr><th>Descrizione</th><th>Quantità</th><th>Importo</th></tr></thead><tbody><tr><td>${esc(m.description||j.article)}</td><td>${esc(j.quantity||1)}</td><td>${bfEuro(s.price)}</td></tr></tbody></table><h2>Totale preventivato: ${bfEuro(s.price)}</h2><p>${m.validUntil?'Valido fino al '+formatDate(m.validUntil):''}</p><p>${esc(m.notes).replace(/\n/g,'<br>')}</p><p class="bf-print-muted">Prezzo indicativo. Imposte e condizioni fiscali da verificare prima dell'invio.</p>`);return;
 }
});


// v7.5 - Preventivi indipendenti e modificabili. Archivio nel DB sincronizzato con Drive.
let bfEditingQuoteId='';
function bfQuoteNew(){return {id:'quote_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),number:'PREV-'+new Date().getFullYear()+'-'+String((db.quotes||[]).filter(q=>!q.deleted).length+1).padStart(3,'0'),date:new Date().toISOString().slice(0,10),customer:'',subject:'',jobId:'',status:'Bozza',validUntil:'',intro:'',items:[{description:'',qty:1,unit:'pz',price:0}],notes:'',conditions:'',hours:0,labourRate:0,machineRate:0,materialCost:0,extraCost:0,createdAt:now(),updatedAt:now()};}
function bfQuoteSum(q){return (q.items||[]).reduce((n,i)=>n+(Number(i.qty)||0)*(Number(i.price)||0),0);}
function bfQuoteCost(q){return Math.max(0,Number(q.hours)||0)*(Math.max(0,Number(q.labourRate)||0)+Math.max(0,Number(q.machineRate)||0))+Math.max(0,Number(q.materialCost)||0)+Math.max(0,Number(q.extraCost)||0);}
function bfQuoteEscape(v){return esc(v??'');}
function bfRenderQuotes(){const root=$('#bfQuotes');if(!root)return;const all=(db.quotes||[]).filter(q=>!q.deleted).sort((a,b)=>dateMs(b.updatedAt)-dateMs(a.updatedAt));const q=bfEditingQuoteId?all.find(x=>x.id===bfEditingQuoteId):null;
root.innerHTML=`<div class="bf-quote-head"><button class="btn primary" id="bfQuoteNew">+ Nuovo preventivo</button><p class="bf-help">Crea un preventivo libero. Cliente e commessa sono facoltativi; descrizioni e importi sono scritti da te.</p></div><div class="bf-quote-layout"><article class="panel bf-quote-list"><h3>Preventivi salvati <small>(${all.length})</small></h3>${all.map(x=>`<button type="button" class="bf-quote-entry ${q?.id===x.id?'selected':''}" data-bf-open-quote="${bfQuoteEscape(x.id)}"><strong>${bfQuoteEscape(x.number)}</strong><span>${bfQuoteEscape(x.customer||'Cliente da definire')}</span><small>${bfQuoteEscape(x.subject||'Nessun oggetto')} · ${bfEuro(bfQuoteSum(x))}</small><small>${bfQuoteEscape(x.status||'Bozza')}</small></button>`).join('')||'<p class="bf-help">Nessun preventivo. Premi “Nuovo preventivo”.</p>'}${db.jobs.filter(j=>j.estimate).length?`<div class="bf-quote-old"><b>Preventivi precedenti</b><p>Quelli salvati dentro le commesse non vengono cancellati.</p>${db.jobs.filter(j=>j.estimate).map(j=>`<button class="btn subtle" data-bf-import-job="${bfQuoteEscape(j.id)}">Importa ${bfQuoteEscape(j.code)}</button>`).join('')}</div>`:''}</article><article class="panel bf-quote-editor">${q?bfQuoteForm(q):'<div class="bf-quote-empty"><h3>Il tuo spazio preventivi</h3><p>Apri un documento o creane uno. Puoi scrivere liberamente cosa stai proponendo, aggiungere righe e definire il prezzo.</p></div>'}</article></div>`;
}
function bfQuoteForm(q){return `<form id="bfQuoteIndependentForm" autocomplete="off"><div class="bf-heading-row"><h3>Modifica preventivo</h3><span class="bf-tag">${bfQuoteEscape(q.status)}</span></div><div class="bf-quote-fields"><label>Numero preventivo<input name="number" required maxlength="70" value="${bfQuoteEscape(q.number)}"></label><label>Data<input name="date" type="date" value="${bfQuoteEscape(q.date)}"></label><label>Cliente / destinatario<input name="customer" placeholder="Scrivi liberamente il destinatario" value="${bfQuoteEscape(q.customer)}"></label><label>Stato<select name="status">${['Bozza','Inviato','Accettato','Rifiutato'].map(v=>`<option ${q.status===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="bf-span-all">Oggetto o titolo<input name="subject" placeholder="Esempio: Taglio di pietre su misura" value="${bfQuoteEscape(q.subject)}"></label><label class="bf-span-all">Commessa associata (facoltativa)<select name="jobId"><option value="">Nessuna commessa: preventivo indipendente</option>${db.jobs.map(j=>`<option value="${bfQuoteEscape(j.id)}" ${q.jobId===j.id?'selected':''}>${bfQuoteEscape(j.code)} · ${bfQuoteEscape(j.article)}</option>`).join('')}</select></label><label>Validità fino al<input type="date" name="validUntil" value="${bfQuoteEscape(q.validUntil)}"></label><label class="bf-span-all">Presentazione / descrizione libera<textarea name="intro" rows="3" placeholder="Descrivi il lavoro come preferisci">${bfQuoteEscape(q.intro)}</textarea></label></div><h4>Voci del preventivo</h4><p class="bf-help">Aggiungi tutti gli articoli o servizi che vuoi, con quantità e importo unitario.</p><div class="bf-quote-items">${(q.items||[]).map((it,i)=>bfQuoteRow(it,i)).join('')}</div><button type="button" class="btn subtle" id="bfQuoteAddRow">+ Aggiungi riga</button><div class="bf-quote-total">Totale preventivo: <strong id="bfQuoteLiveTotal">${bfEuro(bfQuoteSum(q))}</strong></div><div class="bf-quote-fields"><label class="bf-span-all">Note per il cliente<textarea name="notes" rows="3">${bfQuoteEscape(q.notes)}</textarea></label><label class="bf-span-all">Condizioni / pagamenti<textarea name="conditions" rows="3">${bfQuoteEscape(q.conditions)}</textarea></label></div><details class="bf-quote-internal"><summary>Calcolo costi interni (non visibili nel PDF cliente)</summary><div class="bf-quote-fields">${[['hours','Ore previste'],['labourRate','Manodopera €/h'],['machineRate','Macchina €/h'],['materialCost','Materiali €'],['extraCost','Altri costi €']].map(([k,l])=>`<label>${l}<input type="number" min="0" step="0.01" name="${k}" value="${bfQuoteEscape(q[k]||0)}"></label>`).join('')}</div><p class="bf-help" id="bfQuoteCostSummary">Costo stimato ${bfEuro(bfQuoteCost(q))} · Margine stimato ${bfEuro(bfQuoteSum(q)-bfQuoteCost(q))}</p></details><div class="bf-quote-actions"><button type="submit" class="btn primary">Salva preventivo</button><button type="button" class="btn secondary" id="bfQuotePrint">Stampa / PDF</button><button type="button" class="btn danger" id="bfQuoteDelete">Elimina</button></div><p class="bf-help">Il PDF non è una fattura. Imposte ed eventuale IVA non vengono calcolate automaticamente.</p></form>`;}
function bfQuoteRow(it,i){return `<div class="bf-quote-line"><label>Descrizione<textarea data-qi="description" rows="2" placeholder="Lavorazione / materiale">${bfQuoteEscape(it.description)}</textarea></label><label>Quantità<input data-qi="qty" type="number" min="0" step="0.01" value="${bfQuoteEscape(it.qty)}"></label><label>Unità<input data-qi="unit" value="${bfQuoteEscape(it.unit)}" maxlength="15"></label><label>Prezzo unitario €<input data-qi="price" type="number" min="0" step="0.01" value="${bfQuoteEscape(it.price)}"></label><button type="button" class="bf-quote-remove" title="Elimina riga">×</button></div>`;}
function bfReadQuotePage(){const form=$('#bfQuoteIndependentForm');if(!form)throw Error('Apri prima un preventivo.');const fd=new FormData(form);const q=(db.quotes||[]).find(x=>x.id===bfEditingQuoteId);const result={...q};['number','date','customer','subject','jobId','status','validUntil','intro','notes','conditions'].forEach(k=>result[k]=String(fd.get(k)||''));['hours','labourRate','machineRate','materialCost','extraCost'].forEach(k=>result[k]=Math.max(0,Number(fd.get(k))||0));result.items=[...form.querySelectorAll('.bf-quote-line')].map(row=>{const get=k=>row.querySelector(`[data-qi="${k}"]`)?.value||'';return {description:get('description'),qty:Math.max(0,Number(get('qty'))||0),unit:get('unit'),price:Math.max(0,Number(get('price'))||0)};});return result;}
function bfQuotePreview(){if(!$('#bfQuoteIndependentForm'))return;try{const q=bfReadQuotePage();$('#bfQuoteLiveTotal').textContent=bfEuro(bfQuoteSum(q));$('#bfQuoteCostSummary').textContent=`Costo stimato ${bfEuro(bfQuoteCost(q))} · Margine stimato ${bfEuro(bfQuoteSum(q)-bfQuoteCost(q))}`;}catch{}}
function bfQuotePrintPage(q){const items=(q.items||[]).map(it=>`<tr><td>${esc(it.description).replace(/\n/g,'<br>')}</td><td>${esc(it.qty)} ${esc(it.unit)}</td><td>${bfEuro(it.price)}</td><td>${bfEuro((Number(it.qty)||0)*(Number(it.price)||0))}</td></tr>`).join('');bfPrintDocument(`<h1>${esc(db.settings.companyName||'Badfish')} · PREVENTIVO</h1><p>Preventivo ${esc(q.number)} · ${formatDate(q.date)}</p><h2>${esc(q.customer||'Destinatario da definire')}</h2><h3>${esc(q.subject)}</h3><p>${esc(q.intro).replace(/\n/g,'<br>')}</p><table><thead><tr><th>Descrizione</th><th>Quantità</th><th>Prezzo unitario</th><th>Importo</th></tr></thead><tbody>${items}</tbody></table><h2>Totale: ${bfEuro(bfQuoteSum(q))}</h2>${q.validUntil?`<p>Valido fino al ${formatDate(q.validUntil)}</p>`:''}<p>${esc(q.notes).replace(/\n/g,'<br>')}</p><p>${esc(q.conditions).replace(/\n/g,'<br>')}</p><p class="bf-print-muted">Documento di preventivo, non fattura fiscale. Imposte non specificate.</p>`);}
document.addEventListener('click',async e=>{
 const b=e.target.closest('#bfQuoteNew,[data-bf-open-quote],[data-bf-import-job],#bfQuoteAddRow,.bf-quote-remove,#bfQuotePrint,#bfQuoteDelete');if(!b)return;
 if(b.id==='bfQuoteNew'){const q=bfQuoteNew();db.quotes.push(q);bfEditingQuoteId=q.id;await saveAndSync('Bozza preventivo creata.');bfRenderQuotes();return;}
 if(b.dataset.bfOpenQuote){bfEditingQuoteId=b.dataset.bfOpenQuote;bfRenderQuotes();return;}
 if(b.dataset.bfImportJob){const j=db.jobs.find(j=>j.id===b.dataset.bfImportJob);if(!j)return;const v=bfQuoteDefaults(j),q=bfQuoteNew();Object.assign(q,{customer:j.client,subject:v.description||j.article,intro:v.description||'',jobId:j.id,validUntil:v.validUntil||'',notes:v.notes||'',items:[{description:v.description||j.article,qty:1,unit:'lavoro',price:Number(v.salePrice)||0}],hours:v.hoursMode==='manual'?v.hours:(bfSessionSeconds(j)+bfRunningSeconds(j))/3600,labourRate:v.hourlyRate,machineRate:v.machineRate,materialCost:v.materials,extraCost:v.other});db.quotes.push(q);bfEditingQuoteId=q.id;await saveAndSync('Preventivo precedente importato come copia.');bfRenderQuotes();return;}
 if(b.id==='bfQuoteAddRow'){const q=bfReadQuotePage();q.items.push({description:'',qty:1,unit:'pz',price:0});const old=db.quotes.find(x=>x.id===q.id);Object.assign(old,q);bfRenderQuotes();return;}
 if(b.classList.contains('bf-quote-remove')){const q=bfReadQuotePage();const i=[...$('#bfQuoteIndependentForm').querySelectorAll('.bf-quote-line')].indexOf(b.closest('.bf-quote-line'));q.items.splice(i,1);Object.assign(db.quotes.find(x=>x.id===q.id),q);bfRenderQuotes();return;}
 if(b.id==='bfQuotePrint'){const q=bfReadQuotePage();if(!q.number.trim()){toast('Inserisci un numero preventivo.',true);return;}bfQuotePrintPage(q);return;}
 if(b.id==='bfQuoteDelete'){const q=db.quotes.find(x=>x.id===bfEditingQuoteId);if(!q||!confirm(`Eliminare il preventivo ${q.number}?`))return;q.deleted=true;q.updatedAt=now();bfEditingQuoteId='';await saveAndSync('Preventivo eliminato.');bfRenderQuotes();return;}
});
document.addEventListener('input',e=>{if(e.target.closest('#bfQuoteIndependentForm'))bfQuotePreview();});
document.addEventListener('submit',async e=>{if(e.target.id!=='bfQuoteIndependentForm')return;e.preventDefault();const q=bfReadQuotePage();if(!q.number.trim()){toast('Inserisci il numero del preventivo.',true);return;}q.updatedAt=now();Object.assign(db.quotes.find(x=>x.id===q.id),q);await saveAndSync('Preventivo salvato.');bfRenderQuotes();});

function bootBadfish(){
  try {
    if (!window.BadfishDrive) throw new Error('Modulo Google Drive non caricato. Ricarica la pagina.');
    render();
    initEvents();
    const requestedView=new URLSearchParams(location.search).get('view');
    switchView(['jobs','files','settings','planner','notes','clients','quotes'].includes(requestedView)?requestedView:'dashboard');
    const jobLink=new URLSearchParams(location.search).get('job');if(jobLink){const linked=db.jobs.find(j=>j.id===jobLink);if(linked){switchView('jobs');openDetail(linked.id);}else toast('Commessa non presente sul dispositivo: sincronizza Google Drive.',true);}
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
