import React, { useState } from 'react';
import { uploadImage } from '../services/api';

export default function UploadCard({ onJobCreated }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setMessage('Selecciona un archivo primero.');
    setBusy(true);
    setMessage('Subiendo...');
    try {
      const json = await uploadImage(file);
      if (json && json.id) {
        setMessage('Trabajo creado. ID: ' + json.id);
        onJobCreated({ id: json.id, status: json.status || 'pending', createdAt: new Date().toISOString(), result: json.result || null });
      } else {
        setMessage('Respuesta inesperada del servidor.');
      }
    } catch (err) {
      console.error(err);
      // show detailed message when available
      setMessage(err && err.message ? err.message : 'Error subiendo el archivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card upload-card">
      <h3>Subir imagen</h3>
      <form onSubmit={handleSubmit} className="upload-form">
        <input type="file" accept="image/*" onChange={e => setFile(e.target.files && e.target.files[0])} />
        <div className="upload-actions">
          <button type="submit" disabled={busy}>Subir</button>
        </div>
      </form>
      {message && <div className="muted">{message}</div>}
    </div>
  );
}
