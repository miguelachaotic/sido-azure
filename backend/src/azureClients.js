const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { DocumentAnalysisClient, AzureKeyCredential: AzureKeyCredentialFR } = require('@azure/ai-form-recognizer');
const { TextAnalyticsClient, AzureKeyCredential: AzureKeyCredentialTA } = require('@azure/ai-text-analytics');

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
  if (!process.env.AZURE_STORAGE_ACCOUNT || !process.env.AZURE_STORAGE_KEY) throw new Error('Storage account/key missing for SAS generation');
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
function getFormRecognizerClient() {
  if (!process.env.COG_ENDPOINT || !process.env.COG_KEY) return null;
  return new DocumentAnalysisClient(process.env.COG_ENDPOINT, new AzureKeyCredentialFR(process.env.COG_KEY));
}

async function analyzeDocumentFromUrl(sasUrl) {
  const client = getFormRecognizerClient();
  if (!client) throw new Error('Form Recognizer client not configured');
  const poller = await client.beginAnalyzeDocument('prebuilt-read', sasUrl);
  const result = await poller.pollUntilDone();
  // result.content contains full extracted text when available
  return result;
}

// Translator (REST call)
async function translateText(text, to = 'es') {
  if (!process.env.TRANSLATOR_KEY || !process.env.TRANSLATOR_ENDPOINT) throw new Error('Translator not configured');
  const endpoint = process.env.TRANSLATOR_ENDPOINT.replace(/\/$/, '');
  const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
  const body = [{ Text: text }];
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
  return {
    sentiment: sentimentResult && sentimentResult.sentiment,
    confidenceScores: sentimentResult && sentimentResult.confidenceScores,
    keyPhrases: keyPhrasesResult && keyPhrasesResult.keyPhrases
  };
}

module.exports = {
  getBlobServiceClient,
  uploadFileToBlob,
  generateBlobSasUrl,
  getFormRecognizerClient,
  analyzeDocumentFromUrl,
  translateText,
  getTextAnalyticsClient,
  analyzeText
};
