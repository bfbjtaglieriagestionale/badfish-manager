/* Badfish v8.0: statistiche in sola lettura. Non cambia il database. */
(function(){
'use strict';
let year=String(new Date().getFullYear()), selectedClient='';
const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
const fmt=n=>`${Math.floor(n/3600)}h ${String(Math.floor((n%3600)/60)).padStart(2,'0')}m`;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d:null};
const yOf=v=>{const d=stamp(v);return d?String(d.getFullYear()):''};
const moneyOf=q=>(q.items||[]).reduce((s,i)=>s+num(i.qty)*num(i.price),0);
const costOf=q=>num(q.hours)*(num(q.labourRate)+num(q.machineRate))+num(q.materialCost)+num(q.extraCost);
const dateLabel=(d)=>new Intl.DateTimeFormat('it-IT',{month:'short'}).format(d);
const done=j=>['Completata','Consegnata'].includes(j.status);
function create(){
 const root=document.getElementById('bf80StatsRoot');if(!root)return;
 const jobs=Array.isArray(db.jobs)?db.jobs:[];
 const quotes=(Array.isArray(db.quotes)?db.quotes:[]).filter(q=>!q.deleted);
 const clients=[...new Set([...jobs.map(j=>j.client||''),...quotes.map(q=>q.customer||'')].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
 const years=new Set([String(new Date().getFullYear())]);
 for(const j of jobs){for(const t of j.workSessions||[]){const y=yOf(t.endedAt||t.createdAt||t.startedAt);if(y)years.add(y)}}
 for(const q of quotes){if(yOf(q.date))years.add(yOf(q.date))}
 const jobsByClient=jobs.filter(j=>!selectedClient||(j.client||'')===selectedClient);
 const quotesByClient=quotes.filter(q=>!selectedClient||(q.customer||'')===selectedClient);
 const byMonth=Array.from({length:12},(_,i)=>({label:dateLabel(new Date(Number(year),i,1)),seconds:0,quotes:0}));
 let logged=0, completed=0, totalQuotes=0, accepted=0, estimatedCosts=0;
 const clientHours=new Map();let undated=0;
 for(const j of jobsByClient){
   if(done(j)&&yOf(j.updatedAt||j.createdAt)===year) completed++;
   for(const t of j.workSessions||[]){
     const d=stamp(t.endedAt||t.createdAt||t.startedAt);const seconds=num(t.seconds??(num(t.minutes)*60));
     if(!d){undated++;continue}
     if(String(d.getFullYear())!==year)continue;
     logged+=seconds;byMonth[d.getMonth()].seconds+=seconds;
     const client=j.client||'Non indicato';clientHours.set(client,(clientHours.get(client)||0)+seconds);
   }
 }
 const statuses=new Map();
 for(const q of quotesByClient){
    const d=stamp(q.date||q.createdAt);if(!d||String(d.getFullYear())!==year)continue;
    const val=moneyOf(q);totalQuotes+=val;byMonth[d.getMonth()].quotes+=val;
    const status=q.status||'Bozza';statuses.set(status,(statuses.get(status)||0)+1);
    if(status==='Accettato'){accepted+=val;estimatedCosts+=costOf(q)}
 }
 const active=jobsByClient.filter(j=>!done(j)).length;
 const maxHours=Math.max(1,...byMonth.map(x=>x.seconds));
 const maxMoney=Math.max(1,...byMonth.map(x=>x.quotes));
 const top=[...clientHours].sort((a,b)=>b[1]-a[1]).slice(0,8);
 const box=(label,v,detail)=>`<article class="bf80-kpi"><span>${safe(label)}</span><strong>${safe(v)}</strong><small>${safe(detail)}</small></article>`;
 const bars=(key,max,format)=>byMonth.map(m=>`<div class="bf80-bar-item"><div class="bf80-bar-track"><div class="bf80-bar" style="height:${Math.max(0,100*m[key]/max)}%" title="${safe(format(m[key]))}"></div></div><small>${safe(m.label)}</small></div>`).join('');
 root.innerHTML=`<header class="bf80-head"><div><span class="eyebrow">CONTROLLO AZIENDALE</span><h2>Statistiche Badfish</h2><p>Produzione, clienti e preventivi in un unico posto. Dati aggiornati dal tuo archivio.</p></div><button type="button" class="btn secondary" id="bf80Refresh">Aggiorna dati</button></header>
 <div class="bf80-filters"><label>Anno<select id="bf80Year">${[...years].sort((a,b)=>b.localeCompare(a)).map(y=>`<option value="${safe(y)}" ${y===year?'selected':''}>${safe(y)}</option>`).join('')}</select></label><label>Cliente<select id="bf80Client"><option value="">Tutti i clienti</option>${clients.map(c=>`<option value="${safe(c)}" ${c===selectedClient?'selected':''}>${safe(c)}</option>`).join('')}</select></label></div>
 <div class="bf80-kpis">${box('Ore registrate',fmt(logged),'Sessioni concluse nell’anno')}${box('Commesse completate',String(completed),'Secondo ultimo aggiornamento')}${box('Commesse non concluse',String(active),'Stato attuale, non limitato all’anno')}${box('Preventivi accettati',money(accepted),'Valore proposto, non incassato')}</div>
 <div class="bf80-panels"><section class="panel bf80-panel"><h3>Ore lavorate per mese</h3><p>Assegnate alla data di fine sessione.</p><div class="bf80-bars">${bars('seconds',maxHours,fmt)}</div></section><section class="panel bf80-panel"><h3>Valore preventivi per mese</h3><p>Include tutti gli stati, sulla base della data del documento.</p><div class="bf80-bars bf80-bars-money">${bars('quotes',maxMoney,money)}</div></section></div>
 <div class="bf80-panels"><section class="panel bf80-panel"><h3>Ore per cliente</h3>${top.length?`<div class="bf80-client-list">${top.map(([c,s])=>`<div class="bf80-client"><span>${safe(c)}</span><strong>${fmt(s)}</strong></div>`).join('')}</div>`:'<p>Nessuna sessione registrata nel periodo.</p>'}</section><section class="panel bf80-panel"><h3>Preventivi e costi</h3><div class="bf80-money-lines"><div><span>Valore preventivi emessi/bozze</span><strong>${money(totalQuotes)}</strong></div><div><span>Di cui accettati</span><strong>${money(accepted)}</strong></div><div><span>Costi stimati sui preventivi accettati</span><strong>${money(estimatedCosts)}</strong></div><div><span>Differenza stimata</span><strong>${money(accepted-estimatedCosts)}</strong></div></div><p class="bf80-sub">Stati: ${[...statuses].map(([s,n])=>`${safe(s)} (${n})`).join(' · ')||'Nessun preventivo'}</p></section></div>
 <p class="bf80-note">I valori economici non rappresentano fatturato, incassi o utile netto. I costi sono quelli inseriti nei preventivi e possono essere incompleti. Non vengono conteggiate ore di cronometri in corso o in pausa; ${undated} sessioni senza data valida escluse. Le commesse completate sono attribuite alla data dell'ultimo aggiornamento, non a una data di completamento verificata. Le sessioni a cavallo di due giorni sono conteggiate alla chiusura.</p>`;
 root.querySelector('#bf80Year').addEventListener('change',e=>{year=e.target.value;create()});
 root.querySelector('#bf80Client').addEventListener('change',e=>{selectedClient=e.target.value;create()});
 root.querySelector('#bf80Refresh').addEventListener('click',create);
}
window.bf80RenderStats=create;
})();
