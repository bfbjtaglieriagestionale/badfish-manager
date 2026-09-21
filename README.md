# Badfish Manager v6

Web app / PWA responsive per gestire commesse e file Badfish Body Jewelry con Google Drive.

## Pubblicazione GitHub Pages

Carica **il contenuto di questa cartella** nella root del repository `badfish-manager`, sostituendo i file esistenti. GitHub Pages deve pubblicare il branch `main` dalla cartella `/(root)`.

URL configurato:
`https://bfbjtaglieriagestionale.github.io/badfish-manager/`

## Google Drive

Il Client ID OAuth è già in `config.js`. L'origine JavaScript autorizzata in Google Cloud deve essere:
`https://bfbjtaglieriagestionale.github.io`

L'app usa lo scope `drive.file` e crea/gestisce:

- `BADFISH_MANAGER/badfish_data.json`
- `BADFISH_MANAGER/COMMESSE/<CODICE>_<ARTICOLO>/01_FUSION/versioni`
- `02_STEP`
- `03_NC`
- `04_DISEGNI_PDF`
- `05_FOTO`

## Primo avvio

Al primo avvio inserisci l'email Google dedicata a Badfish e lascia selezionato “Ricorda questo account”. La mail viene salvata sul dispositivo e nella configurazione del gestionale. Google può comunque richiedere periodicamente una nuova autorizzazione OAuth: una web app statica non conserva refresh token.

## Installazione come app

- iPhone/iPad: Safari → Condividi → Aggiungi alla schermata Home.
- Android/Chrome/Edge desktop: usa “Installa app” dal browser quando disponibile.

Versione: 6.0
