import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads the database URL from this file instead of the datasource
// block in schema.prisma. dotenv/config loads backend/.env; an already-set
// DATABASE_URL environment variable takes precedence, which is how the
// CI workflow and test scripts point at their own database.
//
// `process.env.DATABASE_URL` (rather than env('DATABASE_URL')) keeps
// `prisma generate` working during npm install even before a database is
// configured — only the commands that actually touch the database need it.

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
