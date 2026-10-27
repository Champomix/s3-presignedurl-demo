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
async function send(cfg, command) {
  const started = Date.now();
  try {
    return await getS3Client(cfg).send(command);
  } catch (err) {
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

export function presignUpload(cfg, { key, contentType, expiresIn }) {
  const command = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType });
  // Content-Type signé : le PUT du navigateur doit envoyer exactement la même valeur
  return getSignedUrl(getS3Client(cfg), command, { expiresIn, signableHeaders: new Set(['content-type']) });
}

export function presignDownload(cfg, { key, expiresIn }) {
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
  return getSignedUrl(getS3Client(cfg), command, { expiresIn });
}

export async function listFiles(cfg, { prefix, maxKeys }) {
  const res = await send(
    cfg,
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, MaxKeys: maxKeys }),
  );
  return (res.Contents ?? []).map((o) => ({
    key: o.Key,
    size: o.Size,
    lastModified: o.LastModified,
    etag: o.ETag,
  }));
}

export async function headFile(cfg, key) {
  const res = await send(cfg, new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
  return {
    key,
    size: res.ContentLength,
    contentType: res.ContentType,
    lastModified: res.LastModified,
    etag: res.ETag,
  };
}

export async function deleteFile(cfg, key) {
  await send(cfg, new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
