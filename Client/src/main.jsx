// import modules
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans/300.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/400-italic.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import './styles/index.css';
import App from './App.jsx';

// initialization functions
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);