import { Router } from 'express';
import { eventsAfter } from '../services/console.js';

export function consoleRouter() {
  const router = Router();
  router.get('/', (req, res) => res.json(eventsAfter(Number(req.query.after) || 0)));
  return router;
}
