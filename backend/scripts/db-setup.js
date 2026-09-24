/**
 * Database bootstrap helper.
 *
 * Prisma's schema push creates the tables, indexes and enums declared in
 * prisma/schema.prisma. This script adds the one index Prisma cannot express:
 * the partial unique index that keeps a doctor's slot from being held by two
 * live (Pending/Confirmed) appointments at the same time.
 *
 *   npm run db:setup   -> generate client + push schema + ensure indexes
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { prisma, ensureIndexes } = require('../src/db');

(async () => {
  const [row] = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.appointments') IS NOT NULL AS "exists"`
  );
  if (!row || !row.exists) {
    throw new Error('Tables are missing — run "npx prisma db push" first (npm run db:push)');
  }

  await ensureIndexes();
  console.log('[db] Partial unique index ready: appointments_live_slot_unique');
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(`[db] setup failed: ${err.message}`);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
