import os
import uuid
import threading
import io
from datetime import datetime, timedelta

from flask import Flask, render_template, request, redirect, url_for, jsonify
from werkzeug.utils import secure_filename
import requests

from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions

app = Flask(__name__)

# Configuration via environment variables
AZURE_STORAGE_CONNECTION_STRING = os.environ.get('AZURE_STORAGE_CONNECTION_STRING')
AZURE_STORAGE_ACCOUNT_NAME = os.environ.get('AZURE_STORAGE_ACCOUNT_NAME')
AZURE_STORAGE_ACCOUNT_KEY = os.environ.get('AZURE_STORAGE_ACCOUNT_KEY')
AZURE_CONTAINER = os.environ.get('AZURE_CONTAINER', 'uploads')

AZURE_COMPUTER_VISION_KEY = os.environ.get('COG_KEY')
AZURE_COMPUTER_VISION_ENDPOINT = os.environ.get('COG_ENDPOINT')

AZURE_TRANSLATOR_KEY = os.environ.get('TRANSLATOR_KEY')
AZURE_TRANSLATOR_REGION = os.environ.get('TRANSLATOR_REGION')
AZURE_TRANSLATOR_ENDPOINT = os.environ.get('TRANSLATOR_ENDPOINT', 'https://api.cognitive.microsofttranslator.com')

AZURE_LANGUAGE_KEY = os.environ.get('TEXT_ANALYTICS_KEY')
AZURE_LANGUAGE_ENDPOINT = os.environ.get('TEXT_ANALYTICS_ENDPOINT')

# Simple in-memory job store for background processing (job_id -> dict)
JOBS = {}




languages = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ru': 'Russian',
  'pt': 'Portuguese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'ko': 'Korean',
  'tr': 'Turkish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'pl': 'Polish',
  'fi': 'Finnish',
  'da': 'Danish',
  'no': 'Norwegian',
  'el': 'Greek',
  'he': 'Hebrew',
  'cs': 'Czech',
  'ro': 'Romanian',
  'hu': 'Hungarian',
  'th': 'Thai',
  'id': 'Indonesian',
}


def upload_file_to_blob(file_stream, filename):
    if not AZURE_STORAGE_CONNECTION_STRING and not (AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY):
      print(AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_CONNECTION_STRING)
      raise RuntimeError('Azure Storage credentials not configured in environment variables')

    blob_service = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING) if AZURE_STORAGE_CONNECTION_STRING else BlobServiceClient(
        account_url=f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/",
        credential=AZURE_STORAGE_ACCOUNT_KEY,
    )

    try:
        container_client = blob_service.get_container_client(AZURE_CONTAINER)
        container_client.create_container()
    except Exception:
        pass

    blob_name = f"{datetime.utcnow().strftime('%Y%m%d')}/{uuid.uuid4().hex}_{secure_filename(filename)}"
    blob_client = blob_service.get_blob_client(container=AZURE_CONTAINER, blob=blob_name)
    blob_client.upload_blob(file_stream, overwrite=True)

    # generate read SAS valid 1 hour
    sas_token = generate_blob_sas(
        account_name=AZURE_STORAGE_ACCOUNT_NAME,
        container_name=AZURE_CONTAINER,
        blob_name=blob_name,
        account_key=AZURE_STORAGE_ACCOUNT_KEY,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.utcnow() + timedelta(hours=1),
    )

    blob_url = f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_CONTAINER}/{blob_name}?{sas_token}"
    return blob_url


def ocr_from_image_url(image_url):
    if not AZURE_COMPUTER_VISION_ENDPOINT or not AZURE_COMPUTER_VISION_KEY:
        raise RuntimeError('Computer Vision config missing')

    ocr_url = f"{AZURE_COMPUTER_VISION_ENDPOINT.rstrip('/')}/vision/v3.2/ocr?language=unk&detectOrientation=true"
    headers = {'Ocp-Apim-Subscription-Key': AZURE_COMPUTER_VISION_KEY, 'Content-Type': 'application/json'}
    resp = requests.post(ocr_url, headers=headers, json={"url": image_url})
    resp.raise_for_status()
    data = resp.json()

    lines = []
    for region in data.get('regions', []):
        for line in region.get('lines', []):
            line_text = ' '.join([w.get('text', '') for w in line.get('words', [])])
            lines.append(line_text)

    extracted_text = '\n'.join(lines).strip()
    return extracted_text


def detect_language(text):
    if not AZURE_LANGUAGE_ENDPOINT or not AZURE_LANGUAGE_KEY:
        return None
    url = f"{AZURE_LANGUAGE_ENDPOINT.rstrip('/')}/text/analytics/v3.1/languages"
    headers = {'Ocp-Apim-Subscription-Key': AZURE_LANGUAGE_KEY, 'Content-Type': 'application/json'}
    payload = {"documents": [{"id": "1", "text": text}]}
    resp = requests.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    results = resp.json()
    print(results)
    try:
        lang = results['documents'][0]['detectedLanguage']['iso6391Name']
        return lang
    except Exception:
        return None


