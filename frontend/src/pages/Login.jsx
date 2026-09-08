import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, FormField } from '../components/ui';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    const target =
      user.role === 'doctor'
        ? '/doctor'
        : user.role === 'admin'
          ? '/admin'
          : '/patient/appointments';
    navigate(target, { replace: true });
    return null;
  }

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const from = location.state?.from?.pathname;
      const home =
        u.role === 'doctor'
          ? '/doctor'
          : u.role === 'admin'
            ? '/admin'
            : '/patient/appointments';
      navigate(from && from !== '/login' ? from : home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to manage appointments</p>
        <ErrorBanner error={error} />
        <FormField label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={change}
            placeholder="you@example.com"
          />
        </FormField>
        <FormField label="Password">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={change}
            placeholder="Your password"
          />
        </FormField>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-alt">
          New patient?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
