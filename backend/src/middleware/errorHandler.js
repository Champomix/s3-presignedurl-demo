import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const S3_NOT_FOUND = new Set(['NoSuchKey', 'NoSuchBucket', 'NotFound']);
const S3_FORBIDDEN = new Set(['AccessDenied', 'SignatureDoesNotMatch', 'InvalidAccessKeyId']);

function send(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

// Express reconnaît un gestionnaire d'erreurs à ses 4 paramètres : _next doit rester
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) return send(res, err.status, err.code, err.message);
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return send(res, 400, 'VALIDATION_ERROR', message);
  }
  if (err.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Corps JSON invalide');
  if (S3_NOT_FOUND.has(err.name)) return send(res, 404, 'NOT_FOUND', 'Objet ou bucket introuvable');
  if (S3_FORBIDDEN.has(err.name)) {
    console.error(`Erreur S3 ${err.name} : ${err.message} (vérifier les identifiants, l'endpoint et le Host transmis par la gateway)`);
    return send(res, 403, 'S3_FORBIDDEN', 'Accès refusé par le stockage');
  }
  console.error(err);
  send(res, 500, 'INTERNAL_ERROR', 'Erreur interne');
}
