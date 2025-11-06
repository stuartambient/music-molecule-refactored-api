import { useEffect, useState } from 'react';

async function onRestore() {
  const res = await window.ipcApi.invoke('db-restore');
  if (res.restored) {
    alert('Database restored. Restarting app…');
    window.ipcApi.send('app-restart');
  } else {
    alert('Restore failed: ' + res.error);
  }
}

function RepairScreen() {
  const [msg, setMsg] = useState('Attempting repair...');

  useEffect(() => {
    window.ipcApi.invoke('db-repair').then((res) => {
      if (res.fixed) window.ipcApi.send('app-restart');
      else setMsg('Unable to repair. Please restore backup.');
    });
  }, []);

  return (
    <div>
      <p>{msg}</p>
      {!msg.startsWith('Attempting') && <button onClick={onRestore}>Restore Latest Backup</button>}
    </div>
  );
}

export function StartupGuard({ children }) {
  const [status, setStatus] = useState('checking'); // checking | ok | repair | fail

  useEffect(() => {
    window.ipcApi.invoke('db-check').then((result) => {
      if (result.ok) setStatus('ok');
      else setStatus('repair');
    });
  }, []);

  if (status === 'checking') return <div>Checking database...</div>;

  if (status === 'repair') return <RepairScreen />; // runs diagnostic + backup restore UI

  return children; // load real app
}
