import { useEffect, useState } from 'react';

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Repli si l'API Clipboard est indisponible (contexte non sécurisé, permission refusée)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

export function PresignedUrlBox({ presigned }) {
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((presigned.expiresAt - now) / 1000));
  const expired = remaining === 0;

  const copy = async () => {
    await copyToClipboard(presigned.url);
    setCopied(true);
  };

  return (
    <section className="panel">
      <h2>URL présignée</h2>
      <div className="row">
        <span className={`badge badge-${presigned.method.toLowerCase()}`}>{presigned.method}</span>
        <span className={expired ? 'expired' : 'muted'}>
          {expired ? 'URL expirée' : `Expire dans ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
        </span>
        <button onClick={copy}>{copied ? 'Copié' : 'Copier'}</button>
      </div>
      <code
        className={`url mono ${expanded ? 'expanded' : ''}`}
        title={presigned.url}
        onClick={() => setExpanded(!expanded)}
      >
        {presigned.url}
      </code>
    </section>
  );
}
