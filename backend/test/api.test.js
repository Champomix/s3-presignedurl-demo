import { beforeEach, describe, expect, test } from 'vitest';
import request from 'supertest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { app } from '../src/index.js';

const s3Mock = mockClient(S3Client);
beforeEach(() => s3Mock.reset());

const upload = (body) => request(app).post('/api/presign/upload').send(body);
const validUpload = { endpointId: 'rustfs-local', filename: 'a.txt', contentType: 'text/plain', size: 10 };

test('GET /api/health', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('GET /api/endpoints masque les secrets', async () => {
  const res = await request(app).get('/api/endpoints');
  expect(res.status).toBe(200);
  expect(res.body.map((e) => e.id)).toContain('rustfs-local');
  for (const e of res.body) {
    expect(e).not.toHaveProperty('accessKeyId');
    expect(e).not.toHaveProperty('secretAccessKey');
    expect(e).not.toHaveProperty('publicEndpoint');
  }
});

describe('POST /api/presign/upload', () => {
  test('renvoie une URL signée sur l\'endpoint unique', async () => {
    const res = await upload(validUpload);
    expect(res.status).toBe(200);
    expect(res.body.method).toBe('PUT');
    expect(res.body.headers).toEqual({ 'Content-Type': 'text/plain' });
    const url = new URL(res.body.url);
    expect(url.host).toBe('localhost:9000');
    expect(res.body.url.startsWith('http://localhost:9000/demo-bucket/uploads/')).toBe(true);
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  });

  test('sanitise le nom de fichier', async () => {
    const res = await upload({ ...validUpload, filename: '../../etc/mon fichier.txt' });
    expect(res.body.key).toMatch(/^uploads\/\d+-mon_fichier\.txt$/);
  });

  test('valide le corps (400)', async () => {
    const res = await upload({ endpointId: 'rustfs-local' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejette size > MAX_UPLOAD_SIZE (413)', async () => {
    const res = await upload({ ...validUpload, size: 1001 });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  test('rejette un endpointId inconnu (403)', async () => {
    const res = await upload({ ...validUpload, endpointId: 'inconnu' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('UNKNOWN_ENDPOINT');
  });
});

test('POST /api/presign/download signe un GET', async () => {
  const res = await request(app)
    .post('/api/presign/download')
    .send({ endpointId: 'rustfs-local', key: 'uploads/foo.jpg' });
  expect(res.status).toBe(200);
  expect(res.body.method).toBe('GET');
  expect(res.body.url.startsWith('http://localhost:9000/demo-bucket/uploads/foo.jpg?')).toBe(true);
  expect(res.body.url).toMatch(/X-Amz-Signature=/);
});

describe('GET /api/files', () => {
  test('retourne la liste des objets', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'uploads/a.txt', Size: 10, LastModified: new Date('2025-01-15T10:00:00Z'), ETag: '"abc"' }],
    });
    const res = await request(app).get('/api/files?endpointId=rustfs-local');
    expect(res.status).toBe(200);
    expect(res.body.bucket).toBe('demo-bucket');
    expect(res.body.files).toEqual([
      { key: 'uploads/a.txt', size: 10, lastModified: '2025-01-15T10:00:00.000Z', etag: '"abc"' },
    ]);
  });

  test('retourne un tableau vide si le bucket est vide', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});
    const res = await request(app).get('/api/files?endpointId=rustfs-local');
    expect(res.body.files).toEqual([]);
  });

  test('meta : 404 si l\'objet n\'existe pas', async () => {
    s3Mock.on(HeadObjectCommand).rejects(Object.assign(new Error('not found'), { name: 'NotFound' }));
    const res = await request(app).get(`/api/files/rustfs-local/${encodeURIComponent('uploads/x.txt')}/meta`);
    expect(res.status).toBe(404);
  });
});
