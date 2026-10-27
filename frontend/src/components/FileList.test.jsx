import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { deleteFile } from '../api/client.js';
import { FileList } from './FileList.jsx';

vi.mock('../api/client.js', () => ({ presignDownload: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../api/presigned.js', () => ({ downloadFile: vi.fn() }));

const files = [{ key: 'uploads/1-a.txt', size: 5, lastModified: '2024-01-01T00:00:00Z' }];

function setup() {
  const props = { endpointId: 'rustfs-local', files, onRefresh: vi.fn(), onPresigned: vi.fn(), onError: vi.fn() };
  render(<FileList {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteFile.mockResolvedValue();
});

test('Supprimer appelle l\'API après confirmation puis rafraîchit', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
  expect(deleteFile).toHaveBeenCalledWith('rustfs-local', 'uploads/1-a.txt');
});

test('Supprimer ne fait rien si la confirmation est refusée', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  expect(deleteFile).not.toHaveBeenCalled();
  expect(props.onRefresh).not.toHaveBeenCalled();
});
