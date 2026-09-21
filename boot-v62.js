(() => {
  const MIGRATION_KEY = 'badfish_v62_cache_migrated';
  if (localStorage.getItem(MIGRATION_KEY) === '1') return;
  localStorage.setItem(MIGRATION_KEY, '1');

  // Rimuove soltanto le vecchie cache Badfish. I dati/commesse sono in
  // localStorage/Drive e non vengono toccati.
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(
      keys.filter(k => /^badfish-manager-v/i.test(k)).map(k => caches.delete(k))
    )).catch(() => {});
  }

  // Disattiva eventuali service worker precedenti. La v6.2 ne registra
  // subito uno nuovo dopo il bootstrap.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => {});
  }
})();
