import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/Protected';
import Navbar from './components/Navbar';

import Login from './pages/Login';
import Register from './pages/Register';
import MyAppointments from './pages/patient/MyAppointments';
import BrowseDoctors from './pages/patient/BrowseDoctors';
import PatientProfile from './pages/patient/PatientProfile';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'doctor') return <Navigate to="/doctor" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/patient/appointments" replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="page">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/patient" element={<Navigate to="/patient/appointments" replace />} />
            <Route path="/patient/appointments" element={<ProtectedRoute roles={['patient']} />}>
              <Route index element={<MyAppointments />} />
            </Route>
            <Route path="/patient/browse" element={<ProtectedRoute roles={['patient']} />}>
              <Route index element={<BrowseDoctors />} />
            </Route>
            <Route path="/patient/profile" element={<ProtectedRoute roles={['patient']} />}>
              <Route index element={<PatientProfile />} />
            </Route>

            <Route path="/doctor" element={<ProtectedRoute roles={['doctor']} />}>
              <Route index element={<DoctorDashboard />} />
            </Route>
            <Route path="/admin" element={<ProtectedRoute roles={['admin']} />}>
              <Route index element={<AdminDashboard />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
