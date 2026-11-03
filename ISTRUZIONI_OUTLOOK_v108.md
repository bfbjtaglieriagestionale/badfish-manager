# Badfish v108 · Consegne su Outlook

## Attivazione necessaria
1. In Google Cloud Console, sul progetto OAuth di Badfish, abilita **Google Calendar API** e autorizza lo scope `https://www.googleapis.com/auth/calendar.events` (e `userinfo.email`). Se il progetto OAuth è in modalità test, aggiungi `bfbjtaglieriapietre@gmail.com` agli utenti di test.
2. Pubblica i file su GitHub Pages, come negli aggiornamenti precedenti.
3. Apri Badfish > Calendario, premi **Collega Google Calendar** e autorizza l'account aziendale; il primo collegamento esegue anche la sincronizzazione.
4. Verifica in Google Calendar gli eventi «Consegna BFBJ» e in Outlook che il calendario Google della casella Gmail sia effettivamente sincronizzato e selezionato. Alcune configurazioni Outlook mostrano solo la posta Gmail: in quel caso va attivata la sincronizzazione calendario.

## Comportamento
- Quando la pagina è aperta e la sessione Google Calendar è valida, ogni salvataggio del gestionale aggiorna automaticamente le consegne e le attività.
- Gli eventi sono giornalieri, con titolo, cliente e stato.
- Gli eventi gestiti e tracciati da questa integrazione sono aggiornati e, se la commessa viene consegnata/eliminata o la data rimossa, cancellati dal calendario. Non vengono toccati eventi estranei.
- L'accesso scade: occorre riconnettersi, senza memorizzare token o password in locale.
- Non è sincronizzazione server-side a gestionale chiuso. Non importa eventi Outlook verso Badfish.

## Collaudo
- Sintassi JavaScript e integrità ZIP verificabili localmente.
- Il collaudo reale OAuth/Google Calendar/Outlook richiede l'autorizzazione dell'account aziendale, che non è disponibile in questa sessione.
