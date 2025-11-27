const fs = require('fs');
const path = require('path');

// Simple demo pipeline that fakes OCR/translation/analytics when keys are not present.
// Replace with real SDK calls in azureClients.js when ready.

async function processImage(filePath, id) {
  // Step 1: read file (simulate upload to blob storage)
  const filename = path.basename(filePath);

  const steps = [];

  steps.push({ step: 'upload', status: 'done', info: { filename } });

  // Step 2: OCR (fake or TODO call to Computer Vision)
  let extractedText = '';
  if (process.env.COG_KEY && process.env.COG_ENDPOINT) {
    // TODO: call Azure Form Recognizer / Computer Vision SDK
    extractedText = '[OCR result from Azure would appear here]';
    steps.push({ step: 'ocr', status: 'done', info: { note: 'Called Azure OCR (not implemented in scaffold)' } });
  } else {
    // Fake OCR: create placeholder text
    extractedText = 'Texto de ejemplo extraído de la imagen.';
    steps.push({ step: 'ocr', status: 'done', info: { note: 'Fake OCR used (no COG_KEY configured)' } });
  }

  // Step 3: Detect language (very simple heuristic)
  let detectedLanguage = 'unknown';
  if (/\b(el|la|de|que|y)\b/i.test(extractedText)) detectedLanguage = 'es';
  else if (/\b(the|and|of|is)\b/i.test(extractedText)) detectedLanguage = 'en';
  steps.push({ step: 'languageDetection', status: 'done', info: { language: detectedLanguage } });

  // Step 4: Translate to Spanish (if needed)
  let translated = extractedText;
  if (detectedLanguage !== 'es' && process.env.TRANSLATOR_KEY) {
    // TODO: call Translator SDK or REST API
    translated = '[Traducción desde Azure Translator] ' + extractedText;
    steps.push({ step: 'translate', status: 'done', info: { note: 'Called Azure Translator (not implemented in scaffold)' } });
  } else {
    steps.push({ step: 'translate', status: 'done', info: { note: 'No translation required or TRANSLATOR_KEY missing' } });
  }

  // Step 5: Text Analytics (keywords + sentiment)
  let keyPhrases = [];
  let sentiment = 'neutral';
  if (process.env.TEXT_ANALYTICS_KEY) {
    // TODO: call Text Analytics SDK
    keyPhrases = ['ejemplo', 'imagen'];
    sentiment = 'neutral';
    steps.push({ step: 'textAnalytics', status: 'done', info: { note: 'Called Azure Text Analytics (not implemented in scaffold)' } });
  } else {
    // Simple heuristics: split words and pick some keywords
    keyPhrases = translated.split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    sentiment = 'neutral';
    steps.push({ step: 'textAnalytics', status: 'done', info: { note: 'Basic local keywords & neutral sentiment used' } });
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

  // Optionally persist to disk
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${id}.json`), JSON.stringify(result, null, 2));

  return result;
}

function classifyByKeywords(keywords) {
  // Minimal rule-based classifier for MVP
  const k = (keywords || []).join(' ').toLowerCase();
  if (k.match(/factura|importe|total|cantidad/)) return 'Finance';
  if (k.match(/contrato|acuerdo|vencimiento/)) return 'Legal';
  if (k.match(/evento|fecha|lugar/)) return 'Events';
  return 'General';
}

module.exports = { processImage };
