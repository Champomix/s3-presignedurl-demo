import { useRef, useState } from 'react';
import { presignUpload } from '../api/client.js';
import { uploadFile } from '../api/presigned.js';
import { ProgressBar } from './ProgressBar.jsx';

export function UploadPanel({ endpointId, bucket, onPresigned, onUploaded, onError }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [speed, setSpeed] = useState(null);
  const xhrRef = useRef(null);

  const start = async () => {
    onError(null);
    setUploading(true);
    setProgress({ loaded: 0, total: file.size });
    setSpeed(null);
    try {
      // Doit être identique au Content-Type signé par le backend
      const contentType = file.type || 'application/octet-stream';
      const presigned = await presignUpload({ endpointId, bucket, filename: file.name, contentType, size: file.size });
      onPresigned(presigned);
      const upload = uploadFile(presigned, file, { onProgress: setProgress, onSpeed: setSpeed });
      xhrRef.current = upload.xhr;
      await upload;
      onUploaded();
    } catch (err) {
      onError(err);
    } finally {
      xhrRef.current = null;
      setUploading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Upload</h2>
      <div className="row">
        <input type="file" disabled={uploading} onChange={(e) => setFile(e.target.files[0] ?? null)} />
        <button onClick={start} disabled={!file || !endpointId || !bucket || uploading}>Uploader</button>
        <button onClick={() => xhrRef.current?.abort()} disabled={!uploading}>Annuler</button>
      </div>
      {progress && <ProgressBar loaded={progress.loaded} total={progress.total} />}
      {speed && (
        <p className="muted">
          {Math.round(speed.bytesPerSecond / 1024)} Ko/s - reste {Number.isFinite(speed.eta) ? `${Math.ceil(speed.eta)} s` : '-'}
        </p>
      )}
    </section>
  );
}
