import { PrismaClient } from '@prisma/client'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import { db } from '../db'
import { beforeEach } from 'vitest'

export const mockDb = mockDeep<PrismaClient>()

beforeEach(() => {
  mockReset(mockDb)
})
