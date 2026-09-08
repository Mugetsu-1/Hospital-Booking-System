const http = require('http');
const app = require('./app');
const config = require('./config');
const { connectDB } = require('./config/db');
const { connect: connectCache } = require('./utils/cache');
const realtime = require('./services/realtime');

async function start() {
  try {
    await connectDB();
    // Optional: no-op when Redis is not configured / unreachable.
    await connectCache();

    const server = http.createServer(app);
    // Optional: mounts Socket.IO on the same port; REST keeps working
    // even if the socket layer fails to initialise.
    realtime.init(server);

    server.listen(config.port, () => {
      console.log(`[server] API running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
