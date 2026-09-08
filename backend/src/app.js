const express = require('express');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow the configured client plus any non-browser (curl/tests) call.
      const allowed = [config.clientUrl];
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(null, true); // keep the lab simple; tighten before production
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
