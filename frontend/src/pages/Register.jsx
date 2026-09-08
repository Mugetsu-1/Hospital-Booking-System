import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, FormField } from '../components/ui';

const initial = {
  name: '',
  email: '',
  password: '',
  phone: '',
  age: '',
  gender: '',
  address: '',
  emergencyContact: '',
};

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/patient/appointments', { replace: true });
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
    const payload = { ...form, age: form.age === '' ? undefined : Number(form.age) };
    try {
      await register(payload);
      navigate('/patient/appointments', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Create patient account</h1>
        <p className="muted">Book appointments with hospital doctors</p>
        <ErrorBanner error={error} />
        <div className="form-grid">
          <FormField label="Full name">
            <input name="name" required value={form.name} onChange={change} placeholder="Patient name" />
          </FormField>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={form.password}
              onChange={change}
              placeholder="At least 6 characters"
            />
          </FormField>
          <FormField label="Phone">
            <input name="phone" value={form.phone} onChange={change} placeholder="Mobile number" />
          </FormField>
          <FormField label="Age">
            <input
              type="number"
              name="age"
              min={0}
              max={130}
              value={form.age}
              onChange={change}
              placeholder="Years"
            />
          </FormField>
          <FormField label="Gender">
            <select name="gender" value={form.gender} onChange={change}>
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </FormField>
          <FormField label="Emergency contact">
            <input
              name="emergencyContact"
              value={form.emergencyContact}
              onChange={change}
              placeholder="Name & phone of a contact"
            />
          </FormField>
          <div className="field field-wide">
            <span className="field-label">Address</span>
            <textarea name="address" value={form.address} onChange={change} rows={2} placeholder="Street, city" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth-alt">
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
