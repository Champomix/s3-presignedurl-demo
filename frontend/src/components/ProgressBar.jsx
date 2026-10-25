export function ProgressBar({ loaded, total }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : null;
  return (
    <div className="progress">
      {/* Sans value, <progress> est indéterminée */}
      <progress value={pct ?? undefined} max={100} />
      <span>{pct === null ? 'en cours...' : `${pct} %`}</span>
    </div>
  );
}
