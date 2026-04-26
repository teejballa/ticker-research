// src/lib/db.ts
// Prisma client singleton with Neon serverless adapter.
// Global singleton pattern prevents multiple PrismaClient instances during Next.js hot reload.
// @prisma/adapter-neon@7.x PrismaNeon constructor takes a PoolConfig object, not a Pool instance.
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // PrismaNeon@7 accepts PoolConfig directly — internally creates the Pool
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required but not set.');
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
