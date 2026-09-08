import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LINKS = {
  patient: [
    { to: '/patient/appointments', label: 'My Appointments' },
    { to: '/patient/browse', label: 'Find a Doctor' },
    { to: '/patient/profile', label: 'My Profile' },
  ],
  doctor: [{ to: '/doctor', label: 'My Schedule' }],
  admin: [{ to: '/admin', label: 'Administration' }],
};

const ROLE_LABEL = { patient: 'Patient', doctor: 'Doctor', admin: 'Admin' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = user ? LINKS[user.role] || [] : [];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            CareBook <small>Appointments</small>
          </span>
        </Link>

        {user && (
          <nav className="nav-links" aria-label="Main">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="nav-actions">
          {user ? (
            <>
              <span className="user-chip">
                <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span className="user-meta">
                  <strong>{user.name}</strong>
                  <small>{ROLE_LABEL[user.role]}</small>
                </span>
              </span>
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
