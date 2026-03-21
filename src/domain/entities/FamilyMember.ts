export type MemberRole = 'PROVIDER' | 'DEPENDENT'

export interface FamilyMemberProps {
  readonly id: string
  readonly name: string
  readonly email: string | null
  readonly role: MemberRole
  readonly familyId: string
}

export class FamilyMember {
  readonly id: string
  readonly name: string
  readonly email: string | null
  readonly role: MemberRole
  readonly familyId: string

  constructor(props: FamilyMemberProps) {
    this.id = props.id
    this.name = props.name
    this.email = props.email
    this.role = props.role
    this.familyId = props.familyId
  }

  isProvider(): boolean {
    return this.role === 'PROVIDER'
  }

  isDependent(): boolean {
    return this.role === 'DEPENDENT'
  }
}
