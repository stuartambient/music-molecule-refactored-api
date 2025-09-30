import React from 'react';
import ReactDOM from 'react-dom/client';
import { AudioPlayerProvider } from './AudioPlayerProvider'; // Import the provider
import { ContextMenuListener } from './ContextMenuListener';
import './assets/index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AudioPlayerProvider>
      <ContextMenuListener>
        <App />
      </ContextMenuListener>
    </AudioPlayerProvider>
  </React.StrictMode>
);
