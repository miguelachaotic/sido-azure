# Azure OCR → Translator → Text Analytics Demo

This repository contains a minimal scaffold for a demo application that:

- Uploads images to a backend
- Runs an OCR → language detection → translation → text analytics pipeline
- Shows results in a simple React UI

This scaffold is intentionally minimal. Real Azure SDK calls are mentioned as TODOs and can be filled with your Azure keys.

Quick start (Windows PowerShell):

1. Backend

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env with your Azure keys
npm install
npm run dev
```

2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Notes:
- The scaffold saves uploads to `backend/uploads` and pipeline results to `backend/data` by default.
- Replace the placeholder logic in `backend/src/azureClients.js` and `backend/src/pipeline/processImage.js` with real Azure SDK calls using your `COG_KEY`, `TRANSLATOR_KEY` and `TEXT_ANALYTICS_KEY`.
- Do not commit your `.env` file. Use `AZURE_*` env vars in App Service configuration or Key Vault for production.
