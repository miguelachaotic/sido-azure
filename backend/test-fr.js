require('dotenv').config();
const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');

console.log('COG_ENDPOINT=', process.env.COG_ENDPOINT);
console.log('COG_KEY present=', !!process.env.COG_KEY);

async function test() {
  try {
    const client = new DocumentAnalysisClient(process.env.COG_ENDPOINT, new AzureKeyCredential(process.env.COG_KEY));
    const url = 'https://raw.githubusercontent.com/Azure-Samples/cognitive-services-sample-data-files/main/ComputerVision/Images/printed_text.jpg';
    const poller = await client.beginAnalyzeDocument('prebuilt-read', url);
    const result = await poller.pollUntilDone();
    console.log('Success, pages:', result.pages && result.pages.length);
  } catch (err) {
    console.error('ERROR:', err);
  }
}
test();