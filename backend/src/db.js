/**
 * PostgreSQL data access — Prisma 7 with the node-postgres driver adapter.
 *
 * Prisma 7 no longer bundles a database driver: the connection string is
 * handed to `@prisma/adapter-pg`, which wraps a `pg` pool. The Prisma Client
 * itself is generated from prisma/schema.prisma (`npm run db:generate`).
 *
 * `ensureIndexes` (re)creates the partial unique index that guarantees a
 * doctor's slot can only be held by one live (Pending/Confirmed) appointment
 * at a time — the backstop behind the two-request booking race.
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./config');

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

const prisma = new PrismaClient({ adapter });

const LIVE_SLOT_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS appointments_live_slot_unique
  ON appointments (doctor_id, date, start_time)
  WHERE status IN ('Pending', 'Confirmed');
`;

/** Idempotently create the partial unique index for live slot bookings. */
async function ensureIndexes() {
  await prisma.$executeRawUnsafe(LIVE_SLOT_INDEX_SQL);
}

/**
 * Verify the database is reachable and the schema objects exist. Called once
 * from server startup and from the seed / db-setup scripts.
 */
async function connectDB() {
  try {
    const [row] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    console.log(`[db] PostgreSQL connected: ${row.db}`);
    await ensureIndexes();
  } catch (err) {
    console.error(`[db] PostgreSQL connection failed: ${err.message}`);
    console.error('[db] Check DATABASE_URL and run "npm run db:setup" to create the schema.');
    throw err;
  }
}

/** Clean shutdown for scripts / tests. */
async function disconnectDB() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDB, disconnectDB, ensureIndexes };
