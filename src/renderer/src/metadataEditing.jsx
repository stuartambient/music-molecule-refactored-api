import React from 'react';
import ReactDOM from 'react-dom/client';
import './assets/index.css';
import MetadataEditingApp from './components/ChildWindows/metadataEditingWindow/MetadataEditingComponent';
import { AudioProvider } from './components/table/AudioProvider';
import { ThemeProvider } from './ThemeContext';
import './themes.css';

ReactDOM.createRoot(document.getElementById('metadata-editing')).render(
  <React.StrictMode>
    <AudioProvider>
      <ThemeProvider>
        <MetadataEditingApp />
      </ThemeProvider>
    </AudioProvider>
  </React.StrictMode>
);
