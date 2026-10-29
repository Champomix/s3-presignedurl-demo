import { useCallback, useEffect, useState } from 'react';
import { getEndpoints, listFiles } from './api/client.js';
import { EndpointSelector } from './components/EndpointSelector.jsx';
import { UploadPanel } from './components/UploadPanel.jsx';
import { PresignedUrlBox } from './components/PresignedUrlBox.jsx';
import { FileList } from './components/FileList.jsx';
import { ConsolePanel } from './components/ConsolePanel.jsx';

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [endpointId, setEndpointId] = useState('');
  const [bucket, setBucket] = useState('');
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

  const writeOnly = endpoints.find((e) => e.id === endpointId)?.buckets.find((b) => b.name === bucket)?.writeOnly ?? false;

  // Bucket par défaut de l'endpoint à chaque changement d'endpoint
  useEffect(() => {
    setBucket(endpoints.find((e) => e.id === endpointId)?.bucket ?? '');
    setFiles([]);
  }, [endpoints, endpointId]);

  // Bucket en écriture seule : list/get/head interdits, on ne liste pas
  const refresh = useCallback(() => {
    if (endpointId && bucket && !writeOnly) listFiles(endpointId, bucket).then(setFiles).catch(onError);
    else setFiles([]);
  }, [endpointId, bucket, writeOnly, onError]);

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
      <EndpointSelector
        endpoints={endpoints}
        value={endpointId}
        onChange={setEndpointId}
        bucket={bucket}
        onBucketChange={setBucket}
      />
      <UploadPanel endpointId={endpointId} bucket={bucket} onPresigned={setPresigned} onUploaded={refresh} onError={onError} />
      {presigned && <PresignedUrlBox key={presigned.url} presigned={presigned} />}
      <FileList
        endpointId={endpointId}
        bucket={bucket}
        writeOnly={writeOnly}
        files={files}
        onRefresh={refresh}
        onPresigned={setPresigned}
        onError={onError}
      />
      <ConsolePanel />
    </main>
  );
}
