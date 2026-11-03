(() => {
  "use strict";
  const EMAIL = "bfbjtaglieria.gestionale@gmail.com";
  const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";
  const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const KEY = "badfish_calendar_v109_links:" + EMAIL;
  let accessToken = "", expiresAt = 0, queue = Promise.resolve(), connected = false;
  const status = message => { const el = document.getElementById("bfCalStatus"); if (el) el.textContent = message; };
  const clientId = () => (localStorage.getItem("badfish_google_client_id") || window.BADFISH_CONFIG?.googleClientId || "").trim();
  const links = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
  const saveLinks = map => localStorage.setItem(KEY, JSON.stringify(map));
  const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T12:00:00"));
  function nextDate(date) { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate()+1); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); }
  function entries(db) {
    const result = [];
    for (const job of db.jobs || []) {
      if (!job?.id || job.deleted || !validDate(job.dueDate) || job.status === "Consegnata") continue;
      result.push({ key:"job:"+job.id, date:job.dueDate, title:"Consegna BFBJ · "+(job.code||"Commessa")+" · "+(job.article||""), description:"Cliente: "+(job.client||"")+"\nStato: "+(job.status||"")+"\nOrigine: Badfish Manager" });
    }
    for (const task of db.tasks || []) {
      if (!task?.id || task.deleted || task.done || !validDate(task.date)) continue;
      result.push({key:"task:"+task.id,date:task.date,title:"BFBJ · "+(task.title||"Attività"),description:(task.description||"")+"\nOrigine: Badfish Manager"});
    }
    return result;
  }
  async function api(url, method="GET", body) {
    const res = await fetch(url, {method,headers:{Authorization:"Bearer "+accessToken,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    if (!res.ok) { const error = new Error("Google Calendar HTTP "+res.status+": "+(await res.text()).slice(0,160)); error.status=res.status; throw error; }
    return res.status===204?null:res.json();
  }
  async function connect() {
    if (!clientId()) throw new Error("Client ID Google non configurato.");
    if (!window.google?.accounts?.oauth2) throw new Error("Accesso Google non disponibile. Ricarica la pagina online.");
    status("Autorizzazione Google in corso…");
    const auth = await new Promise((resolve,reject)=>{
      const c=google.accounts.oauth2.initTokenClient({client_id:clientId(),scope:SCOPES,login_hint:EMAIL,
        callback:res=>res.error?reject(new Error(res.error_description||res.error)):resolve(res),
        error_callback:err=>reject(new Error(err.message||"Accesso annullato"))});
      c.requestAccessToken({prompt:"consent"});
    });
    accessToken=auth.access_token; expiresAt=Date.now()+Number(auth.expires_in||3600)*1000;
    try {
      const profile=await api("https://www.googleapis.com/oauth2/v3/userinfo");
      if ((profile.email||"").toLowerCase()!==EMAIL) throw new Error("Account errato: autorizza "+EMAIL);
    } catch(err) { accessToken="";connected=false;throw err; }
    connected=true;
    status("Collegato a "+EMAIL+". Sincronizzazione automatica attiva mentre Badfish è aperto.");
    await sync();
  }
  async function performSync() {
    if (!connected || !accessToken || Date.now()>=expiresAt-30000) {
      connected=false;status("Sessione calendario scaduta: premi Collega Google Calendar per riattivare.");return;
    }
    const db=window.BadfishCalendarData?.();
    if (!db) throw new Error("Database Badfish non disponibile.");
    const desired=entries(db), map=links(), wanted=new Set(desired.map(e=>e.key));
    let updated=0;
    for (const item of desired) {
      const payload={summary:item.title,description:item.description,start:{date:item.date},end:{date:nextDate(item.date)},extendedProperties:{private:{badfishKey:item.key}}};
      let id=map[item.key],event=null;
      if (!id) {
        const found=await api(API+"?"+new URLSearchParams({privateExtendedProperty:"badfishKey="+item.key,maxResults:"2"}));
        id=found.items?.[0]?.id;
      }
      if (id) {
        try { event=await api(API+"/"+encodeURIComponent(id),"PATCH",payload); }
        catch(err) { if(err.status!==404 && err.status!==410) throw err; }
      }
      if (!event) event=await api(API,"POST",payload);
      map[item.key]=event.id;saveLinks(map);updated++;
    }
    // Delete only events previously created and tracked by this integration.
    for (const [key,id] of Object.entries(map)) {
      if (wanted.has(key)) continue;
      try { await api(API+"/"+encodeURIComponent(id),"DELETE"); }
      catch(err) { if (err.status!==404 && err.status!==410) throw err; }
      delete map[key];saveLinks(map);
    }
    status("Sincronizzato: "+updated+" consegne/attività · "+new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})+". Controlla la visualizzazione del calendario Google in Outlook.");
  }
  function sync() {
    queue=queue.catch(()=>{}).then(performSync).catch(err=>{status("Errore calendario: "+err.message);throw err;});
    return queue;
  }
  document.addEventListener("click",async event=>{
    if (event.target.closest("#bfCalConnect")) { try { await connect(); } catch(err) {status("Errore: "+err.message);} }
    if (event.target.closest("#bfCalSync")) { if(!connected)status("Prima collega Google Calendar.");else try{await sync();}catch{} }
  });
  window.BadfishCalendarSync={onSave:()=>{if(connected)sync().catch(()=>{});},isConnected:()=>connected};
})();
