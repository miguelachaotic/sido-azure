# Flask Azure OCR → Translator → Language pipeline

Pasos rápidos:

1. Definir las variables de entorno (PowerShell):

```powershell
$env:AZURE_STORAGE_CONNECTION_STRING = '<connection string>'
$env:AZURE_STORAGE_ACCOUNT_NAME = '<account name>'
$env:AZURE_STORAGE_ACCOUNT_KEY = '<account key>'
$env:AZURE_COMPUTER_VISION_KEY = '<computer vision key>'
$env:AZURE_COMPUTER_VISION_ENDPOINT = 'https://<your-cv-endpoint>'
$env:AZURE_TRANSLATOR_KEY = '<translator key>'
$env:AZURE_TRANSLATOR_REGION = '<translator region>'
$env:AZURE_TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com'
$env:AZURE_LANGUAGE_KEY = '<language resource key>'
$env:AZURE_LANGUAGE_ENDPOINT = 'https://<your-language-endpoint>'
```

2. Instalar dependencias:

```powershell
python -m pip install -r requirements.txt
```

3. Ejecutar la app:

```powershell
#$env:FLASK_APP = 'app.py'; flask run
python app.py
```

4. Abrir `http://127.0.0.1:5000/` y subir una imagen.

Notas:

- El proyecto sube el fichero a un contenedor `uploads` en el Storage Account y genera un SAS temporal para que los servicios puedan leerlo.
- El OCR usa la API de Computer Vision (endpoint `vision/v3.2/ocr`).
- La traducción usa el servicio Translator (REST API).
- El análisis de idioma, key phrases y sentimiento usa la API de Text Analytics (Language Service) v3.1.
