import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

// TODO(Week 2): Fetch and render transaction list via trpc.transaction.list (infinite scroll, filters by date/member/category)
// TODO(Week 7): Add offline queue with Zustand — cache transactions locally, sync on reconnect
export default function TransactionsPage() {
  return (
    <div className='p-4 md:p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Gastos</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Registro de transacciones
          </p>
        </div>
        <Link href='/transactions/new'>
          <Button size='sm' className='hidden md:flex'>
            <Plus className='mr-1 size-4' />
            Nuevo
          </Button>
        </Link>
      </div>

      <div className='mt-8 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground'>
        <p className='text-lg'>No hay transacciones aún</p>
        <p className='text-sm'>Registra tu primer gasto con el botón +</p>
      </div>

      {/* Mobile FAB */}
      <Link
        href='/transactions/new'
        className='fixed bottom-24 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden'
      >
        <Plus className='size-6' />
      </Link>
    </div>
  )
}
