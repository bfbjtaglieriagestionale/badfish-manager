# Badfish Manager Web / PWA

Versione web del gestionale Badfish Body Jewelry pensata per PC, iPhone e Android.

## Architettura

- GitHub Pages ospita soltanto l'interfaccia HTML/CSS/JS.
- Google Drive contiene dati e file delle commesse.
- Il browser mantiene una cache locale del database per consultazione offline.
- I file tecnici vengono caricati direttamente su Drive e non nel repository GitHub.

Struttura Drive creata automaticamente:

```text
BADFISH_MANAGER/
├── badfish_data.json
└── COMMESSE/
    └── BF-2026-001_NomePezzo/
        ├── 01_FUSION/
        │   └── versioni/
        ├── 02_STEP/
        ├── 03_NC/
        ├── 04_DISEGNI_PDF/
        └── 05_FOTO/
```

Se viene caricato un file Fusion con lo stesso nome di uno già presente, la versione precedente viene spostata in `01_FUSION/versioni` con data/ora nel nome.

## 1. Google Cloud

Questa build è già configurata con il Client ID OAuth dedicato a Badfish Manager.

Configurazione prevista:

- Google Drive API abilitata nel progetto Google Cloud dedicato.
- Client OAuth di tipo **Web application**.
- Authorized JavaScript origin: `https://bfbjtaglieriagestionale.github.io`
- Scope: `https://www.googleapis.com/auth/drive.file`
- Account Google Badfish aggiunto tra gli utenti di test finché l'app resta in modalità Testing.

Il Client ID è contenuto in `config.js`. Non è un client secret.

## 2. GitHub Pages

Repository: `badfish-manager`. Carica **il contenuto di questa cartella** nella root del repository.

Poi: **Settings → Pages → Deploy from a branch → main / root**.

URL configurato:
`https://bfbjtaglieriagestionale.github.io/badfish-manager/`

## 3. Primo avvio

1. Apri il sito.
2. Vai in **Impostazioni**.
3. Premi **Collega Google Drive**.
4. Accedi con l'account Google dedicato a Badfish.
5. Accetta l'accesso richiesto.

L'app crea automaticamente `BADFISH_MANAGER` nel tuo Drive.

## 4. Telefono

### iPhone / iPad
Apri il sito in Safari → Condividi → **Aggiungi alla schermata Home**.

### Android
Apri il sito in Chrome → menu → **Installa app** / **Aggiungi a schermata Home**.

## Nota sulla sincronizzazione

Il token Google è volutamente temporaneo e non viene salvato nel codice o nel repository. Quando la sessione Google scade, basta premere di nuovo **Collega Drive**. Le modifiche alle commesse restano comunque nella cache locale e vengono unite al database Drive alla sincronizzazione successiva.
