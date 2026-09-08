import { useState, useEffect, useCallback } from 'react';
import { Wifi, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

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

  useEffect(() => {
    setErrors(validate(form));
  }, [form]);

  const handleChange = useCallback((field) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    const currentErrors = validate(form);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) return;

    onLogin?.({ email: form.email.trim() });
  };

  const showError = (field) => touched[field] && errors[field];
  const hasErrors = Object.keys(errors).length > 0;

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

          <button type="submit" className="auth-submit" disabled={hasErrors}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
