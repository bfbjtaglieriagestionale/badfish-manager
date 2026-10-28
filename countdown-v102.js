/* Conto alla rovescia persistente. Le ore lavorate non vengono modificate. */
(() => {
  let audio;
  let activeMarkup = "";
  function reference(job) {
    const source = db.jobs.find(j => j.id === job.repeatedFrom?.id);
    const seconds = (source?.workSessions || []).filter(s => s.phase === 'Lavorazione CNC').reduce((n,s) => n + Math.max(0, Number(s.seconds ?? Number(s.minutes || 0)*60) || 0),0);
    return seconds || Number(job.cncReferenceSeconds) || 0;
  }
  function remaining(timer) { return timer?.endAt ? Math.max(0, Math.ceil((timer.endAt-Date.now())/1000)) : Math.max(0, timer?.remaining || 0); }
  function panel(job) {
    const seconds = reference(job), t = job.countdown;
    return `<section class="bf103-cnc"><div class="bf103-heading"><span class="eyebrow">LAVORAZIONE CNC</span><span class="bf103-state">${t?.finished ? 'Tempo terminato' : t?.endAt ? 'In corso' : t?.remaining ? 'In pausa' : 'Pronta'}</span></div><h3>${esc(t?.label || job.article || 'Lavorazione')}</h3><p class="bf-help">${seconds ? `Riferimento precedente: ${bfClockFormat(seconds)}` : 'Imposta la durata prevista della lavorazione.'}</p><div class="bf103-fields"><label class="field-label">Nome del passaggio<input id="bf103Label" value="${esc(t?.label || job.article || '')}" maxlength="120" ${t?.endAt || t?.remaining ? 'disabled' : ''}></label><label class="field-label">Durata · minuti<input id="bf102Minutes" type="number" min="0.0167" step="any" value="${Number(((t?.durationSeconds || t?.remaining || seconds || 60)/60).toFixed(4))}" ${t?.endAt || t?.remaining ? 'disabled' : ''}></label></div><strong id="bf102Clock" class="bf103-clock" role="timer">${bfClockFormat(remaining(t) || (!t ? seconds : 0))}</strong><p id="bf102State" role="status">${t?.finished ? 'Controlla la macchina e conferma la fine.' : t?.endAt ? 'Fine prevista alle ' + new Date(t.endAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : t?.remaining ? 'Lavorazione in pausa' : 'Pronta per partire'}</p><div class="bf-clock-actions">${!t?.endAt && !t?.finished ? `<button type="button" class="btn primary" data-countdown="start">${t?.remaining ? 'Riprendi' : 'Avvia lavorazione'}</button>` : ''}${t?.endAt ? '<button type="button" class="btn secondary" data-countdown="pause">Pausa</button>' : ''}${t ? `<button type="button" class="btn subtle" data-countdown="cancel">${t.finished ? 'Conferma fine' : 'Annulla'}</button>` : ''}</div><details><summary>Avvisi e informazioni</summary><button type="button" class="btn subtle" data-countdown="notify">Abilita avvisi locali</button><p class="bf-help">Le ore effettive restano separate. La durata precedente può comprendere più pezzi o passaggi: controllala prima di avviare. Gli avvisi a pagina chiusa richiedono il servizio push, non ancora collegato.</p></details></section>`;
  }
  const original = bfTimerPanel;
  bfTimerPanel = function(job) { const html = original(job); const at = html.lastIndexOf("</section>"); return html.slice(0, at) + panel(job) + html.slice(at); };
  function sound() {
    if (!audio) return;
    audio.resume().catch(()=>{});
    for(let i=0;i<3;i++) { const o=audio.createOscillator(),g=audio.createGain(); o.connect(g);g.connect(audio.destination);o.frequency.value=880;g.gain.value=.15;o.start(audio.currentTime+i*.5);o.stop(audio.currentTime+i*.5+.25); }
  }
  document.addEventListener('click', async event => {
    const button=event.target.closest('[data-countdown]'); if(!button)return;
    const job=db.jobs.find(j=>j.id===selectedJobId); if(!job)return;
    const action=button.dataset.countdown;
    if(action==='notify') {
      if(!('Notification' in window)) return toast('Notifiche non disponibili in questo browser.',true);
      try { const permission=await Notification.requestPermission();toast(permission==='granted'?'Notifiche abilitate.':'Notifiche non abilitate.'); } catch { toast('Notifiche non disponibili. Usa il suono con la pagina aperta.',true); } return;
    }
    const previous=job.countdown ? {...job.countdown}:undefined, updated=job.updatedAt;
    if(action==='start') {
      if(job.countdown?.endAt)return;
      const seconds=job.countdown?.remaining || Math.round(Number(document.getElementById('bf102Minutes').value)*60);
      if(!Number.isSafeInteger(seconds)||seconds<=0||seconds>31536000)return toast('Inserisci una durata valida, entro un anno.',true);
      try { audio ||= new (window.AudioContext || window.webkitAudioContext)();await audio.resume(); } catch {}
      job.countdown={endAt:Date.now()+seconds*1000,remaining:seconds,durationSeconds:job.countdown?.durationSeconds || seconds,finished:false,label:job.countdown?.label || document.getElementById("bf103Label").value.trim()};
    } else if(action==='pause') {
      if(!job.countdown?.endAt)return;
      const seconds=remaining(job.countdown);
      if(!seconds) {tick();return;}
      job.countdown={...job.countdown,endAt:null,remaining:seconds,finished:false};
    } else delete job.countdown;
    job.updatedAt=now();
    try {await saveAndSync('Conto alla rovescia salvato.');if(selectedJobId===job.id)openDetail(job.id);} catch {job.countdown=previous;job.updatedAt=updated;toast('Impossibile salvare il conto alla rovescia.',true);}
  });
  function tick() {
    let completed = false;
    for(const job of db.jobs) {
      const t=job.countdown;
      if(!t?.endAt || remaining(t)>0)continue;
      const old={...t},updated=job.updatedAt;
      job.countdown={...t,endAt:null,remaining:0,finished:true};job.updatedAt=now();
      try {persistLocal({renderNow:false});}catch {job.countdown=old;job.updatedAt=updated;continue;}
      completed = true;
      sound();toast(`Tempo CNC terminato: ${job.code}`);
      if('Notification' in window && Notification.permission==='granted')try {const n=new Notification('Badfish · Tempo CNC terminato',{body:`Commessa ${job.code}`,tag:`cnc-${job.id}`});n.onclick=()=>{window.focus();openDetail(job.id);};} catch {}
    }
    const job=db.jobs.find(j=>j.id===selectedJobId),clock=document.getElementById('bf102Clock'),state=document.getElementById('bf102State');
    if(clock && job) clock.textContent=bfClockFormat(job.countdown ? remaining(job.countdown) : reference(job));
    if(state && job?.countdown?.finished) {
      state.textContent='Tempo terminato: controlla la macchina e conferma la fine.';
      const section=state.closest('.bf103-cnc');
      const badge=section?.querySelector('.bf103-state');
      if(badge) badge.textContent='Tempo terminato';
      if(section?.querySelector('[data-countdown="pause"]')) {
        section.querySelector('.bf-clock-actions').innerHTML='<button type="button" class="btn subtle" data-countdown="cancel">Conferma fine</button>';
        section.querySelectorAll('input').forEach(input=>input.disabled=false);
      }
    }
    // La scadenza è una modifica e deve raggiungere anche Drive.
    if(completed && BadfishDrive.isConnected() && navigator.onLine) {
      syncDrive(false).catch(()=>toast('Fine CNC salvata sul dispositivo. Sincronizzazione Drive da riprovare.',true));
    }
    renderActive();
  }
  function renderActive() {
    let root=document.getElementById('bf103Active');
    if(!root) { const anchor=document.getElementById('bf99Deliveries');if(!anchor)return;root=document.createElement('section');root.id='bf103Active';root.className='panel bf103-active';anchor.before(root); }
    const jobs=db.jobs.filter(j=>j.countdown).sort((a,b)=>(a.countdown.endAt || Infinity)-(b.countdown.endAt || Infinity));
    const html=`<span class="eyebrow">AL BANCO</span><h3>Lavorazioni CNC</h3>${jobs.length ? jobs.map(j=>`<button type="button" class="bf103-machine ${j.countdown.finished ? 'is-finished' : ''}" data-open="${esc(j.id)}"><span><b>${esc(j.code)} · ${esc(j.countdown.label || j.article)}</b><small>${j.countdown.finished ? 'Tempo terminato · controlla la macchina' : j.countdown.endAt ? 'Fine prevista alle '+new Date(j.countdown.endAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : 'In pausa'}</small></span><strong>${bfClockFormat(remaining(j.countdown))}</strong></button>`).join('') : '<p class="bf-help">Nessuna lavorazione avviata. Apri una commessa e vai in Ore di lavoro per partire.</p>'}`;
    // Aggiorna i secondi senza sostituire pulsanti: niente perdita di focus/click.
    const markup=JSON.stringify(jobs.map(j=>[j.id,j.code,j.article,j.countdown]));
    if(activeMarkup!==markup || !root.firstElementChild) {
      root.innerHTML=html;
      activeMarkup=markup;
    } else {
      root.querySelectorAll('[data-open]').forEach(button=>{
        const job=jobs.find(j=>j.id===button.dataset.open);
        const clock=button.querySelector('strong');
        if(clock && job) clock.textContent=bfClockFormat(remaining(job.countdown));
      });
    }
  }
  renderActive();
  setInterval(tick,1000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
})();
