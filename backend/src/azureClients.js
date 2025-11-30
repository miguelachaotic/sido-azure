const fs = require('fs');
const { createReadStream } = require('node:fs');
const path = require('path');
const fetch = require('node-fetch');

const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { TextAnalyticsClient, AzureKeyCredential: AzureKeyCredentialTA } = require('@azure/ai-text-analytics');
const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');
const ApiKeyCredentials = require('@azure/ms-rest-js').ApiKeyCredentials;

// Storage
function getBlobServiceClient() {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  }
  if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY) {
    const cred = new StorageSharedKeyCredential(process.env.AZURE_STORAGE_ACCOUNT, process.env.AZURE_STORAGE_KEY);
    const url = `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`;
    return new BlobServiceClient(url, cred);
  }
  return null;
}

async function uploadFileToBlob(containerName, blobName, filePath) {
  const client = getBlobServiceClient();
  if (!client) throw new Error('Storage client not configured');
  const containerClient = client.getContainerClient(containerName);
  const exists = await containerClient.exists();
  if (!exists) await containerClient.create();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadFile(filePath);
  return blockBlobClient.url;
}

function generateBlobSasUrl(containerName, blobName, expiresInSeconds = 3600) {
  // Requires account key auth
  if ( !process.env.AZURE_STORAGE_ACCOUNT || !process.env.AZURE_STORAGE_KEY ) throw new Error('Storage account/key missing for SAS generation');
  const sharedKeyCredential = new StorageSharedKeyCredential(process.env.AZURE_STORAGE_ACCOUNT, process.env.AZURE_STORAGE_KEY);
  const startsOn = new Date();
  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);
  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'),
    startsOn,
    expiresOn
  }, sharedKeyCredential).toString();
  const url = `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
  return url;
}

// Form Recognizer / OCR
function getComputerVisionClient() {
  if (!process.env.COG_ENDPOINT || !process.env.COG_KEY) return null;
  // Basic sanity: trim values
  process.env.COG_ENDPOINT = process.env.COG_ENDPOINT.trim();
  process.env.COG_KEY = process.env.COG_KEY.trim();
  return new ComputerVisionClient(new ApiKeyCredentials({
    inHeader: { 'Ocp-Apim-Subscription-Key': process.env.COG_KEY }
  }), process.env.COG_ENDPOINT);
}

async function analyzeDocumentFromUrl(sasUrl) {
  const client = getComputerVisionClient();
  if (!client) throw new Error('Form Recognizer client not configured');
  // Validate inputs before calling service
  if (!sasUrl || typeof sasUrl !== 'string' || !/^https?:\/\//i.test(sasUrl)) {
    throw new Error('analyzeDocumentFromUrl: expected a valid https URL (with SAS if container is private)');
  }
  try {
    const operationResult = await client.recognizePrintedText(false, sasUrl);
    let text = "";
    operationResult.regions.forEach(reg => { 
      reg.lines.forEach(lin => {
        lin.words.forEach(w => text = text + " " + w.text);
      }) 
    })
    return text;
  } catch (err) {
    // Inspect common properties from SDK errors
    const status = err && (err.statusCode || err.status || err.code);
    console.error('analyzeDocumentFromUrl: caught error from Form Recognizer SDK:', {
      message: err && err.message,
      status
    });
    // Provide actionable hint for the common "invalid key or wrong endpoint" error
    if (err && /invalid subscription key|access denied/i.test(err.message || '')) {
      throw new Error('Access denied from Form Recognizer: check that COG_ENDPOINT matches the resource endpoint and that COG_KEY is a valid key for that resource. Ensure you are using the Form Recognizer (or Cognitive Services) endpoint, not another service.');
    }
    // Re-throw original error if not matched
    throw err;
  }
}

async function detectLanguage(text) {
  const client = getTextAnalyticsClient();
  if(!client) throw new Error("No se ha podido obtener una instancia del cliente");
  const result = await client.detectLanguage([text]);
  return result[0];
}

async function getTranslatorClient() {
  if(!process.env.TRANSLATOR_KEY || !process.env.TRANSLATOR_ENDPOINT) throw new Error('Translator not configured');

}

// Translator (REST call)
async function translateText(text, to = 'es') {
  if (!process.env.TRANSLATOR_KEY || !process.env.TRANSLATOR_ENDPOINT) throw new Error('Translator not configured');
  const endpoint = process.env.TRANSLATOR_ENDPOINT;
  const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
  const body = [{ text: text }];
  const headers = {
    'Ocp-Apim-Subscription-Key': process.env.TRANSLATOR_KEY,
    'Content-Type': 'application/json'
  };
  if (process.env.TRANSLATOR_REGION) headers['Ocp-Apim-Subscription-Region'] = process.env.TRANSLATOR_REGION;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Translator error: ${resp.status} ${t}`);
  }
  const json = await resp.json();
  // json[0].translations[0].text
  return (json && json[0] && json[0].translations && json[0].translations[0] && json[0].translations[0].text) || '';
}

