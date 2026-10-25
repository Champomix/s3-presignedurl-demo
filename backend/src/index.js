import 'dotenv/config';
import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { loadEndpoints } from './config/loadEndpoints.js';
import { endpointsRouter } from './routes/endpoints.js';
import { presignRouter } from './routes/presign.js';
import { filesRouter } from './routes/files.js';
import { errorHandler } from './middleware/errorHandler.js';

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_EXPIRES_IN = Number(process.env.PRESIGN_EXPIRES_DEFAULT || 300);
const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE || 100 * 1024 * 1024);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080').split(',');

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const endpoints = loadEndpoints();

export const app = express();

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version });
});
app.use('/api/endpoints', endpointsRouter(endpoints));
app.use('/api/presign', presignRouter(endpoints, { expiresIn: DEFAULT_EXPIRES_IN, maxUploadSize: MAX_UPLOAD_SIZE }));
app.use('/api/files', filesRouter(endpoints));
app.use(errorHandler);

if (!process.env.VITEST) {
  app.listen(PORT, () => console.info(`Backend démarré sur le port ${PORT}`));
}
