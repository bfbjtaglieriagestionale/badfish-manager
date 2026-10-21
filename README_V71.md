# Badfish Manager 7.1 — attività, appunti e ore complessive

Aggiunti: totale ore nella Home (sessioni registrate + cronometri in corso), calendario mensile, lista attività con date e assegnazione facoltativa alla commessa, appunti per settaggi macchina/procedure/generici, filtro e ricerca appunti. Archivio ordinato per tipologia e codice commessa. Nuove sezioni nella navigazione desktop e mobile.

Le nuove attività e gli appunti sono salvati nel database locale esistente e inclusi nella sincronizzazione Drive tramite i campi `tasks` e `notes`. Il merge per ID confronta le date `updatedAt`: testare due dispositivi prima di uso multiutente in contemporanea. Per i dati eliminati resta una voce tombstone per evitare ricomparse dal Drive. Nessun file esistente è stato eliminato.

Attenzione: il backup del codice ZIP non è un backup del database Google Drive. Salvare una copia separata dei dati. Non ancora testata autenticazione Google in browser reale.
