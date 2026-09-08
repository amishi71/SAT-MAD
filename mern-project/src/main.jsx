// Example wiring — merge into src/main.jsx (or gate App.jsx itself) once
// Login.jsx / Login.css are added to src/.
//
// This keeps App.jsx (the dashboard) completely untouched: the login
// screen sits in front of it and only mounts the dashboard once
// onLogin fires.

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import Login from './Login.jsx';

function Root() {
  const [user, setUser] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return <App user={user} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
