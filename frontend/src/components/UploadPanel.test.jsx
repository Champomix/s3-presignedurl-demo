import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { presignUpload } from '../api/client.js';
import { uploadFile } from '../api/presigned.js';
import { UploadPanel } from './UploadPanel.jsx';

vi.mock('../api/client.js', () => ({ presignUpload: vi.fn() }));
vi.mock('../api/presigned.js', () => ({ uploadFile: vi.fn() }));

const presigned = { url: 'http://localhost:9000/demo-bucket/uploads/1-a.txt', method: 'PUT', expiresIn: 300 };

function setup() {
  const props = { endpointId: 'rustfs-local', bucket: 'demo-bucket', onPresigned: vi.fn(), onUploaded: vi.fn(), onError: vi.fn() };
  const { container } = render(<UploadPanel {...props} />);
  const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
  fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Uploader' }));
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  presignUpload.mockResolvedValue(presigned);
});

test('demande une URL présignée puis lance l\'upload', async () => {
  uploadFile.mockReturnValue(Object.assign(Promise.resolve(), { xhr: {} }));
  const props = setup();
  await waitFor(() => expect(props.onUploaded).toHaveBeenCalled());
  expect(presignUpload).toHaveBeenCalledWith({
    endpointId: 'rustfs-local',
    bucket: 'demo-bucket',
    filename: 'a.txt',
    contentType: 'text/plain',
    size: 5,
  });
  expect(props.onPresigned).toHaveBeenCalledWith(presigned);
  expect(uploadFile).toHaveBeenCalledWith(presigned, expect.any(File), expect.any(Object));
});

test('Annuler appelle xhr.abort() et affiche l\'erreur', async () => {
  const abort = vi.fn();
  uploadFile.mockImplementation(() => {
    let reject;
    const promise = new Promise((_, r) => { reject = r; });
    return Object.assign(promise, {
      xhr: {
        abort: () => {
          abort();
          reject(Object.assign(new Error('Upload annulé'), { aborted: true }));
        },
      },
    });
  });
  const props = setup();
  await waitFor(() => expect(uploadFile).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(abort).toHaveBeenCalled();
  await waitFor(() => expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Upload annulé' })));
  expect(props.onUploaded).not.toHaveBeenCalled();
});
