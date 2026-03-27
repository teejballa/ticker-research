// tests/unit/user-credential-db.test.ts
// Unit tests for UserCredential Prisma CRUD helpers (src/lib/user-credential-db.ts)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures mock vars are initialized before vi.mock hoisting
const { mockUpsert, mockFindUnique } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFindUnique: vi.fn(),
}));

// Mock the prisma singleton so no DATABASE_URL is needed in tests
vi.mock('@/lib/db', () => ({
  prisma: {
    userCredential: {
      upsert: mockUpsert,
      findUnique: mockFindUnique,
    },
  },
}));

// Import after mocks are registered
import { upsertCredential, getCredential } from '@/lib/user-credential-db';

describe('user-credential-db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upsertCredential calls prisma.userCredential.upsert with user_id and encrypted_state', async () => {
    mockUpsert.mockResolvedValueOnce({ id: 'uuid-1', user_id: 'user@example.com', encrypted_state: 'enc123' });

    await upsertCredential('user@example.com', 'enc123');

    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { user_id: 'user@example.com' },
      create: { user_id: 'user@example.com', encrypted_state: 'enc123' },
      update: { encrypted_state: 'enc123' },
    });
  });

  it('getCredential returns null when no record exists for user_id', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await getCredential('missing@example.com');

    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledOnce();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { user_id: 'missing@example.com' },
      select: { encrypted_state: true },
    });
  });

  it('getCredential returns the record when it exists for user_id', async () => {
    mockFindUnique.mockResolvedValueOnce({ encrypted_state: 'enc123' });

    const result = await getCredential('user@example.com');

    expect(result).toEqual({ encrypted_state: 'enc123' });
    expect(mockFindUnique).toHaveBeenCalledOnce();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { user_id: 'user@example.com' },
      select: { encrypted_state: true },
    });
  });
});
