'use client';

// /setup/nbm-oauth-complete
// Popup landing page after Google OAuth re-auth.
// Calls the token→cookie exchange endpoint, then signals the parent window and closes.
import { useEffect, useState } from 'react';

type Status = 'exchanging' | 'success' | 'error';

export default function NbmOauthCompletePage() {
  const [status, setStatus] = useState<Status>('exchanging');
  const [error, setError] = useState('');

  useEffect(() => {
    async function exchange() {
      try {
        const res = await fetch('/api/setup/nbm-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'oauth-exchange' }),
        });
        const data = await res.json() as { captured?: boolean; error?: string };
        if (!res.ok || !data.captured) {
          setError(data.error ?? 'Cookie exchange failed');
          setStatus('error');
          return;
        }
        setStatus('success');
        try {
          window.opener?.postMessage('nbm-auth-success', window.location.origin);
        } catch { /* cross-origin guard */ }
        setTimeout(() => window.close(), 600);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        setStatus('error');
      }
    }
    void exchange();
  }, []);

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080a0f',
    fontFamily: 'monospace',
  };
  const cardStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 32px',
    border: '1px solid #1a2d42',
    minWidth: '280px',
  };

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ color: '#4ade80', fontSize: '28px', marginBottom: '12px' }}>✓</div>
          <p style={{ color: 'rgba(74,222,128,0.8)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>
            Research engine connected
          </p>
          <p style={{ color: 'rgba(223,226,235,0.25)', fontSize: '10px', marginTop: '8px' }}>
            Closing window...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ color: 'rgba(255,180,171,0.8)', fontSize: '11px', marginBottom: '12px' }}>
            Connection failed
          </p>
          <p style={{ color: 'rgba(255,180,171,0.5)', fontSize: '10px', marginBottom: '20px' }}>
            {error}
          </p>
          <button
            onClick={() => window.close()}
            style={{
              border: '1px solid rgba(255,180,171,0.3)',
              color: 'rgba(255,180,171,0.6)',
              background: 'none',
              cursor: 'pointer',
              fontSize: '10px',
              fontFamily: 'monospace',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '8px 16px',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // exchanging
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '1px solid rgba(245,158,11,0.6)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(245,158,11,0.7)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>
          Connecting research engine...
        </p>
        <p style={{ color: 'rgba(223,226,235,0.25)', fontSize: '10px', marginTop: '8px' }}>
          This will only take a moment
        </p>
      </div>
    </div>
  );
}
