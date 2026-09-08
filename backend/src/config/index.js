require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital_booking',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Optional Redis cache (fail-open — see src/utils/cache.js)
  redisUrl: process.env.REDIS_URL || '',

  // Optional SMTP e-mail transport (fail-open — see src/services/mailer.js)
  mail: {
    enabled:
      process.env.MAIL_ENABLED === 'true' && Boolean(process.env.SMTP_HOST) && Boolean(process.env.MAIL_FROM),
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },

  // Business rules / policy knobs
  policies: {
    // Patients may cancel / reschedule no later than this many hours
    // before the appointment start time (the "cutoff window").
    cancelCutoffHours: 2,
    // Doctors may edit consultation notes only within this window after
    // the appointment takes place.
    notesEditWindowHours: 24,
    // Read-through cache lifetime (seconds). Writes invalidate eagerly,
    // so this is purely a safety net.
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60),
  },
};
