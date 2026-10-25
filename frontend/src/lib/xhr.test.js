import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { request, uploadWithProgress } from './xhr.js';

class FakeXHR {
  static last;

  constructor() {
    this.upload = {};
    this.headers = {};
    this.responseHeaders = {};
    FakeXHR.last = this;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, value) {
    this.headers[name] = value;
  }

  getResponseHeader(name) {
    return this.responseHeaders[name] ?? null;
  }

  getAllResponseHeaders() {
    return '';
  }

  send(body) {
    this.body = body;
  }

  abort() {
    this.onabort?.();
  }

  respond(status, responseText = '', contentType) {
    this.status = status;
    this.responseText = responseText;
    if (contentType) this.responseHeaders['Content-Type'] = contentType;
    this.onload();
  }
}

const presigned = { method: 'PUT', url: 'http://localhost:9000/b/k', headers: { 'Content-Type': 'text/plain' } };

beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXHR));
afterEach(() => vi.unstubAllGlobals());

test('uploadWithProgress envoie le fichier avec les headers signés', async () => {
  const upload = uploadWithProgress(presigned, 'data');
  const xhr = FakeXHR.last;
  expect(upload.xhr).toBe(xhr);
  expect(xhr.method).toBe('PUT');
  expect(xhr.headers).toEqual({ 'Content-Type': 'text/plain' });
  expect(xhr.body).toBe('data');
  xhr.respond(200);
  await expect(upload).resolves.toMatchObject({ status: 200 });
});

test('uploadWithProgress relaie xhr.upload.onprogress', () => {
  const onProgress = vi.fn();
  uploadWithProgress(presigned, 'data', { onProgress });
  FakeXHR.last.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
  expect(onProgress).toHaveBeenCalledWith({ loaded: 5, total: 10 });
});

test('uploadWithProgress calcule la vitesse et l\'ETA', () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1000);
  const onSpeed = vi.fn();
  uploadWithProgress(presigned, 'data', { onSpeed });
  FakeXHR.last.upload.onprogress({ lengthComputable: true, loaded: 1024, total: 2048 });
  expect(onSpeed).toHaveBeenCalledWith({ bytesPerSecond: 1024, eta: 1 });
});

test('xhr.abort() rejette la Promise avec aborted', async () => {
  const upload = uploadWithProgress(presigned, 'data');
  upload.xhr.abort();
  await expect(upload).rejects.toMatchObject({ aborted: true, message: 'Upload annulé' });
});

test('uploadWithProgress rejette avec le status HTTP', async () => {
  const upload = uploadWithProgress(presigned, 'data');
  FakeXHR.last.respond(403);
  await expect(upload).rejects.toMatchObject({ status: 403 });
});

test('request parse le JSON et sérialise le corps', async () => {
  const promise = request({ url: '/api/presign/upload', method: 'POST', body: { a: 1 } });
  const xhr = FakeXHR.last;
  expect(xhr.headers['Content-Type']).toBe('application/json');
  expect(xhr.body).toBe('{"a":1}');
  xhr.respond(200, '{"ok":true}', 'application/json; charset=utf-8');
  await expect(promise).resolves.toMatchObject({ status: 200, data: { ok: true } });
});

test('request rejette avec le message d\'erreur du backend', async () => {
  const promise = request({ url: '/api/presign/upload' });
  FakeXHR.last.respond(413, '{"error":{"code":"FILE_TOO_LARGE","message":"Trop gros"}}', 'application/json');
  await expect(promise).rejects.toMatchObject({ status: 413, message: 'Trop gros' });
});
