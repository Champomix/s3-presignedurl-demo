import { uploadWithProgress, downloadAsBlob } from '../lib/xhr.js';

function explain(err, presigned) {
  if (err.status === 403) {
    err.message = Date.now() >= presigned.expiresAt
      ? 'URL expirée, veuillez en générer une nouvelle'
      : 'Accès refusé par le stockage (signature invalide : vérifier l\'endpoint et la gateway)';
  }
  throw err;
}

export function uploadFile(presigned, file, callbacks) {
  const upload = uploadWithProgress(presigned, file, callbacks);
  return Object.assign(upload.catch((err) => explain(err, presigned)), { xhr: upload.xhr });
}

export function downloadFile(presigned, filename, onProgress) {
  return downloadAsBlob(presigned, { filename, onProgress }).catch((err) => explain(err, presigned));
}
