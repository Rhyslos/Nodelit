// import modules
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';

// initialization functions
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);