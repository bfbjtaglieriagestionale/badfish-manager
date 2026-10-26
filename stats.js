/* Badfish v92: statistiche per anno, mese e cliente. Sola lettura. */
(function () {
  'use strict';
  let year = String(new Date().getFullYear()), month = '', selectedClient = '';
  const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const money = n => new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'}).format(n);
  const fmt = n => `${Math.floor(n/3600)}h ${String(Math.floor((n%3600)/60)).padStart(2,'0')}m`;
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
  const stamp = v => {
    if (v == null || v === '') return null;
    // Date-only documents belong to their calendar day, independent of UTC offsets.
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y,m,d] = v.split('-').map(Number), date = new Date(y,m-1,d);
      return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d ? date : null;
    }
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  const sessionDate = t => stamp(t.endedAt || t.createdAt || t.startedAt);
  const jobDate = j => stamp(j.updatedAt || j.createdAt);
  const quoteDate = q => stamp(q.date || q.createdAt);
  const moneyOf = q => (q.items || []).reduce((s,i) => s + num(i.qty)*num(i.price),0);
  const costOf = q => num(q.hours)*(num(q.labourRate)+num(q.machineRate))+num(q.materialCost)+num(q.extraCost);
  const done = j => ['Completata','Consegnata'].includes(j.status);
  function create(focusId) {
    const root = document.getElementById('bf80StatsRoot');
    if (!root) return;
    const jobs = Array.isArray(db.jobs) ? db.jobs : [];
    const quotes = (Array.isArray(db.quotes) ? db.quotes : []).filter(q => !q.deleted);
    const clients = [...new Set([...jobs.map(j=>j.client || ''),...quotes.map(q=>q.customer || '')].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
    if (selectedClient && !clients.includes(selectedClient)) selectedClient = '';
    const years = new Set([String(new Date().getFullYear()),year]);
    const addYear = d => {if(d) years.add(String(d.getFullYear()));};
    for (const j of jobs) {addYear(jobDate(j)); for (const t of j.workSessions || []) addYear(sessionDate(t));}
    for (const q of quotes) addYear(quoteDate(q));
    const inYear = d => d && String(d.getFullYear()) === year;
    const inPeriod = d => inYear(d) && (month === '' || d.getMonth() === Number(month));
    const period = month === '' ? `Anno ${year}` : `${months[Number(month)]} ${year}`;
    const jobsByClient = jobs.filter(j=>!selectedClient || (j.client || '') === selectedClient);
    const quotesByClient = quotes.filter(q=>!selectedClient || (q.customer || '') === selectedClient);
    const daily = month !== '';
    const buckets = Array.from({length: daily ? new Date(Number(year),Number(month)+1,0).getDate() : 12}, (_,i)=>({
      label: daily ? String(i+1) : months[i].slice(0,3).toLowerCase(),
      fullLabel: daily ? `${i+1} ${months[Number(month)].toLowerCase()}` : months[i],
      seconds:0, quotes:0, count:0, completed:0
    }));
    const bucketOf = d => buckets[daily ? d.getDate()-1 : d.getMonth()];
    let logged=0, completed=0, totalQuotes=0, accepted=0, estimatedCosts=0, quoteCount=0, acceptedCount=0, undated=0;
    const clientHours = new Map(), statuses = new Map(), workedJobs = new Set();
    for (const j of jobsByClient) {
      const jd = jobDate(j);
      if (done(j) && inPeriod(jd)) {completed++; bucketOf(jd).completed++;}
      for (const t of j.workSessions || []) {
        const d=sessionDate(t), seconds=num(t.seconds ?? num(t.minutes)*60);
        if (!d) {undated++; continue;}
        if (!inPeriod(d)) continue;
        logged+=seconds; bucketOf(d).seconds+=seconds;
        if (seconds>0) {
          workedJobs.add(j);
          const client=j.client || 'Non indicato';
          clientHours.set(client,(clientHours.get(client)||0)+seconds);
        }
      }
    }
    for (const q of quotesByClient) {
      const d=quoteDate(q);
      if (!inPeriod(d)) continue;
      const value=moneyOf(q), status=q.status || 'Bozza';
      quoteCount++; totalQuotes+=value;
      bucketOf(d).quotes+=value; bucketOf(d).count++;
      statuses.set(status,(statuses.get(status)||0)+1);
      if (status==='Accettato') {acceptedCount++; accepted+=value; estimatedCosts+=costOf(q);}
    }
    const active=jobsByClient.filter(j=>!done(j)).length;
    const top=[...clientHours].sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxClient=Math.max(1,...top.map(x=>x[1]));
    const box=(label,value,detail)=>`<article class="bf80-kpi"><span>${safe(label)}</span><strong>${safe(value)}</strong><small>${safe(detail)}</small></article>`;
    const bars=(key,format)=>{
      const max=Math.max(1,...buckets.map(b=>b[key]));
      return buckets.map(b=>`<div class="bf80-bar-item" role="img" aria-label="${safe(b.fullLabel+': '+format(b[key]))}" title="${safe(b.fullLabel+': '+format(b[key]))}"><div class="bf80-bar-track"><div class="bf80-bar" style="height:${100*b[key]/max}%"></div></div><small>${safe(b.label)}</small></div>`).join('');
    };
    root.innerHTML=`<header class="bf80-head"><div><span class="eyebrow">CONTROLLO AZIENDALE</span><h2>Statistiche aziendali</h2><p>Ore di lavoro, commesse e preventivi del periodo che scegli.</p></div><button type="button" class="btn secondary" id="bf80Refresh">Aggiorna dati</button></header>
    <div class="bf80-filters bf92-filters"><label>Anno<select id="bf80Year">${[...years].sort((a,b)=>Number(b)-Number(a)).map(y=>`<option value="${safe(y)}" ${y===year?'selected':''}>${safe(y)}</option>`).join('')}</select></label><label>Mese<select id="bf92Month"><option value="">Tutto l’anno</option>${months.map((m,i)=>`<option value="${i}" ${String(i)===month?'selected':''}>${m}</option>`).join('')}</select></label><label>Cliente<select id="bf80Client"><option value="">Tutti i clienti</option>${clients.map(c=>`<option value="${safe(c)}" ${c===selectedClient?'selected':''}>${safe(c)}</option>`).join('')}</select></label><button class="btn secondary" type="button" id="bf92Today">Questo mese</button></div>
    <div class="bf92-period" role="status"><div><span class="eyebrow">PERIODO SELEZIONATO</span><h3>${safe(period)}</h3><span>${safe(selectedClient || 'Tutti i clienti')} · ${workedJobs.size} commesse con ore registrate</span></div><div class="bf92-current"><strong>${active}</strong> commesse aperte oggi<small>Situazione attuale${selectedClient?' del cliente':''}, fuori dal filtro periodo</small></div></div>
    <div class="bf80-kpis">${box('Ore lavorate',fmt(logged),'Sessioni registrate nel periodo')}${box('Commesse completate',String(completed),'In base all’ultimo aggiornamento')}${box('Preventivi nel periodo',String(quoteCount),`Valore complessivo ${money(totalQuotes)}`)}${box('Preventivi accettati',money(accepted),`${acceptedCount} su ${quoteCount} preventivi del periodo`)}</div>
    ${!logged&&!completed&&!quoteCount?'<p class="bf92-empty">Nessun dato nel periodo selezionato. Prova un altro mese, anno o cliente.</p>':''}
    <div class="bf80-panels"><section class="panel bf80-panel"><h3>Ore lavorate ${daily?'per giorno':'per mese'}</h3><p>Totale periodo: <strong>${fmt(logged)}</strong></p><div class="bf92-chart-scroll"><div class="bf80-bars ${daily?'bf92-daily':''}">${bars('seconds',fmt)}</div></div>${daily?'<small class="bf92-scroll-hint">Scorri il grafico per vedere tutti i giorni →</small>':''}</section><section class="panel bf80-panel"><h3>Valore preventivi ${daily?'per giorno':'per mese'}</h3><p>Tutti gli stati, bozze comprese · ${money(totalQuotes)}</p><div class="bf92-chart-scroll"><div class="bf80-bars bf80-bars-money ${daily?'bf92-daily':''}">${bars('quotes',money)}</div></div>${daily?'<small class="bf92-scroll-hint">Scorri il grafico per vedere tutti i giorni →</small>':''}</section></div>
    <div class="bf80-panels"><section class="panel bf80-panel"><h3>Ore per cliente</h3><p>${clientHours.size>8?'Primi 8 clienti per ore lavorate':'Distribuzione delle ore nel periodo'}</p>${top.length?`<div class="bf80-client-list">${top.map(([c,s])=>`<div class="bf92-client"><div class="bf80-client"><span>${safe(c)}</span><strong>${fmt(s)} <small>${Math.round(100*s/Math.max(1,logged))}%</small></strong></div><div class="bf92-client-track"><span style="width:${100*s/maxClient}%"></span></div></div>`).join('')}</div>`:'<p class="bf92-empty">Nessuna ora registrata nel periodo.</p>'}</section><section class="panel bf80-panel"><h3>Preventivi e costi stimati</h3><div class="bf80-money-lines"><div><span>Valore di tutti i preventivi</span><strong>${money(totalQuotes)}</strong></div><div><span>Di cui accettati</span><strong>${money(accepted)}</strong></div><div><span>Costi stimati sugli accettati</span><strong>${money(estimatedCosts)}</strong></div><div class="bf92-margin"><span>Margine stimato sugli accettati</span><strong>${money(accepted-estimatedCosts)}</strong></div></div><div class="bf92-statuses">${[...statuses].map(([s,n])=>`<span>${safe(s)} <b>${n}</b></span>`).join('')||'<p>Nessun preventivo nel periodo.</p>'}</div></section></div>
    <details class="panel bf80-panel bf92-detail"><summary>Dettaglio ${daily?'giornaliero':'mensile'} · valori esatti</summary><div class="bf92-table-scroll"><table class="bf92-table"><caption>${safe(period)} · ${safe(selectedClient || 'Tutti i clienti')}</caption><thead><tr><th scope="col">${daily?'Giorno':'Mese'}</th><th scope="col">Ore lavorate</th><th scope="col">Completate*</th><th scope="col">Preventivi</th><th scope="col">Valore preventivi</th></tr></thead><tbody>${buckets.map(b=>`<tr><th scope="row">${safe(b.fullLabel)}</th><td>${fmt(b.seconds)}</td><td>${b.completed}</td><td>${b.count}</td><td>${money(b.quotes)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Totale</th><td>${fmt(logged)}</td><td>${completed}</td><td>${quoteCount}</td><td>${money(totalQuotes)}</td></tr></tfoot></table></div></details>
    <details class="bf92-method"><summary>Come vengono calcolati i dati</summary><p class="bf80-note">Le ore sono attribuite alla data di fine sessione (o alla data di inserimento per le ore manuali). I cronometri in corso o in pausa non sono inclusi. Le sessioni a cavallo di più giorni sono conteggiate alla chiusura. ${undated} sessioni senza data valida escluse nell’archivio${selectedClient?' del cliente':''}.<br>* Le commesse attualmente completate o consegnate sono attribuite all’ultimo aggiornamento: non è disponibile una data di completamento verificata.<br>I preventivi sono filtrati per data del documento, con ripiego sulla data di creazione, e classificati in base allo stato attuale. I valori non rappresentano fatturato, incassi o utile netto. I costi inseriti nei preventivi possono essere incompleti.</p></details>`;
    const bind=(id,update)=>root.querySelector('#'+id).addEventListener('change',e=>{update(e.target.value);create(id);});
    bind('bf80Year',v=>{year=v;});
    bind('bf92Month',v=>{month=v;});
    bind('bf80Client',v=>{selectedClient=v;});
    root.querySelector('#bf80Refresh').addEventListener('click',()=>create('bf80Refresh'));
    root.querySelector('#bf92Today').addEventListener('click',()=>{const now=new Date();year=String(now.getFullYear());month=String(now.getMonth());create('bf92Today');});
    if (typeof focusId === 'string') root.querySelector('#'+focusId)?.focus({preventScroll:true});
  }
  window.bf80RenderStats=create;
})();
