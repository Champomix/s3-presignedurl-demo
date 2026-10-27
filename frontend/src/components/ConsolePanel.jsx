import { useEffect, useState } from 'react';
import { getConsoleEvents } from '../api/client.js';

const POLL_MS = 2000;
const MAX_LINES = 50;

const STATUS = { ok: 'OK', error: 'ERREUR' };

export function ConsolePanel() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let after = 0;
    let stopped = false;
    const poll = async () => {
      try {
        const fresh = await getConsoleEvents(after);
        if (stopped || fresh.length === 0) return;
        after = fresh[fresh.length - 1].id;
        setEvents((prev) => [...prev, ...fresh].slice(-MAX_LINES));
      } catch {
        // console indisponible : on réessaie au prochain tick
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel">
      <h2>Console S3</h2>
      <p className="muted">Commandes S3 réalisées par l'application, avec leur équivalent AWS CLI et HTTP.</p>
      {events.length === 0 ? (
        <p className="muted">Aucune opération pour l'instant.</p>
      ) : (
        <ol className="console">
          {events.map((e) => (
            <li key={e.id} className={`console-${e.actor}`}>
              <div>
                <strong>{e.operation}</strong> <span className="muted">[{e.actor}] {e.endpointId}</span>
                {e.status && <span className={`console-status console-${e.status}`}> {STATUS[e.status]}</span>}
                {e.durationMs !== undefined && <span className="muted"> {e.durationMs} ms</span>}
                {e.error && <span className="console-error"> {e.error}</span>}
              </div>
              <code>$ {e.cli}</code>
              {e.http && <code>{e.http}</code>}
              {e.note && <em className="muted">{e.note}</em>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
