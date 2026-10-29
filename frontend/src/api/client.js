import { request } from '../lib/xhr.js';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

const withExpiry = (presigned) => ({ ...presigned, expiresAt: Date.now() + presigned.expiresIn * 1000 });

export async function getEndpoints() {
  return (await request({ url: `${API}/endpoints` })).data;
}

export async function listFiles(endpointId, bucket) {
  return (await request({ url: `${API}/files?endpointId=${encodeURIComponent(endpointId)}&bucket=${encodeURIComponent(bucket)}` })).data.files;
}

export async function deleteFile(endpointId, bucket, key) {
  await request({ url: `${API}/files/${encodeURIComponent(endpointId)}/${encodeURIComponent(key)}?bucket=${encodeURIComponent(bucket)}`, method: 'DELETE' });
}

export async function getConsoleEvents(after) {
  return (await request({ url: `${API}/console?after=${after}` })).data;
}

export async function presignUpload(body) {
  return withExpiry((await request({ url: `${API}/presign/upload`, method: 'POST', body })).data);
}

export async function presignDownload(body) {
  return withExpiry((await request({ url: `${API}/presign/download`, method: 'POST', body })).data);
}
