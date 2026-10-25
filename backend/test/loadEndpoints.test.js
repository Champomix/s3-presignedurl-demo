import { expect, test } from 'vitest';
import { loadEndpoints } from '../src/config/loadEndpoints.js';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

test('remplace ${VAR} par les variables d\'environnement', () => {
  const [cfg] = loadEndpoints();
  expect(cfg.accessKeyId).toBe('test-access');
  expect(cfg.secretAccessKey).toBe('test-secret');
});

test('rejette publicEndpoint avec un message explicite', () => {
  expect(() => loadEndpoints(fixture('endpoints-public.json'))).toThrow(
    /publicEndpoint n'est plus supporté, utilisez un seul champ endpoint/,
  );
});

test('échoue si une variable référencée n\'est pas définie', () => {
  expect(() => loadEndpoints(fixture('endpoints-missing-var.json'))).toThrow(/UNDEFINED_VAR_FOR_TEST/);
});
