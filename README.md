# Badfish Manager 9.0

## Grezzi da Fusion

Nella commessa apri **Misure grezzi**, aggiungi un pezzo e assegna un titolo.
Scegli un progetto `.f3d` già archiviato nella commessa su Drive e premi
**Leggi grezzo da Fusion**. In alternativa puoi leggere un file dal dispositivo:
questa seconda opzione salva le misure nel database, senza caricare il progetto.

Il gestionale legge direttamente le tre dimensioni numeriche salvate nel setup
CAM come **Box a dimensione fissa** (`fixedbox`), in millimetri. Non aggiunge margini
e non usa le traiettorie della fresa. Mostra anche il volume geometrico del blocco
in cm³. Se ci sono più setup, devi selezionare quello relativo al grezzo del pezzo.
Ogni scheda corrisponde a un grezzo; eventuali duplicati o quantità vanno gestiti
secondo i pezzi realmente necessari.

Le misure sono quelle **configurate nel progetto esportato**, non una misurazione
del materiale fisico. Per un preventivo verifica di usare il file aggiornato e il
setup corretto. Non viene applicato automaticamente un prezzo al materiale.

### Verifica sul progetto Preciosa

- Lunghezza X: **37 mm**
- Larghezza Y: **17 mm**
- Altezza Z: **20 mm**
- Volume: **12,58 cm³**

### Casi non leggibili

I grezzi relativi al modello, cilindrici o definiti da un solido non vengono
convertiti in un blocco ipotetico. Viene mostrato un messaggio: per leggere tre
quote certe con questa versione, imposta un Box a dimensione fissa in Fusion,
salva ed esporta nuovamente il `.f3d` con il setup CAM. Gli archivi `.f3z` restano
archiviabili ma non vengono analizzati. Limite del file: 200 MB.

Le vecchie stime NC e i dati STEP già salvati rimangono nel database per
compatibilità, ma non sono mostrati come misure valide e non vengono usati dal
nuovo lettore. Per ottenere le misure corrette occorre leggere il file Fusion
per ciascun pezzo esistente. Nessuna commessa viene cancellata o riscritta in blocco.

## Aggiornamento del sito esistente

1. Dalle impostazioni del gestionale esporta il backup dei dati.
2. Sostituisci i file del sito con il contenuto di questa cartella, mantenendo lo
   stesso indirizzo web. `index.html` deve stare nella radice del sito.
3. Mantieni il tuo `config.js` se contiene impostazioni più recenti.
4. Dopo la pubblicazione ricarica la pagina; se la PWA era già aperta, chiudila e
   riaprila per attivare la nuova versione.
5. Apri la commessa, quindi Misure grezzi, e leggi il progetto Fusion corretto.

Il database continua a usare la stessa chiave locale e la sincronizzazione Drive
esistenti. Le altre funzioni operative rimangono disponibili: commesse, archivio
NC/STEP/Fusion e documenti, clienti, preventivi, ore, calendario, note, statistiche,
backup ed etichette QR.

## Codice

Una sola copia di ciascun modulo, con nomi stabili e formattazione leggibile:

- `app.js`: dati, commesse, grezzi, ore, preventivi e funzioni gestionali.
- `fusion-stock.js`: lettura dell'archivio F3D e dei parametri CAM; nessuna stima.
- `drive.js`: autenticazione, file e sincronizzazione Google Drive.
- `backup.js`, `stats.js`, `job-tabs.js`, `mobile-nav.js`, `qr-engine.js`:
  funzionalità specifiche del gestionale.
- `styles.css`: unico foglio di stile.
- `sw.js`: cache offline dei file effettivamente utilizzati.
- `vendor/`: due dipendenze locali per i formati di compressione ZIP/Fusion,
  con le rispettive licenze MIT. Non richiedono CDN durante la lettura dei file.

Eliminati dal pacchetto i vecchi script e fogli di stile duplicati, i README di
versioni superate, il lettore STEP, lo stimatore NC, i loro controlli e gestori
inutilizzati, e i gestori del vecchio preventivo interno alla commessa. Restano
la pagina Preventivi attuale e l'importazione dei preventivi storici.

## Verifiche effettuate

Test nel browser sul file Preciosa originale (compressione Zstandard), su archivi
senza compressione e Deflate, più setup, setup non supportati, file privi di CAM
e file danneggiati. Verificati salvataggio e ricaricamento delle misure, più pezzi,
compatibilità con dati precedenti, permanenza della scheda Misure, caricamento
dei moduli e navigazione delle sezioni. Il percorso di lettura da Drive è stato
provato con trasferimento simulato: l'accesso al Drive reale richiede il tuo account.
