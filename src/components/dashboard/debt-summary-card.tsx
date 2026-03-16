import { CreditCard } from 'lucide-react'

interface DebtSummaryCardProps {
  totalDebt: number
  cardCount: number
  totalLimit: number
  monthlyInterest?: number
}

function formatCLP(amount: number): string {
  return '$' + Math.abs(amount).toLocaleString('de-DE')
}

export function DebtSummaryCard({
  totalDebt,
  cardCount,
  totalLimit,
  monthlyInterest,
}: Readonly<DebtSummaryCardProps>) {
  const utilization =
    totalLimit > 0 ? Math.round((totalDebt / totalLimit) * 100) : 0

  return (
    <div className='relative overflow-hidden rounded-xl bg-linear-to-br from-red-500 to-orange-500 p-5 text-white'>
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-sm font-medium text-white/80'>Deuda Total</p>
          <p className='mt-1 text-3xl font-bold tracking-tight'>
            {formatCLP(totalDebt)}
          </p>
          <p className='mt-1 text-sm text-white/70'>
            en {cardCount} tarjetas &middot; {utilization}% utilizado
          </p>
          {monthlyInterest !== undefined && monthlyInterest > 0 && (
            <p className='mt-0.5 text-xs text-white/60'>
              ~{formatCLP(monthlyInterest)}/mes en intereses
            </p>
          )}
        </div>
        <div className='rounded-lg bg-white/20 p-2'>
          <CreditCard className='size-6' />
        </div>
      </div>
      <div className='mt-4'>
        <div className='flex justify-between text-xs text-white/70'>
          <span>Utilizado</span>
          <span>Límite {formatCLP(totalLimit)}</span>
        </div>
        <div className='mt-1 h-2 rounded-full bg-white/20'>
          <div
            className='h-2 rounded-full bg-white/80'
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
