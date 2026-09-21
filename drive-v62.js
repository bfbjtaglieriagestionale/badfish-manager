(() => {
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  let accessToken = '';
  let tokenClient = null;
  let tokenExpiresAt = 0;
  let currentUser = null;

  const escQ = value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  function clientId() {
    return (localStorage.getItem('badfish_google_client_id') || window.BADFISH_CONFIG?.googleClientId || '').trim();
  }

  function isConnected() {
    return Boolean(accessToken && Date.now() < tokenExpiresAt - 30000);
  }

  function clearToken() {
    accessToken = '';
    tokenExpiresAt = 0;
    currentUser = null;
  }

  async function waitForGoogle() {
    for (let i = 0; i < 80; i++) {
      if (window.google?.accounts?.oauth2) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Google Identity Services non disponibile. Controlla la connessione Internet.');
  }

  async function connect({ email = '', prompt = '' } = {}) {
    const id = clientId();
    if (!id) throw new Error('Client ID Google non configurato.');
    await waitForGoogle();

    const requestedEmail = String(email || '').trim().toLowerCase();
    clearToken();

    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        include_granted_scopes: true,
        login_hint: requestedEmail || undefined,
        prompt,
        callback: async response => {
          if (response?.error) {
            const code = response.error;
            const message = code === 'access_denied'
              ? 'Accesso a Google Drive non autorizzato.'
              : code === 'interaction_required' || code === 'login_required'
                ? 'È necessario accedere a Google con l’account Badfish salvato.'
                : (response.error_description || code);
            return reject(new Error(message));
          }
          try {
            accessToken = response.access_token;
            tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) * 1000);
            currentUser = await fetchCurrentUser();

            const actualEmail = String(currentUser?.emailAddress || '').trim().toLowerCase();
            if (requestedEmail && actualEmail && actualEmail !== requestedEmail) {
              clearToken();
              return reject(new Error(`Google ha collegato ${actualEmail}, ma Badfish è configurato per ${requestedEmail}. Esci dall’account errato oppure modifica l’email salvata nelle Impostazioni.`));
            }

            resolve({ ...response, user: currentUser });
          } catch (err) {
            clearToken();
            reject(err);
          }
        },
        error_callback: err => {
          const type = err?.type || '';
          const message = type === 'popup_closed'
            ? 'Accesso Google annullato.'
            : type === 'popup_failed_to_open'
              ? 'Il browser ha bloccato la finestra Google. Premi di nuovo “Accedi a Drive”.'
              : (err?.message || 'Impossibile completare l’accesso Google.');
          reject(new Error(message));
        }
      });

      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function fetchCurrentUser() {
    const result = await api('/about?fields=user(displayName,emailAddress,photoLink)');
    return result?.user || null;
  }

  async function api(path, options = {}) {
    if (!isConnected()) throw new Error('Google Drive non è collegato.');
    const response = await fetch(path.startsWith('http') ? path : `${DRIVE_API}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.status === 401) {
      clearToken();
      throw new Error('Sessione Google scaduta. Premi “Collega Drive” per riconnetterti.');
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch {}
      throw new Error(detail || `Errore Google Drive (${response.status}).`);
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.blob();
  }

  async function list(q, fields = 'files(id,name,mimeType,modifiedTime,size,webViewLink,parents)') {
    const params = new URLSearchParams({ q, spaces: 'drive', fields, pageSize: '100' });
    return api(`/files?${params.toString()}`);
  }

  async function findChild(name, parentId, mimeType = null) {
    let q = `name='${escQ(name)}' and '${escQ(parentId)}' in parents and trashed=false`;
    if (mimeType) q += ` and mimeType='${escQ(mimeType)}'`;
    const result = await list(q);
    return result.files?.[0] || null;
  }

  async function createFolder(name, parentId = 'root') {
    return api('/files?fields=id,name,webViewLink,parents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
    });
  }

  async function ensureFolder(name, parentId = 'root') {
    return (await findChild(name, parentId, FOLDER_MIME)) || createFolder(name, parentId);
  }

  async function multipartUpload({ name, blob, mimeType, parentId }) {
    const boundary = `badfish_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const metadata = { name, parents: [parentId] };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ]);
    return api(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  }

  async function updateMedia(fileId, blob, mimeType = 'application/json') {
    return api(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: blob
    });
  }

  async function downloadJson(fileId) {
    const payload = await api(`/files/${encodeURIComponent(fileId)}?alt=media`);
    // Google Drive può restituire il JSON già deserializzato quando il
    // Content-Type è application/json. In altri casi api() restituisce un Blob.
    if (payload instanceof Blob) return JSON.parse(await payload.text());
    if (typeof payload === 'string') return JSON.parse(payload);
    if (payload && typeof payload === 'object') return payload;
    throw new Error('Il database ricevuto da Google Drive non è un JSON valido.');
  }

  async function patchMetadata(fileId, metadata, addParents = '', removeParents = '') {
    const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime,size,webViewLink,parents' });
    if (addParents) params.set('addParents', addParents);
    if (removeParents) params.set('removeParents', removeParents);
    return api(`/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata || {})
    });
  }

  async function deleteFile(fileId) {
    return api(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  }

  async function ensureRootStructure() {
    const rootName = window.BADFISH_CONFIG?.driveRootFolder || 'BADFISH_MANAGER';
    const root = await ensureFolder(rootName, 'root');
    const jobs = await ensureFolder('COMMESSE', root.id);
    let dbFile = await findChild('badfish_data.json', root.id);
    if (!dbFile) {
      dbFile = await multipartUpload({
        name: 'badfish_data.json',
        blob: new Blob([JSON.stringify({ settings: { companyName: 'Badfish Body Jewelry', schemaVersion: 6 }, jobs: [], deletedJobs: [], meta: { updatedAt: new Date().toISOString() } }, null, 2)], { type: 'application/json' }),
        mimeType: 'application/json',
        parentId: root.id
      });
    }
    return { root, jobs, dbFile };
  }

  async function ensureJobStructure(job, jobsRootId) {
    const clean = s => String(s || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/[. ]+$/g, '').slice(0, 120) || 'Senza_nome';
    const jobFolder = await ensureFolder(`${clean(job.code)}_${clean(job.article)}`, jobsRootId);
    const fusion = await ensureFolder('01_FUSION', jobFolder.id);
    const fusionVersions = await ensureFolder('versioni', fusion.id);
    const step = await ensureFolder('02_STEP', jobFolder.id);
    const nc = await ensureFolder('03_NC', jobFolder.id);
    const drawings = await ensureFolder('04_DISEGNI_PDF', jobFolder.id);
    const photos = await ensureFolder('05_FOTO', jobFolder.id);
    return { jobFolder, fusion, fusionVersions, step, nc, drawings, photos };
  }

  async function uploadJobFile(file, category, folders) {
    const target = folders[category];
    if (!target) throw new Error('Categoria file non valida.');

    if (category === 'fusion') {
      const previous = await findChild(file.name, target.id);
      if (previous) {
        const dot = file.name.lastIndexOf('.');
        const base = dot > 0 ? file.name.slice(0, dot) : file.name;
        const ext = dot > 0 ? file.name.slice(dot) : '';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await patchMetadata(previous.id, { name: `${base}_${stamp}${ext}` }, folders.fusionVersions.id, target.id);
      }
    }

    return multipartUpload({
      name: file.name,
      blob: file,
      mimeType: file.type || 'application/octet-stream',
      parentId: target.id
    });
  }

  window.BadfishDrive = {
    connect,
    isConnected,
    clearToken,
    ensureRootStructure,
    ensureJobStructure,
    uploadJobFile,
    downloadJson,
    updateMedia,
    deleteFile,
    getClientId: clientId,
    getCurrentUser() { return currentUser ? { ...currentUser } : null; },
    setClientId(value) { localStorage.setItem('badfish_google_client_id', String(value || '').trim()); },
    driveFileUrl(fileId) { return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`; },
    folderUrl(folderId) { return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`; }
  };
})();
