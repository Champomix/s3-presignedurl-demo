// Journal en mémoire des opérations S3, affiché dans la console pédagogique du front
const MAX_EVENTS = 100;
const events = [];
let lastId = 0;

export function record(event) {
  events.push({ id: ++lastId, time: new Date().toISOString(), ...event });
  if (events.length > MAX_EVENTS) events.shift();
}

export const eventsAfter = (id) => events.filter((e) => e.id > id);

function objectUrl(cfg, key = '') {
  const u = new URL(cfg.endpoint);
  const suffix = key ? `/${key}` : '';
  return cfg.forcePathStyle ? `${u.origin}/${cfg.bucket}${suffix}` : `${u.protocol}//${cfg.bucket}.${u.host}${suffix}`;
}

const aws = (cfg, cmd, args = '') => `aws s3api ${cmd} --bucket ${cfg.bucket} ${args} --endpoint-url ${cfg.endpoint}`.replace(/ {2,}/g, ' ');

// Équivalents CLI et HTTP de chaque opération, sans jamais inclure de signature
export const describe = {
  list: (cfg, { prefix, maxKeys }) => ({
    operation: 'ListObjectsV2',
    cli: aws(cfg, 'list-objects-v2', `${prefix ? `--prefix ${prefix} ` : ''}--max-items ${maxKeys}`),
    http: `GET ${objectUrl(cfg)}?list-type=2${prefix ? `&prefix=${prefix}` : ''}&max-keys=${maxKeys}`,
  }),
  head: (cfg, key) => ({
    operation: 'HeadObject',
    cli: aws(cfg, 'head-object', `--key ${key}`),
    http: `HEAD ${objectUrl(cfg, key)}`,
  }),
  delete: (cfg, key) => ({
    operation: 'DeleteObject',
    cli: aws(cfg, 'delete-object', `--key ${key}`),
    http: `DELETE ${objectUrl(cfg, key)}`,
  }),
  presign: (cfg, key, expiresIn) => ({
    operation: 'Presign',
    cli: `aws s3 presign s3://${cfg.bucket}/${key} --expires-in ${expiresIn} --endpoint-url ${cfg.endpoint}`,
    http: null,
  }),
  put: (cfg, key, contentType) => ({
    operation: 'PutObject',
    cli: aws(cfg, 'put-object', `--key ${key} --body <fichier> --content-type ${contentType}`),
    http: `PUT ${objectUrl(cfg, key)}?<signature>  (Content-Type: ${contentType})`,
  }),
  get: (cfg, key) => ({
    operation: 'GetObject',
    cli: aws(cfg, 'get-object', `--key ${key} <fichier>`),
    http: `GET ${objectUrl(cfg, key)}?<signature>`,
  }),
};
