import { useEffect, useState } from 'react';
import useIpcEvent from './hooks/useIpcEvent';
import './StartupGuard.css';

function RepairScreen({ reason }) {
  const [message, setMessage] = useState('Attempting to repair the music catalog…');
  const [busy, setBusy] = useState(true);

  useIpcEvent('recovery-error', (error) => {
    setMessage(error);
    setBusy(false);
  });

  useEffect(() => {
    let active = true;
    window.ipcApi
      .dbRepair()
      .then((result) => {
        if (!active) return;
        if (result.fixed) {
          setMessage('Catalog repaired. Opening Music Molecule…');
          window.ipcApi.recoveryComplete();
        } else {
          setMessage(result.error || 'Unable to repair the catalog. Restore a backup to continue.');
          setBusy(false);
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const restore = async () => {
    setBusy(true);
    setMessage('Looking for a healthy catalog backup…');
    try {
      const result = await window.ipcApi.dbRestore();
      if (result.restored) {
        setMessage('Catalog restored. Opening Music Molecule…');
        window.ipcApi.recoveryComplete();
      } else {
        setMessage(result.error || 'The catalog could not be restored.');
        setBusy(false);
      }
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="repair-screen-dialog">
      <div className="panel">
        <h2>Catalog recovery</h2>
        <p>{reason}</p>
        <p role="status">{message}</p>
        <button onClick={restore} disabled={busy}>
          Restore Latest Healthy Backup
        </button>
      </div>
    </div>
  );
}

export function StartupGuard({ children }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;
    window.ipcApi
      .dbCheck()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((error) => {
        if (active) setStatus({ ok: false, error: error.message });
      });
    return () => {
      active = false;
    };
  }, []);

  if (!status) return <div role="status">Checking music catalog…</div>;
  if (!status.ok) return <RepairScreen reason={status.error} />;
  return children;
}
