# Badfish Manager v6.5 — lettura STEP automatica

## Installazione
Sostituisci i file di GitHub Pages con quelli di questo ZIP, dopo aver fatto il backup dei dati.

## Uso
Apri una commessa > Dimensioni > seleziona **Grezzo iniziale** oppure **Pezzo finito** > **Analizza file STEP dal dispositivo**. Le dimensioni X/Y/Z sono misurate in mm e salvate nella commessa.
In alternativa, scegli la tipologia dall’elenco e usa **+ File STEP**: durante il caricamento Drive l’analisi viene tentata automaticamente.

## Avvertenze
- Le misure sono quelle dell’ingombro allineato agli assi CAD e non necessariamente le dimensioni minime ottenibili ruotando il pezzo. Per misurare il grezzo serve uno STEP separato del grezzo; lo STEP del pezzo finito non può ricostruire lo stock iniziale.
- Motore CAD `occt-import-js` 0.0.23, eseguito nel browser: viene caricato via jsDelivr al primo utilizzo. La prima analisi richiede Internet. Il file analizzato dal dispositivo non viene caricato su Drive, salvo utilizzo esplicito di **+ File STEP**.
- La tessellazione introduce una piccola approssimazione nelle dimensioni di superfici curve.
- L'importazione automatica durante upload non impedisce il caricamento se l'analisi non riesce.
- Non è inclusa la lettura dello stock Fusion 360 CAM né l'analisi diretta degli STEP già archiviati su Drive.
- Test statico/sintattico eseguito; controllare il browser con un file STEP reale prima della pubblicazione in produzione.
- Mantiene database locale `badfish_manager_db_v3` e le funzioni Google Drive esistenti.
