import { Router } from 'express';
import { z } from 'zod';
import { findEndpoint, selectBucket, assertReadable } from '../config/loadEndpoints.js';
import { listFiles, headFile, deleteFile } from '../services/s3.js';

const MAX_KEYS = 1000;

const listSchema = z.object({
  endpointId: z.string().min(1),
  bucket: z.string().min(1).optional(),
  prefix: z.string().optional(),
  maxKeys: z.coerce.number().int().min(1).max(MAX_KEYS).default(MAX_KEYS),
});

export function filesRouter(endpoints) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const query = listSchema.parse(req.query);
      const cfg = selectBucket(findEndpoint(endpoints, query.endpointId), query.bucket);
      assertReadable(cfg);
      const files = await listFiles(cfg, query);
      res.json({ endpointId: cfg.id, bucket: cfg.bucket, files });
    } catch (err) {
      next(err);
    }
  });

  // La clé doit être encodée (encodeURIComponent) : elle contient des "/"
  router.get('/:endpointId/:key/meta', async (req, res, next) => {
    try {
      const cfg = selectBucket(findEndpoint(endpoints, req.params.endpointId), req.query.bucket);
      assertReadable(cfg);
      res.json(await headFile(cfg, req.params.key));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:endpointId/:key', async (req, res, next) => {
    try {
      const cfg = selectBucket(findEndpoint(endpoints, req.params.endpointId), req.query.bucket);
      await deleteFile(cfg, req.params.key);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
