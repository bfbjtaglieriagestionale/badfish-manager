# Calendario automatico v111

Carica il contenuto della cartella nel repository del gestionale e ricarica l’app dopo la pubblicazione.

Ogni commessa con data di consegna compare automaticamente nel calendario interno, anche senza accesso Google. La data segue le modifiche della commessa; le commesse consegnate o eliminate non compaiono più. Le attività manuali restano disponibili.

Nel Calendario premi Collega Google Calendar. La destinazione è il calendario Google di bfbjtaglieriapietre@gmail.com, che deve essere visibile in Outlook.
Puoi autorizzare direttamente questo account, oppure usare bfbjtaglieria.gestionale@gmail.com dopo aver condiviso con esso il calendario di destinazione con il permesso di modificare gli eventi. L’account autorizzato deve essere ammesso dal progetto OAuth.

La sincronizzazione automatica funziona mentre il gestionale è aperto e la sessione Google è valida. Alla scadenza occorre ricollegare il calendario. Non è una sincronizzazione in background a gestionale chiuso.
Il collegamento Google Drive resta invariato. Gli eventi già creati sul calendario della seconda email non vengono spostati o cancellati: questa versione sincronizza le commesse sul calendario richiesto.

Verifica eseguita con API simulate: creazione evento, aggiornamento data senza duplicati, eliminazione, destinazione corretta e autorizzazione con seconda email. Accesso reale e visualizzazione Outlook da verificare dopo l’installazione.
