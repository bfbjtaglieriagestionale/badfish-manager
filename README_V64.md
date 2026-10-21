# Badfish Manager v6.4 — archivio, dimensioni e ore

Questa versione continua a usare il database `badfish_manager_db_v3` e la sincronizzazione Google Drive della precedente versione. **Esegui un backup di Google Drive e prova prima su una copia di test.**

## Novità
- Dimensioni grezzo e pezzo finito nella scheda commessa (mm), registrazione manuale validata.
- Confronto dei volumi d’ingombro e riduzione percentuale, non volume effettivo asportato.
- Cronometro con avvio salvato anche dopo la chiusura della pagina, arresto con registrazione sessione.
- Registro manuale delle ore per preparazione, CNC, finitura o altro.
- Storico e totale dei tempi per commessa.
- Migliorie grafiche nella scheda di dettaglio.

## Non ancora compreso
La lettura automatica STEP e dello stock CAM richiede un parser CAD / esportazione da Fusion 360 e non è implementata in questa versione. Cronometro: se avvii su un dispositivo, non avviarne un secondo per la stessa commessa; sincronizza Drive prima del cambio dispositivo. La sincronizzazione originale risolve i conflitti per commessa, non per singola sessione.

## Pubblicazione
Sostituire i file del repository con quelli di questo archivio e pubblicare via GitHub Pages. Nessuna modifica a configurazione OAuth, database precedente o nomi delle cartelle Drive.
