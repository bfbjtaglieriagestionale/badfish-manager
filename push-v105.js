/* Web Push: credenziali solo su questo dispositivo, mai nel database Drive o nei backup. */
(() => {
  'use strict';
  const KEY = 'badfish_push_device_v105';
  let settings = {}, timer, chain = Promise.resolve(), synced = new Map();
  try { settings = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  settings.deviceId ||= crypto.randomUUID();
  const configured = () => !!(settings.url && settings.token);
  const save = () => localStorage.setItem(KEY, JSON.stringify(settings));
  function message(text, error = false) {
    const el = document.getElementById('bf105PushStatus'); if (el) { el.textContent = text; el.classList.toggle('bf105-error', error); }
  }
  function validURL(value) {
    const u = new URL(value);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname))) throw Error('Il servizio deve avere un indirizzo HTTPS.');
    if (u.username || u.password || u.search || u.hash) throw Error('Usa l’indirizzo del servizio senza credenziali o parametri.');
    return u.href.replace(/\/$/, '');
  }
  async function request(path, body, method = 'POST', config = settings) {
    if (!(config.url && config.token)) throw Error('Configura prima il servizio notifiche.');
    const response = await fetch(config.url + path, {method, headers: {'Content-Type':'application/json', Authorization:'Bearer ' + config.token}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000), cache:'no-store', credentials:'omit', redirect:'error'});
    let result = {}; try { result = await response.json(); } catch {}
    if (!response.ok) throw Error(response.status === 401 ? 'Codice di collegamento non valido.' : result.error || `Servizio notifiche non disponibile (${response.status}).`);
    return result;
  }
  function record(job) {
    const t = job.countdown;
    return {id:job.id, revision:job.updatedAt || job.createdAt, runId:t?.runId || (t?.endAt || t?.dueAt ? 'legacy-'+(t.dueAt || t.endAt) : ''), endAt:t?.finished ? t.dueAt || null : t?.endAt || null,
      code:String(job.code || '').slice(0,120), label:String(t?.label || job.article || '').slice(0,160), machine:job.machineId ? String(window.BadfishMachines?.name(job.machineId) || '').slice(0,100) : ''};
  }
  async function reconcile() {
    if (!configured()) return;
    const records = db.jobs.map(record).concat((db.deletedJobs || []).map(j => ({id:j.id, revision:j.deletedAt, runId:'', endAt:null, code:'', label:'', machine:''})));
    const changed = records.filter(r => synced.get(r.id) !== JSON.stringify(r));
    if (!changed.length) return;
    if (!navigator.onLine) throw Error('Avvisi da aggiornare: sei offline. Una pausa o un annullamento non ancora inviati possono lasciare attivo il precedente avviso.');
    for (let i = 0; i < changed.length; i += 200) {
      const group = changed.slice(i, i+200);
      const result = await request('/timers', {timers:group});
      for (const r of group) if ((result.accepted || []).includes(r.id)) synced.set(r.id, JSON.stringify(r));
      if (result.conflicts?.length) throw Error('Timer modificati da un altro dispositivo: sincronizza Drive e riprova gli avvisi.');
      message(result.subscribers ? 'Scadenze inviate al servizio. Avvisi attivi sui dispositivi collegati.' : 'Scadenze inviate. Nessun dispositivo abilitato: premi “Abilita su questo dispositivo”.');
    }
    refreshLabel();
  }
  function flush() {
    clearTimeout(timer);
    chain = chain.catch(() => {}).then(reconcile);
    return chain.catch(error => { message(error.message || 'Avvisi da aggiornare.', true); refreshLabel(); throw error; });
  }
  function queue() { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 150); }
  function label(job) {
    if (!configured()) return 'Avviso ad app chiusa non attivo: configura il servizio nelle Impostazioni.';
    if (synced.get(job.id) !== JSON.stringify(record(job))) return 'Avviso remoto da aggiornare: mantieni aperta l’app finché l’invio non è confermato.';
    return job.countdown?.endAt || job.countdown?.finished ? 'Scadenza registrata nel servizio notifiche.' : 'Nessuna scadenza attiva nel servizio notifiche.';
  }
  function refreshLabel() { const el=document.getElementById('bf105TimerPushStatus'); const job=db.jobs.find(j=>j.id===selectedJobId); if(el && job) el.textContent=label(job); }
  async function registration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw Error('Push non disponibile. Su iPhone apri Badfish dall’icona aggiunta alla schermata Home (iOS 16.4 o successivo).');
    return Promise.race([navigator.serviceWorker.ready, new Promise((_,reject)=>setTimeout(()=>reject(Error('App non ancora pronta: ricarica e riprova.')),10000))]);
  }
  const bytes = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')), c=>c.charCodeAt(0));
  async function enable(permissionPromise) {
    const permission = await permissionPromise;
    if (permission !== 'granted') throw Error('Notifiche non autorizzate. Controlla i permessi del browser.');
    const reg = await registration(), meta = await request('/info', undefined, 'GET');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:bytes(meta.publicKey)});
    await request('/subscriptions', {deviceId:settings.deviceId, subscription:sub.toJSON()});
    settings.enabled = true; save(); synced.clear(); await flush();
    message('Dispositivo abilitato. Usa “Invia prova” per controllare la ricezione.');
  }
  document.addEventListener('click', event => {
    const b=event.target.closest('[data-push-action]'); if(!b)return;
    const action=b.dataset.pushAction;
    // La richiesta permesso resta nel gesto esplicito, prima di qualunque fetch (Safari/iOS).
    const permission=action==='enable' && configured() && 'Notification' in window ? Notification.requestPermission() : null;
    b.disabled=true;
    (async()=>{
      if(action==='save') {
        const url=validURL(document.getElementById('bf105PushURL').value.trim());
        const token=document.getElementById('bf105PushToken').value.trim();
        if(token.length<32)throw Error('Inserisci il codice di collegamento completo (almeno 32 caratteri).');
        if(configured() && (url!==settings.url || token!==settings.token)) throw Error('Per cambiare servizio scollega prima questo dispositivo dal servizio attuale.');
        const proposed={...settings,url,token};
        await request('/info',undefined,'GET',proposed);
        settings=proposed; save(); synced.clear(); await flush();
        message('Servizio collegato. Abilita ora le notifiche su questo dispositivo.');
      } else if(action==='enable') { if(!permission) throw Error('Configura prima il servizio e usa un browser compatibile.'); await enable(permission); }
      else if(action==='test') { await request('/test',{deviceId:settings.deviceId}); message('Notifica di prova inviata al servizio push. Controlla il dispositivo.'); }
      else if(action==='retry') { synced.clear(); await flush(); }
      else if(action==='disconnect') {
        const reg=await navigator.serviceWorker?.getRegistration(); const sub=await reg?.pushManager.getSubscription(); if(sub && !await sub.unsubscribe())throw Error('Impossibile disabilitare le notifiche nel browser. Riprova.');
        let remoteRemoved = false;
        try { await request('/subscriptions/'+encodeURIComponent(settings.deviceId),undefined,'DELETE'); remoteRemoved=true; } catch {}
        settings={deviceId:settings.deviceId}; save(); synced.clear();
        document.getElementById('bf105PushURL').value=''; document.getElementById('bf105PushToken').value='';
        message(remoteRemoved ? 'Dispositivo scollegato. Le scadenze e gli altri dispositivi restano attivi sul servizio.' : 'Notifiche disabilitate nel browser e configurazione dimenticata. Il servizio non era raggiungibile: la sua registrazione verrà rimossa quando risulterà scaduta.');
      }
    })().catch(error=>message(error.message || 'Operazione non riuscita.',true)).finally(()=>{b.disabled=false;refreshLabel();});
  });
  document.getElementById('bf105PushURL').value=settings.url || '';
  document.getElementById('bf105PushToken').value=settings.token || '';
  message(configured() ? 'Servizio configurato su questo dispositivo. Verifica i permessi e invia una prova.' : 'Servizio non configurato. Gli avvisi ad app chiusa non sono ancora attivi.');
  window.addEventListener('online',queue);
  window.addEventListener('focus',queue);
  window.BadfishPush={queue,flush,label,configured};
  if(configured())queue();
})();
