import { describe, expect, it } from 'vitest'
import { FamilyMember, type FamilyMemberProps } from './FamilyMember'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROVIDER_PROPS: FamilyMemberProps = {
  id: 'member-1',
  name: 'Freddy',
  email: 'freddy@example.com',
  role: 'PROVIDER',
  familyId: 'family-1',
}

const DEPENDENT_PROPS: FamilyMemberProps = {
  id: 'member-2',
  name: 'Mamá',
  email: null,
  role: 'DEPENDENT',
  familyId: 'family-1',
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('FamilyMember — construction', () => {
  it('assigns id from props', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.id).toBe('member-1')
  })

  it('assigns name from props', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.name).toBe('Freddy')
  })

  it('assigns email from props', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.email).toBe('freddy@example.com')
  })

  it('assigns null email from props', () => {
    const member = new FamilyMember(DEPENDENT_PROPS)
    expect(member.email).toBeNull()
  })

  it('assigns role from props', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.role).toBe('PROVIDER')
  })

  it('assigns familyId from props', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.familyId).toBe('family-1')
  })
})

// ─── isProvider ───────────────────────────────────────────────────────────────

describe('FamilyMember.isProvider()', () => {
  it('returns true when role is PROVIDER', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.isProvider()).toBe(true)
  })

  it('returns false when role is DEPENDENT', () => {
    const member = new FamilyMember(DEPENDENT_PROPS)
    expect(member.isProvider()).toBe(false)
  })
})

// ─── isDependent ──────────────────────────────────────────────────────────────

describe('FamilyMember.isDependent()', () => {
  it('returns true when role is DEPENDENT', () => {
    const member = new FamilyMember(DEPENDENT_PROPS)
    expect(member.isDependent()).toBe(true)
  })

  it('returns false when role is PROVIDER', () => {
    const member = new FamilyMember(PROVIDER_PROPS)
    expect(member.isDependent()).toBe(false)
  })
})
