// src/lib/user-credential-db.ts
// Prisma helpers for per-user NbLM credential storage.
// Dynamic import of prisma ensures this module is never loaded in local mode.
import { prisma } from '@/lib/db';

/**
 * Upsert the encrypted NotebookLM storage state for a user.
 * Creates a new record if none exists, or updates the existing one.
 */
export async function upsertCredential(userId: string, encryptedState: string): Promise<void> {
  await prisma.userCredential.upsert({
    where: { user_id: userId },
    create: { user_id: userId, encrypted_state: encryptedState },
    update: { encrypted_state: encryptedState },
  });
}

/**
 * Retrieve the encrypted NotebookLM storage state for a user.
 * Returns null if no credential has been stored for this user.
 */
export async function getCredential(userId: string): Promise<{ encrypted_state: string } | null> {
  return prisma.userCredential.findUnique({
    where: { user_id: userId },
    select: { encrypted_state: true },
  });
}
