import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { findEndpoint } from '../config/loadEndpoints.js';
import { AppError } from '../middleware/errorHandler.js';
import { presignUpload, presignDownload } from '../services/s3.js';

const MAX_KEY_LENGTH = 1024;

const uploadSchema = z.object({
  endpointId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

const downloadSchema = z.object({
  endpointId: z.string().min(1),
  key: z.string().min(1).max(MAX_KEY_LENGTH),
});

export function presignRouter(endpoints, { expiresIn, maxUploadSize }) {
  const router = Router();

  router.post('/upload', async (req, res, next) => {
    try {
      const body = uploadSchema.parse(req.body);
      const cfg = findEndpoint(endpoints, body.endpointId);
      if (body.size > maxUploadSize) {
        throw new AppError(413, 'FILE_TOO_LARGE', `Fichier trop volumineux (max ${maxUploadSize} octets)`);
      }
      const safeName = path.basename(body.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `uploads/${Date.now()}-${safeName}`.slice(0, MAX_KEY_LENGTH);
      const url = await presignUpload(cfg, { key, contentType: body.contentType, expiresIn });
      // On logge la clé, jamais l'URL (elle contient la signature)
      console.info(`PUT signé : ${cfg.id}/${key}`);
      res.json({ url, method: 'PUT', key, expiresIn, headers: { 'Content-Type': body.contentType } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/download', async (req, res, next) => {
    try {
      const body = downloadSchema.parse(req.body);
      const cfg = findEndpoint(endpoints, body.endpointId);
      const url = await presignDownload(cfg, { key: body.key, expiresIn });
      console.info(`GET signé : ${cfg.id}/${body.key}`);
      res.json({ url, method: 'GET', key: body.key, expiresIn });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
