import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getConsoleEvents } from '../api/client.js';
import { ConsolePanel } from './ConsolePanel.jsx';

vi.mock('../api/client.js', () => ({ getConsoleEvents: vi.fn() }));

test('affiche la commande CLI et la requête HTTP', async () => {
  getConsoleEvents.mockResolvedValue([
    {
      id: 1,
      actor: 'backend',
      endpointId: 'rustfs-local',
      operation: 'DeleteObject',
      cli: 'aws s3api delete-object --bucket b --key k',
      http: 'DELETE http://localhost:9000/b/k',
      status: 'ok',
      durationMs: 5,
    },
  ]);
  render(<ConsolePanel />);
  expect(await screen.findByText('DeleteObject')).toBeTruthy();
  expect(screen.getByText('$ aws s3api delete-object --bucket b --key k')).toBeTruthy();
  expect(screen.getByText('DELETE http://localhost:9000/b/k')).toBeTruthy();
});