// Text Analytics
function getTextAnalyticsClient() {
  if (!process.env.TEXT_ANALYTICS_ENDPOINT || !process.env.TEXT_ANALYTICS_KEY) return null;
  return new TextAnalyticsClient(process.env.TEXT_ANALYTICS_ENDPOINT, new AzureKeyCredentialTA(process.env.TEXT_ANALYTICS_KEY));
}

async function analyzeText(text) {
  const client = getTextAnalyticsClient();
  if (!client) throw new Error('Text Analytics client not configured');
  const documents = [text];
  const [sentimentResult] = await client.analyzeSentiment(documents);
  const [keyPhrasesResult] = await client.extractKeyPhrases(documents);
  // Try to also extract entities when available
  let entities = [];
  try {
    const [entitiesResult] = await client.recognizeEntities(documents);
    entities = (entitiesResult && entitiesResult.entities) || [];
  } catch (e) {
    // ignore if SDK version doesn't support or call fails
  }
  return {
    sentiment: sentimentResult && sentimentResult.sentiment,
    confidenceScores: sentimentResult && sentimentResult.confidenceScores,
    keyPhrases: keyPhrasesResult && keyPhrasesResult.keyPhrases,
    entities
  };
}


async function classifyText(text, categories = []) {
  // Quick path: if Text Analytics is configured, use key phrases + entities heuristics (fast, no training)
  try {
    if (process.env.TEXT_ANALYTICS_ENDPOINT && process.env.TEXT_ANALYTICS_KEY) {
      const analysis = await analyzeText(text);
      const k = ((analysis.keyPhrases || []).join(' ') + ' ' + (analysis.entities || []).map(e=>e.category + ':' + e.text).join(' ')).toLowerCase();
      // Heuristic rules
      if (/\b(email|from:|subject:|@)\b/.test(text.toLowerCase())) return { label: 'Email', confidence: 0.8, raw: analysis };
      if (/\b(invoice|factura|total|importe|amount|subtotal)\b/.test(k)) return { label: 'Invoice', confidence: 0.85, raw: analysis };
      if (/\b(contract|contrato|agreement|acuerdo|vencimiento)\b/.test(k)) return { label: 'Legal', confidence: 0.8, raw: analysis };
      if (/\b(study|method|results|doi|et al\.|journal|abstract)\b/.test(k)) return { label: 'Scientific', confidence: 0.8, raw: analysis };
      if (/\b(event|fecha|location|lugar|meeting|agenda)\b/.test(k)) return { label: 'Events', confidence: 0.7, raw: analysis };
      return { label: 'General', confidence: 0.6, raw: analysis };
    }
  } catch (e) {
    console.warn('Text Analytics quick classification failed, falling back:', e.message);
  }

  // Try Language custom classification next (if configured)
  try {
    if (process.env.LANGUAGE_PROJECT_NAME && process.env.LANGUAGE_DEPLOYMENT_NAME && (process.env.LANGUAGE_ENDPOINT || process.env.TEXT_ANALYTICS_ENDPOINT)) {
      return await classifyWithLanguageService(text, categories);
    }
  } catch (err) {
    console.warn('Language service classification failed, will try OpenAI fallback if configured:', err.message);
  }

  // Then try OpenAI fallback
  try {
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
      return await classifyWithOpenAI(text, categories);
    }
  } catch (err) {
    console.warn('OpenAI classification failed:', err.message);
  }

  // No service configured
  throw new Error('No classification service configured (set TEXT_ANALYTICS_KEY for quick classification, or LANGUAGE_* / AZURE_OPENAI_ variables)');
}

async function classifyText(text) {
  const client = getTextAnalyticsClient();
  if(!client) throw new Error('Text Analytics client not configured');
  const docs = [text];
}

module.exports = {
  getBlobServiceClient,
  uploadFileToBlob,
  generateBlobSasUrl,
  getFormRecognizerClient: getComputerVisionClient,
  analyzeDocumentFromUrl,
  translateText,
  getTextAnalyticsClient,
  analyzeText,
  detectLanguage,
  classifyText
};
