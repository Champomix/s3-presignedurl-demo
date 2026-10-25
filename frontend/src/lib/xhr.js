// Seul client HTTP de l'application : XHR expose la progression d'upload, fetch non
const SPEED_SAMPLE_SECONDS = 0.5;

const isOk = (xhr) => xhr.status >= 200 && xhr.status < 300;
const httpError = (xhr, message, extra) =>
  Object.assign(new Error(message || `HTTP ${xhr.status}`), { status: xhr.status, ...extra });
const networkError = () => new Error('Erreur réseau (CORS ou serveur injoignable)');

export function request({ url, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      const isJson = (xhr.getResponseHeader('Content-Type') || '').includes('application/json');
      const data = isJson && xhr.responseText ? JSON.parse(xhr.responseText) : xhr.responseText;
      if (isOk(xhr)) resolve({ status: xhr.status, headers: xhr.getAllResponseHeaders(), data });
      else reject(httpError(xhr, data?.error?.message, { data }));
    };
    xhr.onerror = () => reject(networkError());
    xhr.send(body === undefined ? null : JSON.stringify(body));
  });
}

// La xhr est attachée à la Promise retournée pour permettre upload.xhr.abort()
export function uploadWithProgress(presigned, file, { onProgress, onSpeed } = {}) {
  const xhr = new XMLHttpRequest();
  let last = { loaded: 0, time: performance.now() };

  const promise = new Promise((resolve, reject) => {
    xhr.open(presigned.method, presigned.url);
    Object.entries(presigned.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      onProgress?.({ loaded: e.loaded, total: e.total });
      const now = performance.now();
      const seconds = (now - last.time) / 1000;
      if (seconds < SPEED_SAMPLE_SECONDS) return;
      const bytesPerSecond = (e.loaded - last.loaded) / seconds;
      onSpeed?.({ bytesPerSecond, eta: bytesPerSecond > 0 ? (e.total - e.loaded) / bytesPerSecond : Infinity });
      last = { loaded: e.loaded, time: now };
    };
    xhr.onload = () => (isOk(xhr) ? resolve({ status: xhr.status, xhr }) : reject(httpError(xhr)));
    xhr.onerror = () => reject(networkError());
    xhr.onabort = () => reject(Object.assign(new Error('Upload annulé'), { aborted: true }));
    xhr.send(file);
  });

  return Object.assign(promise, { xhr });
}

export function downloadAsBlob(presigned, { onProgress, filename = 'download' } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presigned.method, presigned.url);
    xhr.responseType = 'blob';
    // total = 0 : taille inconnue, progression indéterminée
    xhr.onprogress = (e) => onProgress?.({ loaded: e.loaded, total: e.lengthComputable ? e.total : 0 });
    xhr.onload = () => {
      if (!isOk(xhr)) return reject(httpError(xhr));
      const blob = xhr.response;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      resolve({ blob, objectUrl });
    };
    xhr.onerror = () => reject(networkError());
    xhr.send();
  });
}
