/**
 * Optional Redis cache layer — fail-open by design.
 *
 * Redis caches read-heavy responses (doctor directory, slot grids) so repeat
 * queries stay well under the 200 ms NFR budget. Every operation degrades to
 * a harmless no-op when REDIS_URL is not configured or Redis is unreachable,
 * so the application runs identically with or without the cache running.
 *
 * Invalidation follows every write in the controllers (prefix delete), so a
 * 60s TTL is only a safety net, never the source of correctness.
 */
const { createClient } = require('redis');
const config = require('../config');

const URL = config.redisUrl;
const TTL = config.policies.cacheTtlSeconds;

let client = null;
let enabled = false;
let warned = false;

function log(msg) {
  console.log(`[cache] ${msg}`);
}

async function connect() {
  if (!URL || enabled) return;
  try {
    client = createClient({ url: URL });
    client.on('error', (err) => {
      enabled = false;
      if (!warned) {
        warned = true;
        log(`Redis unavailable, continuing without cache: ${err.message}`);
      }
    });
    await client.connect();
    enabled = true;
    warned = false;
    log('Redis connected');
  } catch (err) {
    enabled = false;
    if (!warned) {
      warned = true;
      log(`Redis connection failed (${err.message}); continuing without cache`);
    }
  }
}

async function getJSON(key) {
  if (!enabled || !client) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setJSON(key, value, ttl = TTL) {
  if (!enabled || !client) return;
  try {
    await client.setEx(key, ttl, JSON.stringify(value));
  } catch {
    /* cache is an optimisation — never fail a request for it */
  }
}

/** Delete every key that starts with `prefix` (e.g. `slots:5f..`). */
async function delPrefix(prefix) {
  if (!enabled || !client) return;
  try {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(keys);
  } catch {
    /* ignore */
  }
}

module.exports = { connect, getJSON, setJSON, delPrefix };