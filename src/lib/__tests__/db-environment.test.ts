import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../db';
import { PrismaClient } from '@prisma/client';

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn()
  };
});
vi.mock('@libsql/client', () => ({
  createClient: vi.fn()
}));
vi.mock('@prisma/adapter-libsql', () => ({
  PrismaLibSQL: vi.fn()
}));

describe('Database Environment Selection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('always selects local SQLite in test mode even if Turso vars are present', () => {
    (process.env as any).NODE_ENV = 'test';
    process.env.DATABASE_URL = 'file:../test.db';
    process.env.TURSO_DATABASE_URL = 'libsql://fake.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'fake-token';

    getDatabaseClient();
    
    // It should just call new PrismaClient() without the adapter
    expect(PrismaClient).toHaveBeenCalledWith(); // no arguments
  });

  it('throws an error in test mode if DATABASE_URL is missing', () => {
    (process.env as any).NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    expect(() => getDatabaseClient()).toThrowError(/test environment requires a local SQLite DATABASE_URL/i);
  });

  it('throws an error in test mode if DATABASE_URL does not use file: scheme', () => {
    (process.env as any).NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://localhost';
    expect(() => getDatabaseClient()).toThrowError(/test environment requires a local SQLite DATABASE_URL/i);
  });
});
