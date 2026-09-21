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

Puoi riutilizzare lo stesso progetto / Client ID web già usato per Fabio & Sofia Travels Manager.

1. Apri Google Cloud Console.
2. Verifica che **Google Drive API** sia abilitata.
3. In **Google Auth Platform / OAuth client**, usa un client di tipo **Web application**.
4. In **Authorized JavaScript origins** aggiungi l'origine GitHub Pages, ad esempio:
   `https://fabioesofiatravels.github.io`
   (solo protocollo + dominio, senza `/badfish-manager`).
5. L'app richiede soltanto lo scope `https://www.googleapis.com/auth/drive.file`.

Il Client ID non è un segreto. Puoi:
- incollarlo nell'app da **Impostazioni**, oppure
- inserirlo in `config.js` prima della pubblicazione.

## 2. GitHub Pages

Crea un repository, ad esempio `badfish-manager`, e carica **il contenuto di questa cartella** nella root del repository.

Poi: **Settings → Pages → Deploy from a branch → main / root**.

L'indirizzo sarà simile a:
`https://fabioesofiatravels.github.io/badfish-manager/`

## 3. Primo avvio

1. Apri il sito.
2. Vai in **Impostazioni**.
3. Inserisci il Client ID Google se non è già in `config.js`.
4. Premi **Collega Google Drive**.
5. Accetta l'accesso richiesto.

L'app crea automaticamente `BADFISH_MANAGER` nel tuo Drive.

## 4. Telefono

### iPhone / iPad
Apri il sito in Safari → Condividi → **Aggiungi alla schermata Home**.

### Android
Apri il sito in Chrome → menu → **Installa app** / **Aggiungi a schermata Home**.

## Nota sulla sincronizzazione

Il token Google è volutamente temporaneo e non viene salvato nel codice o nel repository. Quando la sessione Google scade, basta premere di nuovo **Collega Drive**. Le modifiche alle commesse restano comunque nella cache locale e vengono unite al database Drive alla sincronizzazione successiva.
