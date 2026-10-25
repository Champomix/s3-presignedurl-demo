import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
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
      // Sinon le SDK ajoute un checksum CRC32 à l'URL signée, que le navigateur ne peut pas fournir
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }));
  }
  return clients.get(cfg.id);
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
  const res = await getS3Client(cfg).send(
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
  const res = await getS3Client(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
  return {
    key,
    size: res.ContentLength,
    contentType: res.ContentType,
    lastModified: res.LastModified,
    etag: res.ETag,
  };
}
