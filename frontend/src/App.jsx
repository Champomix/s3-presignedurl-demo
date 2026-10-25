import { useCallback, useEffect, useState } from 'react';
import { getEndpoints, listFiles } from './api/client.js';
import { EndpointSelector } from './components/EndpointSelector.jsx';
import { UploadPanel } from './components/UploadPanel.jsx';
import { PresignedUrlBox } from './components/PresignedUrlBox.jsx';
import { FileList } from './components/FileList.jsx';

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [endpointId, setEndpointId] = useState('');
  const [files, setFiles] = useState([]);
  const [presigned, setPresigned] = useState(null);
  const [error, setError] = useState(null);

  // err = null efface la bannière
  const onError = useCallback((err) => {
    if (err) console.error(err);
    setError(err?.message ?? null);
  }, []);

  useEffect(() => {
    getEndpoints()
      .then((list) => {
        setEndpoints(list);
        setEndpointId(list[0]?.id ?? '');
      })
      .catch(onError);
  }, [onError]);

  const refresh = useCallback(() => {
    if (endpointId) listFiles(endpointId).then(setFiles).catch(onError);
  }, [endpointId, onError]);

  useEffect(refresh, [refresh]);

  return (
    <main>
      <h1>Démo URL présignées S3</h1>
      {error && (
        <div className="banner-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Fermer</button>
        </div>
      )}
      <EndpointSelector endpoints={endpoints} value={endpointId} onChange={setEndpointId} />
      <UploadPanel endpointId={endpointId} onPresigned={setPresigned} onUploaded={refresh} onError={onError} />
      {presigned && <PresignedUrlBox key={presigned.url} presigned={presigned} />}
      <FileList
        endpointId={endpointId}
        files={files}
        onRefresh={refresh}
        onPresigned={setPresigned}
        onError={onError}
      />
    </main>
  );
}
