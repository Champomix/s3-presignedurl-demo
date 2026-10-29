export function EndpointSelector({ endpoints, value, onChange, bucket, onBucketChange }) {
  const buckets = endpoints.find((e) => e.id === value)?.buckets ?? [];
  return (
    <section className="panel selectors">
      <label>
        Endpoint S3
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} - {e.region}
            </option>
          ))}
        </select>
      </label>
      <label>
        Bucket de destination
        <select value={bucket} onChange={(e) => onBucketChange(e.target.value)}>
          {buckets.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}{b.writeOnly ? ' (écriture seule)' : ''}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
