import React, { useState } from 'react';

export default function App() {
  const [file, setFile] = useState(null);
  const [id, setId] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setStatus('uploading');
    const resp = await fetch('http://localhost:3000/api/images/upload', { method: 'POST', body: fd });
    const json = await resp.json();
    setId(json.id);
    setStatus('queued');
    pollStatus(json.id);
  }

  async function pollStatus(id) {
    setStatus('processing');
    const interval = setInterval(async () => {
      const r = await fetch(`http://localhost:3000/api/images/status/${id}`);
      if (r.status === 200) {
        const j = await r.json();
        if (j.status === 'done') {
          clearInterval(interval);
          setResult(j.result);
          setStatus('done');
        } else if (j.status === 'error') {
          clearInterval(interval);
          setStatus('error');
        }
      }
    }, 2000);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Azure OCR → Translate → Text Analytics (Demo)</h2>
      <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} />
      <button onClick={upload} disabled={!file}>Upload & Process</button>
      <div style={{ marginTop: 20 }}>
        <strong>Status:</strong> {status}
      </div>
      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>Resultados</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
