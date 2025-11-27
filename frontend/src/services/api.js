export async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const resp = await fetch('http://localhost:3000/api/images/upload', { method: 'POST', body: fd });
  return resp.json();
}

export async function getStatus(id) {
  const resp = await fetch(`http://localhost:3000/api/images/status/${id}`);
  return resp.json();
}
