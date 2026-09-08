import { useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, SuccessBanner, FormField } from '../../components/ui';

function fromUser(user) {
  return {
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    age: user.age ?? '',
    gender: user.gender || '',
    address: user.address || '',
    emergencyContact: user.emergencyContact || '',
  };
}

export default function PatientProfile() {
  const { user, patchUser } = useAuth();
  const [form, setForm] = useState(() => fromUser(user));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
    setNotice('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      age: form.age === '' ? undefined : Number(form.age),
      gender: form.gender,
      address: form.address.trim(),
      emergencyContact: form.emergencyContact.trim(),
    };
    try {
      const res = await api.patch(`/patients/${user._id}`, payload);
      patchUser(res.data.data);
      setForm(fromUser(res.data.data));
      setNotice('Profile updated.');
    } catch (err) {
      setError(err.message || 'Could not update profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My Profile</h1>
        <p className="muted small">Your account details and emergency contact information.</p>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          {error && <ErrorBanner error={error} />}
          {notice && <SuccessBanner message={notice} />}

          <div className="form-grid">
            <FormField label="Full name">
              <input name="name" required value={form.name} onChange={change} placeholder="Patient name" />
            </FormField>
            <FormField label="Email address">
              <input type="email" name="email" value={form.email} disabled />
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
              <textarea
                name="address"
                rows={2}
                value={form.address}
                onChange={change}
                placeholder="Street, city"
              />
            </div>
          </div>

          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
