import axios from 'axios';

// Dev runs behind the Vite proxy (see vite.config.js), so a relative '/api'
// works. A production bundle is served without that proxy, so the API origin
// can be supplied at build time via VITE_API_URL.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

function messageFrom(err) {
  const data = err.response?.data;
  if (data?.error) return data.error;
  if (Array.isArray(data?.details) && data.details.length) {
    return data.details.join('. ');
  }
  return err.message || 'Request failed';
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const onLoginPage = window.location.pathname === '/login';
      const hasToken = Boolean(localStorage.getItem('token'));
      if (hasToken && !onLoginPage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return Promise.reject(new Error(messageFrom(err)));
  }
);

export default api;
