const fs = require('fs');
const path = require('path');

const { uploadFileToBlob, generateBlobSasUrl, analyzeDocumentFromUrl, translateText, analyzeText } = require('../azureClients');

// Simple pipeline that uses Azure SDKs/helpers when configured.
async function processImage(filePath, id) {
  const filename = path.basename(filePath);
  const steps = [];

  // Step 1: upload to blob storage
  const container = process.env.AZURE_STORAGE_CONTAINER || 'images';
  const blobName = `${id}${path.extname(filename)}`;
  let blobUrl = null;
  try {
    const uploadedUrl = await uploadFileToBlob(container, blobName, filePath);
    steps.push({ step: 'upload', status: 'done', info: { uploadedUrl } });
    // Generate SAS for read by Cognitive Services
    try {
      const sasUrl = generateBlobSasUrl(container, blobName, 3600);
      blobUrl = sasUrl;
      steps.push({ step: 'generateSAS', status: 'done', info: { sasUrl } });
    } catch (e) {
      // If SAS generation fails, fall back to uploadedUrl (may be public if container is public)
      blobUrl = uploadedUrl;
      steps.push({ step: 'generateSAS', status: 'warning', info: { note: 'SAS generation failed, using uploaded URL if accessible', error: e.message } });
    }
  } catch (err) {
    throw new Error(`Upload failed: ${err.message}`);
  }

  // Step 2: OCR via Form Recognizer / Read
  let extractedText = '';
  try {
    if (process.env.COG_KEY && process.env.COG_ENDPOINT) {
      const docResult = await analyzeDocumentFromUrl(blobUrl);
      // docResult.content contains the full extracted text for prebuilt-read
      extractedText = docResult && docResult.content ? docResult.content : '';
      steps.push({ step: 'ocr', status: 'done', info: { note: 'Called Azure Form Recognizer', pages: docResult && docResult.pages ? docResult.pages.length : 0 } });
    } else {
      extractedText = 'Texto de ejemplo extraído de la imagen.';
      steps.push({ step: 'ocr', status: 'done', info: { note: 'Fake OCR used (no COG_KEY configured)' } });
    }
  } catch (err) {
    steps.push({ step: 'ocr', status: 'error', info: { error: err.message } });
    throw err;
  }

  // Step 3: Detect language (basic heuristic)
  let detectedLanguage = 'unknown';
  if (/\b(el|la|de|que|y)\b/i.test(extractedText)) detectedLanguage = 'es';
  else if (/\b(the|and|of|is)\b/i.test(extractedText)) detectedLanguage = 'en';
  steps.push({ step: 'languageDetection', status: 'done', info: { language: detectedLanguage } });

  // Step 4: Translate to Spanish (if needed)
  let translated = extractedText;
  try {
    if (detectedLanguage !== 'es' && process.env.TRANSLATOR_KEY && process.env.TRANSLATOR_ENDPOINT) {
      translated = await translateText(extractedText, 'es');
      steps.push({ step: 'translate', status: 'done', info: { note: 'Translated via Azure Translator' } });
    } else {
      steps.push({ step: 'translate', status: 'done', info: { note: 'No translation required or translator not configured' } });
    }
  } catch (err) {
    steps.push({ step: 'translate', status: 'error', info: { error: err.message } });
  }

  // Step 5: Text Analytics (keywords + sentiment)
  let keyPhrases = [];
  let sentiment = 'neutral';
  try {
    if (process.env.TEXT_ANALYTICS_KEY && process.env.TEXT_ANALYTICS_ENDPOINT) {
      const ta = await analyzeText(translated);
      keyPhrases = ta.keyPhrases || [];
      sentiment = ta.sentiment || 'neutral';
      steps.push({ step: 'textAnalytics', status: 'done', info: { note: 'Called Azure Text Analytics' } });
    } else {
      keyPhrases = translated.split(/\s+/).filter(w => w.length > 4).slice(0, 5);
      sentiment = 'neutral';
      steps.push({ step: 'textAnalytics', status: 'done', info: { note: 'Basic local keywords & neutral sentiment used' } });
    }
  } catch (err) {
    steps.push({ step: 'textAnalytics', status: 'error', info: { error: err.message } });
  }

  // Step 6: Simple classification (rules)
  const classification = classifyByKeywords(keyPhrases);
  steps.push({ step: 'classification', status: 'done', info: { classification } });

  const result = {
    id,
    filename,
    extractedText,
    detectedLanguage,
    translated,
    keyPhrases,
    sentiment,
    classification,
    steps
  };

  // Persist to disk
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${id}.json`), JSON.stringify(result, null, 2));

  return result;
}

function classifyByKeywords(keywords) {
  const k = (keywords || []).join(' ').toLowerCase();
  if (k.match(/factura|importe|total|cantidad/)) return 'Finance';
  if (k.match(/contrato|acuerdo|vencimiento/)) return 'Legal';
  if (k.match(/evento|fecha|lugar/)) return 'Events';
  return 'General';
}

module.exports = { processImage };
