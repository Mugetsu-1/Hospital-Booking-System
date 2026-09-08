const app = require('./app');
const config = require('./config');
const { connectDB } = require('./config/db');

async function start() {
  try {
    await connectDB();
    app.listen(config.port, () => {
      console.log(`[server] API running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
