require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital_booking',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Business rules / policy knobs
  policies: {
    // Patients may cancel / reschedule no later than this many hours
    // before the appointment start time (the "cutoff window").
    cancelCutoffHours: 2,
    // Doctors may edit consultation notes only within this window after
    // the appointment takes place.
    notesEditWindowHours: 24,
  },
};
