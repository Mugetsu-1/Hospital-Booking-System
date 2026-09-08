const mongoose = require('mongoose');
const config = require('../config');

async function connectDB() {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`[db] MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

module.exports = { connectDB };
