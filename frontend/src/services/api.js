export async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const resp = await fetch('http://localhost:3000/api/images/upload', { method: 'POST', body: fd });
  // Throw with details on non-OK status so callers can show a helpful message
  if (!resp.ok) {
    let errText = resp.statusText;
    try { const body = await resp.json(); if (body && body.error) errText = body.error; } catch (e) { /* ignore */ }
    throw new Error(`Upload failed: ${resp.status} ${errText}`);
  }
  return resp.json();
}

export async function getStatus(id) {
  const resp = await fetch(`http://localhost:3000/api/images/status/${id}`);
  if (!resp.ok) {
    let errText = resp.statusText;
    try { const body = await resp.json(); if (body && body.error) errText = body.error; } catch (e) { /* ignore */ }
    throw new Error(`Status fetch failed: ${resp.status} ${errText}`);
  }
  return resp.json();
}
