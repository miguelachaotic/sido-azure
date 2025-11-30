import React from 'react';


const idiomas = {
    "es": "español",
    "en": "inglés",
    "ja": "japonés",
    "fr": "francés",
    "de": "alemán",
    "it": "italiano",
    "pt": "portugués",
    "ru": "ruso",
    "zh": "chino",
    "ar": "árabe",
    "ko": "coreano",
    "hi": "hindi"
};

function idioma(codigo) {
  if(codigo === undefined) return 'Cargando...'
  return idiomas[codigo?.toLowerCase()] || `Idioma '${codigo}' no encontrado`;
}

// Ejemplos
console.log(idioma("es")); // "español"
console.log(idioma("ja")); // "japonés"

export default function DetailsDrawer({ job, onClose }) {
  if (!job) return null;
  console.log(job)
  return (
    <div className="details-drawer">
      <div className="drawer-inner">
        <div className="drawer-header">
          <h3>Detalles — {job.id}</h3>
          <button onClick={() => onClose && onClose()}>Cerrar</button>
        </div>

        <div className="drawer-body">
          <div><strong>Estado:</strong> {job.status}</div>
          <div><strong>Creado:</strong> {job.createdAt}</div>
          <div><strong>URL:</strong> <a href={job.result?.sasUrl} target="_blank" rel="noopener noreferrer">Enlace de descarga del documento</a></div>
          <div><strong>Texto extraído: </strong> {job.result?.extractedText}</div>
          <div><strong>Idioma detectado: </strong>{idioma(job.result?.detectedLanguage)}</div>
          <div><strong>Texto traducido al español: </strong>{job.result?.translated}</div>
          <h4>Resultado estructurado</h4>
          <pre className="raw-json">{JSON.stringify(job.result || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
