'use client'

import Link from 'next/link'
import { CreditCard, TrendingDown } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DebtPlanWidgetProps =
  | { hasPlan: false; totalDebt: number }
  | {
      hasPlan: true
      planName: string
      monthlyPayment: number
      remainingMonths: number
      originalMonths: number
      /** Algebraic estimate: monthlyPayment × projectedMonths − projectedInterest */
      estimatedInitialDebt: number
      currentTotalDebt: number
      nextCard: { name: string; month: number } | null
    }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
  const digits = Math.abs(Math.round(amount)).toString()
  let result = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) result += '.'
    result += digits[i]
  }
  return '$' + result
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NoPlanState({ totalDebt }: Readonly<{ totalDebt: number }>) {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <div className='flex items-center gap-1.5 text-sm text-muted-foreground'>
            <CreditCard className='size-4' />
            <span>Sin plan de pago activo</span>
          </div>
          <p className='text-3xl font-bold tabular-nums'>
            {formatCLP(totalDebt)}
          </p>
          <p className='text-xs text-muted-foreground'>Deuda total actual</p>
        </div>
        <Link
          href='/debt'
          className={cn(
            buttonVariants({ variant: 'default' }),
            'w-full sm:w-auto'
          )}
        >
          Simula tu plan de pago →
        </Link>
      </CardContent>
    </Card>
  )
}

interface ProgressBarProps {
  /** 0–100 */
  value: number
}

function ProgressBar({ value }: Readonly<ProgressBarProps>) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
      <div
        className='h-full rounded-full bg-green-500 transition-all'
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DebtPlanWidget(props: DebtPlanWidgetProps) {
  if (!props.hasPlan) {
    return <NoPlanState totalDebt={props.totalDebt} />
  }

  // Show progress only when debt actually decreased since plan was created
  const progressPct =
    props.estimatedInitialDebt > 0 &&
    props.currentTotalDebt < props.estimatedInitialDebt
      ? Math.round(
          ((props.estimatedInitialDebt - props.currentTotalDebt) /
            props.estimatedInitialDebt) *
            100
        )
      : null

  return (
    <Card className='overflow-hidden'>
      <CardContent className='pt-5'>
        {/* ── Header: remaining months (prominent) ── */}
        <div className='mb-4 flex items-start justify-between gap-4'>
          <div>
            <p className='text-xs text-muted-foreground'>{props.planName}</p>
            <div className='mt-0.5 flex items-baseline gap-2'>
              <span className='text-4xl font-bold tabular-nums text-green-600 dark:text-green-400'>
                {props.remainingMonths}
              </span>
              <span className='text-base text-muted-foreground'>
                {props.remainingMonths === 1 ? 'mes' : 'meses'} para ser libre
                de deuda
              </span>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {formatCLP(props.monthlyPayment)}/mes
            </p>
          </div>
          <TrendingDown className='mt-1 size-6 shrink-0 text-green-500' />
        </div>

        {/* ── Progress vs original plan ── */}
        {progressPct !== null && (
          <div className='mb-4 space-y-1.5'>
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>Progreso desde el inicio del plan</span>
              <span className='font-semibold text-foreground'>
                {progressPct}%
              </span>
            </div>
            <ProgressBar value={progressPct} />
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>Actual: {formatCLP(props.currentTotalDebt)}</span>
              <span>Inicial: ~{formatCLP(props.estimatedInitialDebt)}</span>
            </div>
          </div>
        )}

        {/* ── Next card to be freed ── */}
        {props.nextCard && (
          <div className='mb-4 rounded-lg bg-muted/50 px-3 py-2.5'>
            <p className='text-xs text-muted-foreground'>
              Próxima tarjeta libre
            </p>
            <p className='mt-0.5 font-medium'>{props.nextCard.name}</p>
            <p className='text-xs text-muted-foreground'>
              en {props.nextCard.month}{' '}
              {props.nextCard.month === 1 ? 'mes' : 'meses'}
            </p>
          </div>
        )}

        {/* ── Link to full simulator ── */}
        <Link
          href='/debt'
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'w-full'
          )}
        >
          Ver simulador completo →
        </Link>
      </CardContent>
    </Card>
  )
}
