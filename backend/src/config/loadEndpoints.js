import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_FILE = new URL('../../config/endpoints.json', import.meta.url);

const endpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().default(false),
});

function expandEnv(value) {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    if (process.env[name] === undefined) {
      throw new Error(`endpoints.json : la variable d'environnement ${name} n'est pas définie`);
    }
    return process.env[name];
  });
}

// Chargé une seule fois au démarrage : toute modification de endpoints.json nécessite un redémarrage
export function loadEndpoints(file = process.env.ENDPOINTS_FILE || DEFAULT_FILE) {
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  for (const entry of entries) {
    if ('publicEndpoint' in entry) {
      throw new Error(`endpoints.json (${entry.id}) : publicEndpoint n'est plus supporté, utilisez un seul champ endpoint`);
    }
  }
  const expanded = entries.map((entry) =>
    Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, typeof v === 'string' ? expandEnv(v) : v])),
  );
  return z.array(endpointSchema).parse(expanded);
}

export function findEndpoint(endpoints, id) {
  const cfg = endpoints.find((e) => e.id === id);
  if (!cfg) throw new AppError(403, 'UNKNOWN_ENDPOINT', `Endpoint inconnu : ${id}`);
  return cfg;
}
