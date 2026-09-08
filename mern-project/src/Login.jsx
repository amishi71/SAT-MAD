import { useState, useEffect, useCallback } from 'react';
import { Wifi, Mail, Lock, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

// ---------------------------------------------------------------------------
// DEV MOCK — remove this whole block once /api/auth/login and /api/auth/me
// exist on your Express server. Set to false to test real 404s.
// ---------------------------------------------------------------------------
const USE_MOCK_AUTH = true;

function mockLogin({ email, password }) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (password.toLowerCase().includes('wrong')) {
        reject(new Error('Invalid email or password'));
        return;
      }
      resolve({
        token: 'mock-token-' + Date.now(),
        user: { email, name: email.split('@')[0] },
      });
    }, 600); // simulated network delay
  });
}

function mockMe(token) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!token.startsWith('mock-token-')) {
        reject(new Error('Session expired'));
        return;
      }
      resolve({ email: 'you@mission.control', name: 'you' });
    }, 300);
  });
}
// ---------------------------------------------------------------------------

function validate({ email, password }) {
  const errors = {};

  if (!email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  } else if (password.length < MIN_PASSWORD_LEN) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  }

  return errors;
}

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | checking | submitting | error
  const [serverError, setServerError] = useState('');

  // Re-validate live, any time the field values change.
  useEffect(() => {
    setErrors(validate(form));
  }, [form]);

  // On mount: check for an existing session so a returning user
  // isn't shown a blank login form unnecessarily.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    setStatus('checking');

    const request = USE_MOCK_AUTH
      ? mockMe(token)
      : fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        });

    request
      .then((user) => {
        if (!cancelled) onLogin?.(user);
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem('token');
          setStatus('idle');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onLogin]);

  const handleChange = useCallback((field) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleBlur = useCallback((field) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    const currentErrors = validate(form);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) return;

    setStatus('submitting');
    setServerError('');

    try {
      const credentials = { email: form.email.trim(), password: form.password };

      const data = USE_MOCK_AUTH
        ? await mockLogin(credentials)
        : await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        }).then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.message || 'Invalid email or password');
          return body;
        });

      if (data.token) localStorage.setItem('token', data.token);
      setStatus('idle');
      onLogin?.(data.user ?? null);
    } catch (err) {
      setStatus('error');
      setServerError(err.message || 'Something went wrong. Try again.');
    }
  };

  const isChecking = status === 'checking';
  const isSubmitting = status === 'submitting';
  const showError = (field) => touched[field] && errors[field];

  if (isChecking) {
    return (
      <div className="auth-screen">
        <div className="auth-checking">
          <LoaderCircle size={18} className="spin" />
          <span>Checking session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Wifi size={20} className="auth-brand-icon" />
          <div>
            <div className="auth-brand-name">SENTINEL</div>
            <div className="auth-brand-sub">Orbital Telemetry</div>
          </div>
        </div>

        <h1 className="auth-title">Sign in</h1>
        <p className="auth-subtitle">Access the mission control console</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <div className={`input-shell ${showError('email') ? 'input-error' : ''}`}>
              <Mail size={15} className="input-icon" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@mission.control"
                value={form.email}
                onChange={handleChange('email')}
                onBlur={handleBlur('email')}
                aria-invalid={Boolean(showError('email'))}
                aria-describedby="email-error"
              />
            </div>
            {showError('email') && (
              <span className="field-error" id="email-error">{errors.email}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className={`input-shell ${showError('password') ? 'input-error' : ''}`}>
              <Lock size={15} className="input-icon" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange('password')}
                onBlur={handleBlur('password')}
                aria-invalid={Boolean(showError('password'))}
                aria-describedby="password-error"
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {showError('password') && (
              <span className="field-error" id="password-error">{errors.password}</span>
            )}
          </div>

          {serverError && <div className="auth-server-error">{serverError}</div>}

          <button
            type="submit"
            className="auth-submit"
            disabled={isSubmitting || Object.keys(errors).length > 0}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle size={15} className="spin" />
                <span>Signing in…</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
