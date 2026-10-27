import { Agent } from 'node:https';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, record } from './console.js';

const clients = new Map();

// Un seul client par endpoint, pour les appels serveur comme pour la signature
export function getS3Client(cfg) {
  if (!clients.has(cfg.id)) {
    clients.set(cfg.id, new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.forcePathStyle,
      // Certificat auto-signé : ne concerne que les appels serveur (list/head), pas les URLs présignées
      ...(cfg.allowSelfSigned && { requestHandler: { httpsAgent: new Agent({ rejectUnauthorized: false }) } }),
      // Sinon le SDK ajoute un checksum CRC32 à l'URL signée, que le navigateur ne peut pas fournir
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }));
  }
  return clients.get(cfg.id);
}

// Trace les échecs de connexion (DNS, refus, timeout, certificat) avec l'endpoint concerné
async function send(cfg, command, desc) {
  const started = Date.now();
  try {
    const res = await getS3Client(cfg).send(command);
    record({ actor: 'backend', endpointId: cfg.id, ...desc, status: 'ok', durationMs: Date.now() - started });
    return res;
  } catch (err) {
    record({ actor: 'backend', endpointId: cfg.id, ...desc, status: 'error', durationMs: Date.now() - started, error: err.code ?? err.name });
    const cause = err.cause ?? {};
    console.error(
      `[s3] ${command.constructor.name} ${cfg.id} ${cfg.endpoint} bucket=${cfg.bucket} échec après ${Date.now() - started} ms : ` +
      `name=${err.name} code=${err.code ?? cause.code ?? '-'} message="${err.message}"` +
      (err.$metadata?.httpStatusCode ? ` http=${err.$metadata.httpStatusCode}` : '') +
      (cause.message ? ` cause="${cause.message}"` : '') +
      (cfg.allowSelfSigned ? '' : ' allowSelfSigned=false'),
    );
    throw err;
  }
}

// La signature est locale (aucun appel S3) : l'exécution revient ensuite au navigateur
function recordPresign(cfg, key, expiresIn, browserDesc) {
  record({ actor: 'backend', endpointId: cfg.id, ...describe.presign(cfg, key, expiresIn), status: 'ok', note: 'Signature locale, aucun appel au stockage' });
  record({ actor: 'navigateur', endpointId: cfg.id, ...browserDesc, status: null, note: 'Exécuté par le navigateur avec l\'URL présignée' });
}

export async function presignUpload(cfg, { key, contentType, expiresIn }) {
  const command = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType });
  // Content-Type signé : le PUT du navigateur doit envoyer exactement la même valeur
  const url = await getSignedUrl(getS3Client(cfg), command, { expiresIn, signableHeaders: new Set(['content-type']) });
  recordPresign(cfg, key, expiresIn, describe.put(cfg, key, contentType));
  return url;
}

export async function presignDownload(cfg, { key, expiresIn }) {
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
  const url = await getSignedUrl(getS3Client(cfg), command, { expiresIn });
  recordPresign(cfg, key, expiresIn, describe.get(cfg, key));
  return url;
}

export async function listFiles(cfg, { prefix, maxKeys }) {
  const res = await send(
    cfg,
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, MaxKeys: maxKeys }),
    describe.list(cfg, { prefix, maxKeys }),
  );
  return (res.Contents ?? []).map((o) => ({
    key: o.Key,
    size: o.Size,
    lastModified: o.LastModified,
    etag: o.ETag,
  }));
}

export async function headFile(cfg, key) {
  const res = await send(cfg, new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }), describe.head(cfg, key));
  return {
    key,
    size: res.ContentLength,
    contentType: res.ContentType,
    lastModified: res.LastModified,
    etag: res.ETag,
  };
}

export async function deleteFile(cfg, key) {
  await send(cfg, new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }), describe.delete(cfg, key));
}
