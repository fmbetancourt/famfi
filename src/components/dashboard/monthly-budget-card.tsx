import Link from 'next/link'
import { PieChart, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryIcon } from '@/components/transactions/category-icon'

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = 'ok' | 'warning' | 'exceeded'
type PaceTrend = 'ahead' | 'ontrack' | 'behind'

interface TopDeviation {
  name: string
  icon: string | null
  color: string | null
  planned: number
  actual: number
  progress: number
  status: ItemStatus
}

interface MonthlyBudgetCardProps {
  planned: number
  spent: number
  month: string
  hasBudget: boolean
  dayOfMonth: number
  daysInMonth: number
  topDeviations: TopDeviation[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
  return '$' + amount.toLocaleString('de-DE')
}

function progressBarColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

function progressTextColor(pct: number): string {
  if (pct >= 100) return 'text-red-600 dark:text-red-400'
  if (pct >= 80) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function deviationBarColor(status: ItemStatus): string {
  if (status === 'exceeded') return 'bg-red-500'
  if (status === 'warning') return 'bg-yellow-500'
  return 'bg-green-500'
}

function deviationTextColor(status: ItemStatus): string {
  if (status === 'exceeded') return 'text-red-600 dark:text-red-400'
  if (status === 'warning') return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

/**
 * Compares budget spending pace against month progress.
 * `deviation > 10pp` → spending too fast; `< -5pp` → ahead of schedule.
 */
function getPaceTrend(spentPct: number, dayPct: number): PaceTrend {
  const deviation = spentPct - dayPct
  if (deviation > 10) return 'behind'
  if (deviation < -5) return 'ahead'
  return 'ontrack'
}

function paceBadgeClass(trend: PaceTrend): string {
  if (trend === 'behind')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (trend === 'ahead')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
}

function paceBadgeLabel(trend: PaceTrend): string {
  if (trend === 'behind') return 'Atención'
  if (trend === 'ahead') return 'Vas bien'
  return 'A ritmo'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NoBudgetState({ month }: Readonly<{ month: string }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingDown className='size-4 text-muted-foreground' />
          Gasto del Mes
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col items-center gap-3 py-6 text-center'>
        <PieChart className='size-10 text-muted-foreground/40' />
        <div>
          <p className='font-medium'>Sin presupuesto para {month}</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            Define cuánto puedes gastar este mes por categoría.
          </p>
        </div>
        <Link
          href='/budget'
          className='mt-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground'
        >
          Crea tu primer presupuesto →
        </Link>
      </CardContent>
    </Card>
  )
}

function DeviationRow({ item }: Readonly<{ item: TopDeviation }>) {
  return (
    <div>
      <div className='flex items-center justify-between text-xs'>
        <div className='flex items-center gap-1.5'>
          <CategoryIcon
            iconName={item.icon}
            color={item.color}
            className='size-3.5'
          />
          <span className='text-muted-foreground'>{item.name}</span>
        </div>
        <span className={`font-medium ${deviationTextColor(item.status)}`}>
          {item.progress}%
        </span>
      </div>
      <div className='mt-1 h-1.5 rounded-full bg-muted'>
        <div
          className={`h-1.5 rounded-full transition-all ${deviationBarColor(item.status)}`}
          style={{ width: `${Math.min(item.progress, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MonthlyBudgetCard({
  planned,
  spent,
  month,
  hasBudget,
  dayOfMonth,
  daysInMonth,
  topDeviations,
}: Readonly<MonthlyBudgetCardProps>) {
  if (!hasBudget) {
    return <NoBudgetState month={month} />
  }

  const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0
  const remaining = planned - spent
  const dayPct = Math.round((dayOfMonth / daysInMonth) * 100)
  const trend = getPaceTrend(pct, dayPct)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingDown className='size-4 text-muted-foreground' />
          Gasto del Mes
        </CardTitle>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {/* Spending progress bar */}
        <div>
          <div className='flex justify-between text-sm'>
            <span className='text-muted-foreground'>{month}</span>
            <span className={progressTextColor(pct)}>{pct}%</span>
          </div>
          <div className='mt-2 h-3 rounded-full bg-muted'>
            <div
              className={`h-3 rounded-full transition-all ${progressBarColor(pct)}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>

        {/* Budget / Spent stats */}
        <div className='grid grid-cols-2 gap-4 text-sm'>
          <div>
            <p className='text-muted-foreground'>Presupuesto</p>
            <p className='text-lg font-semibold'>{formatCLP(planned)}</p>
          </div>
          <div>
            <p className='text-muted-foreground'>Gastado</p>
            <p className='text-lg font-semibold'>{formatCLP(spent)}</p>
          </div>
        </div>

        {/* Pace mini summary: days-of-month progress vs spending progress */}
        <div className='flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm'>
          <p className='text-muted-foreground'>
            Llevas{' '}
            <span className='font-medium text-foreground'>{dayPct}%</span> del
            mes, has gastado{' '}
            <span className={`font-medium ${progressTextColor(pct)}`}>
              {pct}%
            </span>{' '}
            del presupuesto
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${paceBadgeClass(trend)}`}
          >
            {paceBadgeLabel(trend)}
          </span>
        </div>

        {/* Top 3 categories closest to exceeding budget */}
        {topDeviations.length > 0 && (
          <div className='grid gap-2'>
            <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
              Más cerca de excederse
            </p>
            {topDeviations.map((d) => (
              <DeviationRow key={d.name} item={d} />
            ))}
          </div>
        )}

        {/* Available remaining */}
        <div className='rounded-lg bg-muted/50 px-3 py-2 text-sm'>
          <span className='text-muted-foreground'>Disponible: </span>
          <span className='font-semibold'>
            {formatCLP(Math.max(remaining, 0))}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
