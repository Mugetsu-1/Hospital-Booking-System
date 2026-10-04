const express = require('express');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// The SPA and the API normally share an origin locally (the Vite dev server
// proxies /api), so there is nothing to allow-list by default. When the two run
// on separate ports, set CLIENT_URL to the frontend origin. Non-browser callers
// (curl, CI, tests) send no Origin header and are always allowed.
// Mirrors the Socket.IO CORS in services/realtime.js.
const allowedOrigins = [config.clientUrl];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);
app.use(express.json());

// Health probe used by tests / CI / smoke checks.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
