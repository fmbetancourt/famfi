import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTRPCContext } from './trpc'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: { __isMock: true } }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: { secret: 'test' } }))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createTRPCContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { session, prisma } when getServerSession resolves with a valid session', async () => {
    const mockSession = {
      user: {
        id: 'u1',
        name: 'Freddy',
        email: 'freddy@famfi.cl',
        familyId: 'f1',
      },
      expires: '9999-12-31',
    }
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

    const ctx = await createTRPCContext()

    expect(ctx.session).toBe(mockSession)
    expect(ctx.prisma).toBe(prisma)
  })

  it('returns { session: null, prisma } when getServerSession resolves with null', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)

    const ctx = await createTRPCContext()

    expect(ctx.session).toBeNull()
    expect(ctx.prisma).toBe(prisma)
  })
})
