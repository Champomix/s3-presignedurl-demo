export function EndpointSelector({ endpoints, value, onChange }) {
  return (
    <section className="panel">
      <h2>Endpoint S3</h2>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {endpoints.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} - {e.region} - {e.bucket}
          </option>
        ))}
      </select>
    </section>
  );
}
