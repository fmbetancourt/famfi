import { CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PaymentDue {
  bank: string
  dueDay: number
  daysLeft: number
  totalBalance?: number
  minPayment?: number
}

interface UpcomingPaymentsCardProps {
  payments: PaymentDue[]
}

function formatCLP(amount: number): string {
  return '$' + Math.abs(amount).toLocaleString('de-DE')
}

function urgencyVariant(days: number) {
  if (days <= 3) return 'destructive' as const
  if (days <= 7) return 'secondary' as const
  return 'outline' as const
}

function urgencyLabel(days: number): string {
  if (days === 0) return 'HOY'
  if (days === 1) return 'Mañana'
  return `${days} días`
}

export function UpcomingPaymentsCard({
  payments,
}: Readonly<UpcomingPaymentsCardProps>) {
  const sorted = [...payments].sort((a, b) => a.daysLeft - b.daysLeft)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CalendarClock className='size-4 text-muted-foreground' />
          Próximos Vencimientos
        </CardTitle>
      </CardHeader>
      <CardContent className='grid gap-3'>
        {sorted.map((p) => (
          <div
            key={`${p.bank}-${p.dueDay}`}
            className='flex items-center justify-between'
          >
            <div>
              <p className='font-medium'>{p.bank}</p>
              <p className='text-xs text-muted-foreground'>
                Vence el día {p.dueDay}
                {p.minPayment !== undefined && p.minPayment > 0 && (
                  <> &middot; Mín. {formatCLP(p.minPayment)}</>
                )}
              </p>
            </div>
            <Badge variant={urgencyVariant(p.daysLeft)}>
              {urgencyLabel(p.daysLeft)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
