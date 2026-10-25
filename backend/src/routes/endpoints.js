import { Router } from 'express';

export function endpointsRouter(endpoints) {
  const router = Router();

  // Jamais de secrets vers le front
  router.get('/', (req, res) => {
    res.json(endpoints.map(({ id, name, endpoint, region, bucket, forcePathStyle }) => (
      { id, name, endpoint, region, bucket, forcePathStyle }
    )));
  });

  return router;
}
