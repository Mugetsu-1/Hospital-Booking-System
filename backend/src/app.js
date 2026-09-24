const express = require('express');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Restrict browser origins to the configured frontend plus any *.vercel.app
// preview deployment; non-browser callers (curl, CI, the health probe) send
// no Origin and are allowed. Mirrors the Socket.IO CORS in services/realtime.js.
const allowedOrigins = [config.clientUrl, /\.vercel\.app$/];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok = allowedOrigins.some((a) =>
        a instanceof RegExp ? a.test(origin) : a === origin
      );
      return cb(null, ok);
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
