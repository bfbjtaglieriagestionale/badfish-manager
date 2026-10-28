/* Conto alla rovescia persistente. Le ore lavorate non vengono modificate. */
(() => {
  let audio;
  function reference(job) {
    const source = db.jobs.find(j => j.id === job.repeatedFrom?.id);
    const seconds = (source?.workSessions || []).filter(s => s.phase === 'Lavorazione CNC').reduce((n,s) => n + Math.max(0, Number(s.seconds ?? Number(s.minutes || 0)*60) || 0),0);
    return seconds || Number(job.cncReferenceSeconds) || 0;
  }
  function remaining(timer) { return timer?.endAt ? Math.max(0, Math.ceil((timer.endAt-Date.now())/1000)) : Math.max(0, timer?.remaining || 0); }
  function panel(job) {
    const seconds = reference(job), t = job.countdown;
    return `<section class="detail-section"><h4>Conto alla rovescia CNC</h4><p class="bf-help">Tempo CNC precedente: ${bfClockFormat(seconds)}. Durata riferita alla lavorazione precedente: verifica quantità e setup. Non registra ore lavorate.</p><label class="field-label">Durata in minuti<input id="bf102Minutes" type="number" min="0.0167" step="any" value="${Math.max(1,Math.round(seconds/60*100)/100)}" ${t?.endAt || t?.remaining ? 'disabled' : ''}></label><strong id="bf102Clock" role="timer">${bfClockFormat(remaining(t))}</strong><p id="bf102State" role="status">${t?.finished ? 'Tempo terminato' : t?.endAt ? 'In corso' : t?.remaining ? 'In pausa' : 'Pronto'}</p><div class="bf-clock-actions"><button type="button" class="btn primary" data-countdown="start">${t?.endAt ? 'In corso' : t?.remaining ? 'Riprendi' : 'Avvia conto alla rovescia'}</button><button type="button" class="btn secondary" data-countdown="pause">Pausa</button><button type="button" class="btn subtle" data-countdown="cancel">Annulla</button></div><button type="button" class="btn subtle" data-countdown="notify">Abilita notifiche</button><p class="bf-help">L’avviso sonoro richiede la pagina aperta. A telefono bloccato o app chiusa l’avviso non è garantito; alla riapertura viene rilevata la scadenza.</p></section>`;
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
      job.countdown={endAt:Date.now()+seconds*1000,remaining:seconds,finished:false};
    } else if(action==='pause') {
      if(!job.countdown?.endAt)return;
      const seconds=remaining(job.countdown);
      if(!seconds) {tick();return;}
      job.countdown={remaining:seconds,finished:false};
    } else delete job.countdown;
    job.updatedAt=now();
    try {await saveAndSync('Conto alla rovescia salvato.');if(selectedJobId===job.id)openDetail(job.id);} catch {job.countdown=previous;job.updatedAt=updated;toast('Impossibile salvare il conto alla rovescia.',true);}
  });
  function tick() {
    for(const job of db.jobs) {
      const t=job.countdown;
      if(!t?.endAt || remaining(t)>0)continue;
      const old={...t},updated=job.updatedAt;
      job.countdown={remaining:0,finished:true};job.updatedAt=now();
      try {persistLocal({renderNow:false});}catch {job.countdown=old;job.updatedAt=updated;continue;}
      sound();toast(`Tempo CNC terminato: ${job.code}`);
      if('Notification' in window && Notification.permission==='granted')try {const n=new Notification('Badfish · Tempo CNC terminato',{body:`Commessa ${job.code}`,tag:`cnc-${job.id}`});n.onclick=()=>{window.focus();openDetail(job.id);};} catch {}
    }
    const job=db.jobs.find(j=>j.id===selectedJobId),clock=document.getElementById('bf102Clock'),state=document.getElementById('bf102State');
    if(clock)clock.textContent=bfClockFormat(remaining(job?.countdown));
    if(state&&job?.countdown?.finished)state.textContent='Tempo terminato';
  }
  setInterval(tick,1000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
})();
