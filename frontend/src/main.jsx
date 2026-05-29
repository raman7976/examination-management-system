import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Order matters: tokens.css MUST load before any component renders so its
// CSS variables are resolvable. index.css is the existing Tailwind entry.
import './design/tokens.css';
import './index.css';

import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { Toaster } from './components/ui/Toast.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
