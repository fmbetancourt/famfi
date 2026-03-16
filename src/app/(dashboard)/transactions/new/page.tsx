import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExpenseForm } from '@/components/transactions/expense-form'

export default async function NewTransactionPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Fetch family members for the "who spent" toggle
  const members = await prisma.familyMember.findMany({
    where: { familyId: session.user.familyId, role: 'PROVIDER' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className='mx-auto max-w-lg p-4 md:p-6'>
      <div className='mb-5'>
        <h1 className='text-xl font-bold'>Registrar Gasto</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Ingresa los detalles del gasto
        </p>
      </div>
      <ExpenseForm userId={session.user.id} familyMembers={members} />
    </div>
  )
}
