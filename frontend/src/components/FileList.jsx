import { useState } from 'react';
import { deleteFile, presignDownload } from '../api/client.js';
import { downloadFile } from '../api/presigned.js';
import { ProgressBar } from './ProgressBar.jsx';

const UNITS = ['o', 'Ko', 'Mo', 'Go'];

function formatSize(bytes) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${UNITS[unit]}`;
}

// uploads/1700000000-photo.jpg -> photo.jpg
const displayName = (key) => key.split('/').pop().replace(/^\d+-/, '');

export function FileList({ endpointId, files, onRefresh, onPresigned, onError }) {
  const [download, setDownload] = useState(null);

  const start = async (key) => {
    onError(null);
    setDownload({ key, loaded: 0, total: 0 });
    try {
      const presigned = await presignDownload({ endpointId, key });
      onPresigned(presigned);
      await downloadFile(presigned, displayName(key), ({ loaded, total }) => setDownload({ key, loaded, total }));
    } catch (err) {
      onError(err);
    } finally {
      setDownload(null);
    }
  };

  const remove = async (key) => {
    if (!window.confirm(`Supprimer ${key} ?`)) return;
    onError(null);
    try {
      await deleteFile(endpointId, key);
      onRefresh();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <section className="panel">
      <div className="row">
        <h2>Fichiers</h2>
        <button onClick={onRefresh}>Rafraîchir</button>
      </div>
      {files.length === 0 ? (
        <p className="muted">Aucun fichier.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Clé</th><th>Taille</th><th>Modifié</th><th /></tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.key}>
                <td className="mono">{f.key}</td>
                <td>{formatSize(f.size)}</td>
                <td>{new Date(f.lastModified).toLocaleString('fr-FR')}</td>
                <td>
                  {download?.key === f.key ? (
                    <ProgressBar loaded={download.loaded} total={download.total} />
                  ) : (
                    <>
                      <button onClick={() => start(f.key)} disabled={download !== null}>Télécharger</button>
                      <button onClick={() => remove(f.key)} disabled={download !== null}>Supprimer</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