def translate_text(text, to_language='es'):
    if not AZURE_TRANSLATOR_KEY:
        raise RuntimeError('Translator key not configured')

    path = '/translate'
    params = {'api-version': '3.0', 'to': to_language}
    url = AZURE_TRANSLATOR_ENDPOINT.rstrip('/') + path
    headers = {
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION or '',
        'Content-Type': 'application/json'
    }
    body = [{'Text': text}]
    resp = requests.post(url, params=params, headers=headers, json=body)
    resp.raise_for_status()
    translations = resp.json()
    try:
        return translations[0]['translations'][0]['text']
    except Exception:
        return ''


def analyze_sentiment(text, language=None):
    if not AZURE_LANGUAGE_ENDPOINT or not AZURE_LANGUAGE_KEY:
        return None
    url = f"{AZURE_LANGUAGE_ENDPOINT.rstrip('/')}/text/analytics/v3.1/sentiment"
    headers = {'Ocp-Apim-Subscription-Key': AZURE_LANGUAGE_KEY, 'Content-Type': 'application/json'}
    doc = {"documents": [{"id": "1", "language": language or 'en', "text": text}]}
    resp = requests.post(url, headers=headers, json=doc)
    resp.raise_for_status()
    return resp.json()


def extract_key_phrases(text, language=None):
    if not AZURE_LANGUAGE_ENDPOINT or not AZURE_LANGUAGE_KEY:
        return None
    url = f"{AZURE_LANGUAGE_ENDPOINT.rstrip('/')}/text/analytics/v3.1/keyPhrases"
    headers = {'Ocp-Apim-Subscription-Key': AZURE_LANGUAGE_KEY, 'Content-Type': 'application/json'}
    doc = {"documents": [{"id": "1", "language": language or 'en', "text": text}]}
    resp = requests.post(url, headers=headers, json=doc)
    resp.raise_for_status()
    return resp.json()


def process_job(job_id, file_bytes, filename):
    try:
        JOBS[job_id]['status'] = 'uploading_blob'
        blob_url = upload_file_to_blob(io.BytesIO(file_bytes), filename)
        JOBS[job_id]['meta'] = {'blob_url': blob_url}

        JOBS[job_id]['status'] = 'ocr'
        extracted_text = ocr_from_image_url(blob_url)

        JOBS[job_id]['status'] = 'detecting_language'
        detected_code = detect_language(extracted_text) or None
        detected_lang = languages.get(detected_code, detected_code) if detected_code else 'unknown'

        JOBS[job_id]['status'] = 'translating'
        translated_text = translate_text(extracted_text, to_language='es') if extracted_text else ''

        JOBS[job_id]['status'] = 'analyzing_sentiment'
        sentiment = analyze_sentiment(translated_text or extracted_text, language='es')

        JOBS[job_id]['status'] = 'key_phrases'
        key_phrases = extract_key_phrases(translated_text or extracted_text, language='es')

        JOBS[job_id]['result'] = {
            'blob_url': blob_url,
            'extracted_text': extracted_text,
            'detected_lang': detected_lang,
            'translated_text': translated_text,
            'sentiment': sentiment,
            'key_phrases': key_phrases,
        }
        JOBS[job_id]['status'] = 'done'
    except Exception as e:
        JOBS[job_id]['status'] = 'error'
        JOBS[job_id]['error'] = str(e)


@app.route('/api/upload', methods=['POST'])
def api_upload():
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'no file provided'}), 400

    file_bytes = f.read()
    filename = f.filename or 'upload'
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {'status': 'queued', 'result': None, 'error': None, 'created': datetime.utcnow().isoformat()}

    thread = threading.Thread(target=process_job, args=(job_id, file_bytes, filename), daemon=True)
    thread.start()

    return jsonify({'job_id': job_id}), 202


@app.route('/api/status/<job_id>', methods=['GET'])
def api_status(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'job not found'}), 404
    return jsonify({'status': job.get('status'), 'error': job.get('error')})


@app.route('/result/<job_id>', methods=['GET'])
def view_result(job_id):
    job = JOBS.get(job_id)
    if not job:
        return 'Job not found', 404
    if job.get('status') != 'done':
        return f"Job status: {job.get('status')}", 202
    r = job.get('result') or {}
    return render_template('result.html',
                           blob_url=r.get('blob_url'),
                           extracted_text=r.get('extracted_text'),
                           detected_lang=r.get('detected_lang'),
                           translated_text=r.get('translated_text'),
                           sentiment=r.get('sentiment'),
                           key_phrases=r.get('key_phrases'))



@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    f = request.files.get('file')
    if not f:
        return redirect(url_for('index'))

    # Upload to Blob
    blob_url = upload_file_to_blob(f.stream, f.filename)

    # OCR
    extracted_text = ocr_from_image_url(blob_url)

    # Language detection (on extracted text)
    detected_lang = languages.get(detect_language(extracted_text)) or 'unknown'

    # Translate to Spanish
    translated_text = translate_text(extracted_text, to_language='es') if extracted_text else ''

    # Sentiment analysis (on translated text)
    sentiment_result = analyze_sentiment(translated_text or extracted_text, language='es')

    # Classification proxy: key phrases
    key_phrases_result = extract_key_phrases(translated_text or extracted_text, language='es')

    return render_template('result.html',
      blob_url=blob_url,
      extracted_text=extracted_text,
      detected_lang=detected_lang,
      translated_text=translated_text,
      sentiment=sentiment_result,
      key_phrases=key_phrases_result
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
