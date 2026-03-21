import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TransactionListView } from '@/components/transactions/transaction-list-view'

// TODO(Week 7): Add offline queue with Zustand — cache transactions locally, sync on reconnect
export default async function TransactionsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const members = await prisma.familyMember.findMany({
    where: { familyId: session.user.familyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <TransactionListView userId={session.user.id} familyMembers={members} />
  )
}
