import { Router } from 'express';
import { z } from 'zod';
import { findEndpoint } from '../config/loadEndpoints.js';
import { listFiles, headFile } from '../services/s3.js';

const MAX_KEYS = 1000;

const listSchema = z.object({
  endpointId: z.string().min(1),
  prefix: z.string().optional(),
  maxKeys: z.coerce.number().int().min(1).max(MAX_KEYS).default(MAX_KEYS),
});

export function filesRouter(endpoints) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const query = listSchema.parse(req.query);
      const cfg = findEndpoint(endpoints, query.endpointId);
      const files = await listFiles(cfg, query);
      res.json({ endpointId: cfg.id, bucket: cfg.bucket, files });
    } catch (err) {
      next(err);
    }
  });

  // La clé doit être encodée (encodeURIComponent) : elle contient des "/"
  router.get('/:endpointId/:key/meta', async (req, res, next) => {
    try {
      const cfg = findEndpoint(endpoints, req.params.endpointId);
      res.json(await headFile(cfg, req.params.key));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
