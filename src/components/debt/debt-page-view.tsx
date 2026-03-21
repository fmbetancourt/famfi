'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  Save,
  TrendingDown,
  Trophy,
} from 'lucide-react'
import { trpc } from '@/infrastructure/trpc/client'
import { DebtPayoffTimeline } from './debt-payoff-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  DebtPayoffSimulation,
  StrategyComparison,
} from '@/domain/services/DebtCalculator'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
  return '$' + Math.abs(amount).toLocaleString('de-DE')
}

function formatMonths(months: number): string {
  if (months === 0) return '0 meses'
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${months} mes${months === 1 ? '' : 'es'}`
  if (rem === 0) return `${years} año${years === 1 ? '' : 's'}`
  return `${years}a ${rem}m`
}

/**
 * Debounces a value by the given delay in milliseconds.
 * Uses a functional updater so the effect only re-runs when value/delay change.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay, setDebounced])
  return debounced
}

function utilizationBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-blue-500'
}

/** Derives slider bounds from the minimum required payment. */
function computeSliderRange(minimumReq: number): {
  sliderMin: number
  sliderMax: number
} {
  return {
    sliderMin: Math.max(1, Math.ceil(minimumReq / 100_000) * 100_000),
    sliderMax: Math.ceil((minimumReq * 6) / 100_000) * 100_000,
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditCardData {
  id: string
  name: string
  bank: string
  currentBalance: number
  creditLimit: number
  rateRevolving: number
  isActive: boolean
  isFrozen: boolean
  owner: { name: string }
}

interface ActivePlanData {
  name: string
  monthlyPayment: number
  projectedMonths: number
}

// ─── LoadingSkeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className='flex flex-col gap-4'>
      <div className='h-44 animate-pulse rounded-xl bg-muted' />
      <div className='h-24 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
      <div className='h-72 animate-pulse rounded-xl bg-muted' />
    </div>
  )
}

// ─── DebtOverviewCard ─────────────────────────────────────────────────────────

function DebtOverviewCard({
  totalDebt,
  estimatedMonthlyInterest,
  cardCount,
}: Readonly<{
  totalDebt: number
  estimatedMonthlyInterest: number
  cardCount: number
}>) {
  return (
    <div className='relative overflow-hidden rounded-xl bg-linear-to-br from-red-500 to-orange-500 p-5 text-white'>
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-sm font-medium text-white/80'>Deuda Total</p>
          <p className='mt-1 text-4xl font-bold tracking-tight'>
            {formatCLP(totalDebt)}
          </p>
          <p className='mt-1 text-sm text-white/70'>
            en {cardCount} tarjeta{cardCount === 1 ? '' : 's'} con deuda
          </p>
        </div>
        <div className='rounded-lg bg-white/20 p-2.5'>
          <CreditCard className='size-6' />
        </div>
      </div>
      <div className='mt-4 rounded-xl bg-white/10 px-4 py-3'>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-white/80'>Interés mensual estimado</span>
          <span className='font-bold'>
            {formatCLP(estimatedMonthlyInterest)}
          </span>
        </div>
        <p className='mt-1 text-xs text-white/60'>
          Costo sin avanzar en el pago de la deuda
        </p>
      </div>
    </div>
  )
}

// ─── ActivePlanBanner ─────────────────────────────────────────────────────────

function ActivePlanBanner({ plan }: Readonly<{ plan: ActivePlanData }>) {
  return (
    <div className='flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20'>
      <Trophy className='mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-semibold text-green-800 dark:text-green-200'>
          {plan.name}
        </p>
        <p className='mt-0.5 text-xs text-green-700 dark:text-green-400'>
          {formatCLP(plan.monthlyPayment)}/mes &middot;{' '}
          {formatMonths(plan.projectedMonths)} proyectados
        </p>
      </div>
    </div>
  )
}

// ─── CardRow ──────────────────────────────────────────────────────────────────

function CardRow({ card }: Readonly<{ card: CreditCardData }>) {
  const [expanded, setExpanded] = useState(false)
  const utilizationPct =
    card.creditLimit > 0
      ? Math.round((card.currentBalance / card.creditLimit) * 100)
      : 0
  const barColor = utilizationBarColor(utilizationPct)
  const monthlyInterest = Math.round(
    (card.currentBalance * card.rateRevolving) / 100
  )

  return (
    <Card className='overflow-hidden'>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className='w-full p-4 text-left active:opacity-80'
        aria-expanded={expanded}
        aria-label={`Ver detalles de ${card.name}`}
      >
        <div className='flex items-start gap-2'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate text-sm font-semibold'>
                {card.name}
              </span>
              {card.isFrozen && (
                <span className='shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
                  Congelada
                </span>
              )}
            </div>
            <p className='text-xs text-muted-foreground'>{card.bank}</p>
          </div>
          <div className='text-right'>
            <p className='text-sm font-bold'>
              {formatCLP(card.currentBalance)}
            </p>
            <p className='text-xs text-muted-foreground'>
              {card.rateRevolving}%/mes
            </p>
          </div>
          {expanded ? (
            <ChevronUp className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
          ) : (
            <ChevronDown className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
          )}
        </div>

        {/* Utilization bar */}
        <div className='mt-3'>
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>Utilización {utilizationPct}%</span>
            <span>Límite {formatCLP(card.creditLimit)}</span>
          </div>
          <div className='mt-1.5 h-2 rounded-full bg-muted'>
            <div
              className={`h-2 rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(utilizationPct, 100)}%` }}
            />
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <CardContent className='border-t bg-muted/30 px-4 py-3'>
          <div className='grid grid-cols-2 gap-2 text-xs'>
            <div>
              <p className='text-muted-foreground'>Titular</p>
              <p className='font-medium'>{card.owner.name}</p>
            </div>
            <div>
              <p className='text-muted-foreground'>Tasa revolving</p>
              <p className='font-medium'>{card.rateRevolving}% mensual</p>
            </div>
            <div>
              <p className='text-muted-foreground'>Interés mensual</p>
              <p className='font-medium text-red-600 dark:text-red-400'>
                {formatCLP(monthlyInterest)}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>Cupo disponible</p>
              <p className='font-medium text-green-600 dark:text-green-400'>
                {formatCLP(card.creditLimit - card.currentBalance)}
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── SimulatorResults ─────────────────────────────────────────────────────────

function SimulatorResults({
  simulation,
  isLoading,
}: Readonly<{
  simulation: DebtPayoffSimulation | undefined
  isLoading: boolean
}>) {
  if (isLoading) {
    return (
      <div className='flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground'>
        <Loader2 className='size-4 animate-spin' />
        Calculando...
      </div>
    )
  }

  if (!simulation) return null

  return (
    <div className='grid grid-cols-2 gap-2'>
      <div className='rounded-xl bg-muted/50 p-3'>
        <p className='text-xs text-muted-foreground'>Libre de deuda en</p>
        <p className='mt-0.5 text-xl font-bold text-green-600 dark:text-green-400'>
          {formatMonths(simulation.totalMonths)}
        </p>
      </div>
      <div className='rounded-xl bg-muted/50 p-3'>
        <p className='text-xs text-muted-foreground'>Total intereses</p>
        <p className='mt-0.5 text-xl font-bold text-red-600 dark:text-red-400'>
          {formatCLP(simulation.totalInterestPaid)}
        </p>
      </div>
      {simulation.savingsVsMinimum > 0 && (
        <div className='col-span-2 rounded-xl bg-green-50 p-3 dark:bg-green-950/20'>
          <p className='text-xs text-muted-foreground'>
            Ahorro vs solo mínimos
          </p>
          <p className='mt-0.5 text-xl font-bold text-green-700 dark:text-green-300'>
            {formatCLP(simulation.savingsVsMinimum)}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── PaymentSimulatorCard ─────────────────────────────────────────────────────

interface PaymentSimulatorCardProps {
  sliderMin: number
  sliderMax: number
  paymentInput: string
  paymentNum: number
  minimumPaymentRequired: number
  strategy: 'avalanche' | 'snowball'
  simulation: DebtPayoffSimulation | undefined
  simulationFetching: boolean
  saveSuccess: string | null
  saveMutationPending: boolean
  saveMutationError: string | null
  onPaymentChange: (value: string) => void
  onStrategySelect: (s: 'avalanche' | 'snowball') => void
  onSavePlan: () => void
}

function PaymentSimulatorCard({
  sliderMin,
  sliderMax,
  paymentInput,
  paymentNum,
  minimumPaymentRequired,
  strategy,
  simulation,
  simulationFetching,
  saveSuccess,
  saveMutationPending,
  saveMutationError,
  onPaymentChange,
  onStrategySelect,
  onSavePlan,
}: Readonly<PaymentSimulatorCardProps>) {
  const isBelowMinimum = paymentNum > 0 && paymentNum <= minimumPaymentRequired

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>Simulador de Pago</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {/* Payment input + slider */}
        <div>
          <p className='mb-1.5 text-sm font-medium'>Monto mensual para deuda</p>
          <input
            type='number'
            value={paymentInput}
            onChange={(e) => onPaymentChange(e.target.value)}
            placeholder='0'
            min={sliderMin}
            className='h-12 w-full rounded-xl border bg-background px-4 text-xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          />
          <input
            type='range'
            min={sliderMin}
            max={sliderMax}
            step={100_000}
            value={paymentNum > 0 ? paymentNum : sliderMin}
            onChange={(e) => onPaymentChange(e.target.value)}
            className='mt-2 w-full accent-primary'
          />
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>{formatCLP(sliderMin)} mín.</span>
            <span>{formatCLP(sliderMax)}</span>
          </div>
        </div>

        {/* Below-minimum warning */}
        {isBelowMinimum && (
          <div className='flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-300'>
            <AlertTriangle className='mt-0.5 size-4 shrink-0' />
            <span>
              El mínimo para reducir la deuda es{' '}
              {formatCLP(minimumPaymentRequired + 1)}.
            </span>
          </div>
        )}

        {/* Strategy toggle */}
        <div>
          <p className='mb-1.5 text-sm font-medium'>Estrategia</p>
          <div className='grid grid-cols-2 gap-2'>
            <button
              onClick={() => onStrategySelect('avalanche')}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                strategy === 'avalanche'
                  ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-950/30 dark:text-orange-300'
                  : 'border-border hover:bg-muted'
              }`}
            >
              Avalanche
              <p className='mt-0.5 text-xs font-normal opacity-70'>
                Menor interés total
              </p>
            </button>
            <button
              onClick={() => onStrategySelect('snowball')}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                strategy === 'snowball'
                  ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300'
                  : 'border-border hover:bg-muted'
              }`}
            >
              Snowball
              <p className='mt-0.5 text-xs font-normal opacity-70'>
                Tarjetas libres antes
              </p>
            </button>
          </div>
        </div>

        {/* Simulation results */}
        <SimulatorResults
          simulation={simulation}
          isLoading={simulationFetching && simulation === undefined}
        />

        {/* Save plan button */}
        {simulation && (
          <div>
            {saveMutationError && (
              <p className='mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {saveMutationError}
              </p>
            )}
            {saveSuccess && (
              <div className='mb-2 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:bg-green-950/20 dark:text-green-300'>
                <Check className='size-4 shrink-0' />
                Plan activado: {saveSuccess}
              </div>
            )}
            <button
              onClick={onSavePlan}
              disabled={saveMutationPending}
              className='flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50'
            >
              {saveMutationPending ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Save className='size-4' />
              )}
              Activar este plan
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── ComparisonCard ───────────────────────────────────────────────────────────

function ComparisonCard({
  label,
  sim,
  isRecommended,
  strategyKey,
}: Readonly<{
  label: string
  sim: DebtPayoffSimulation
  isRecommended: boolean
  strategyKey: 'avalanche' | 'snowball'
}>) {
  const accentBorder =
    strategyKey === 'avalanche'
      ? 'border-orange-400 dark:border-orange-600'
      : 'border-blue-400 dark:border-blue-600'
  const accentHeader =
    strategyKey === 'avalanche'
      ? 'bg-orange-50 dark:bg-orange-950/20'
      : 'bg-blue-50 dark:bg-blue-950/20'

  return (
    <div
      className={`relative flex-1 overflow-hidden rounded-xl border-2 ${isRecommended ? accentBorder : 'border-border'}`}
    >
      {isRecommended && (
        <div className='absolute right-2 top-2'>
          <span className='flex size-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white'>
            ✓
          </span>
        </div>
      )}
      <div className={`px-3 py-2 ${isRecommended ? accentHeader : ''}`}>
        <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>
          {label}
        </p>
      </div>
      <div className='flex flex-col gap-2 px-3 pb-3 pt-1.5'>
        <div>
          <p className='text-xs text-muted-foreground'>Duración</p>
          <p className='text-base font-bold'>{formatMonths(sim.totalMonths)}</p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Total intereses</p>
          <p className='text-base font-bold text-red-600 dark:text-red-400'>
            {formatCLP(sim.totalInterestPaid)}
          </p>
        </div>
        {sim.savingsVsMinimum > 0 && (
          <div>
            <p className='text-xs text-muted-foreground'>Ahorro vs mínimos</p>
            <p className='text-sm font-semibold text-green-600 dark:text-green-400'>
              {formatCLP(sim.savingsVsMinimum)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StrategyComparisonSection ────────────────────────────────────────────────

function StrategyComparisonSection({
  comparison,
  isLoading,
}: Readonly<{
  comparison: StrategyComparison | undefined
  isLoading: boolean
}>) {
  if (isLoading) {
    return <div className='h-40 animate-pulse rounded-xl bg-muted' />
  }

  if (!comparison) return null

  const { avalanche, snowball, recommendation } = comparison

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <TrendingDown className='size-4' />
          Comparación de Estrategias
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {/* Side-by-side strategy cards */}
        <div className='flex gap-3'>
          <ComparisonCard
            label='Avalanche'
            sim={avalanche}
            isRecommended={recommendation === 'avalanche'}
            strategyKey='avalanche'
          />
          <ComparisonCard
            label='Snowball'
            sim={snowball}
            isRecommended={recommendation === 'snowball'}
            strategyKey='snowball'
          />
        </div>

        {/* Recommendation text */}
        <div className='rounded-xl bg-muted/50 px-4 py-3 text-sm'>
          {recommendation === 'avalanche' && (
            <p>
              <strong>Avalanche</strong> ahorra{' '}
              {formatCLP(Math.abs(comparison.interestDifference))} en intereses
              {comparison.monthsDifference > 0 && (
                <span>
                  {' '}
                  y termina {comparison.monthsDifference} mes
                  {comparison.monthsDifference === 1 ? '' : 'es'} antes
                </span>
              )}
              .
            </p>
          )}
          {recommendation === 'snowball' && (
            <p>
              <strong>Snowball</strong> ahorra{' '}
              {formatCLP(Math.abs(comparison.interestDifference))} en intereses.
            </p>
          )}
          {recommendation === 'equal' && (
            <p>Ambas estrategias tienen el mismo costo total de intereses.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── DebtPageView (main export) ───────────────────────────────────────────────

export function DebtPageView() {
  // null means the user has not typed yet — the suggested default is used instead.
  const [userPaymentInput, setUserPaymentInput] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>(
    'avalanche'
  )
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: overview, isLoading: overviewLoading } =
    trpc.debt.getDebtOverview.useQuery()

  const { data: cards, isLoading: cardsLoading } = trpc.card.getAll.useQuery()

  const { data: activePlan } = trpc.debt.getActivePlan.useQuery()

  // Suggested default: 1.5× the minimum required payment, rounded to the
  // nearest 100 K CLP. Derived from overview so no effect is needed.
  const suggestedDefault = useMemo(() => {
    if (!overview || overview.minimumPaymentRequired <= 0) return ''
    const suggested =
      Math.ceil((overview.minimumPaymentRequired * 1.5) / 100_000) * 100_000
    return String(suggested)
  }, [overview])

  // Effective input: the user's explicit value, or the suggested default
  // while the user has not typed anything yet.
  const paymentInput = userPaymentInput ?? suggestedDefault

  const debouncedPaymentStr = useDebounce(paymentInput, 500)
  const debouncedPayment = Math.floor(Number(debouncedPaymentStr) || 0)

  const minimumReq = overview?.minimumPaymentRequired ?? 0
  const isValidPayment = debouncedPayment > 0 && debouncedPayment > minimumReq

  const { data: simulation, isFetching: simulationFetching } =
    trpc.debt.simulate.useQuery(
      { monthlyPayment: debouncedPayment, strategy, excludeCardIds: [] },
      { enabled: isValidPayment, retry: false }
    )

  const { data: comparison, isFetching: comparisonFetching } =
    trpc.debt.compare.useQuery(
      { monthlyPayment: debouncedPayment, excludeCardIds: [] },
      { enabled: isValidPayment, retry: false }
    )

  const savePlanMutation = trpc.debt.savePlan.useMutation({
    onSuccess: (plan) => {
      setSaveSuccess(plan.name)
      utils.debt.getActivePlan.invalidate()
    },
  })

  function handlePaymentChange(value: string) {
    setSaveSuccess(null)
    setUserPaymentInput(value)
  }

  function handleStrategySelect(selected: 'avalanche' | 'snowball') {
    setSaveSuccess(null)
    setStrategy(selected)
  }

  function handleSavePlan() {
    if (!isValidPayment) return
    setSaveSuccess(null)
    savePlanMutation.mutate({ strategy, monthlyPayment: debouncedPayment })
  }

  // typeof window === 'undefined' on the server → isLoading=true → renders
  // the same skeleton as the first client render (queries still pending) →
  // no hydration mismatch. Avoids the setState-in-effect anti-pattern.
  const isLoading =
    globalThis.window === undefined || overviewLoading || cardsLoading

  if (isLoading) {
    return (
      <div className='p-4 pb-28 md:p-6'>
        <h1 className='text-2xl font-bold'>Deuda</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Simulador de pago de tarjetas
        </p>
        <div className='mt-4'>
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  const hasActiveDebt = (overview?.cardCount ?? 0) > 0
  const debtCards = (cards ?? []).filter(
    (c) => c.currentBalance > 0 && c.isActive
  )
  const { sliderMin, sliderMax } = computeSliderRange(minimumReq)
  const paymentNum = Math.floor(Number(paymentInput) || 0)

  return (
    <div className='flex flex-col gap-4 p-4 pb-28 md:p-6'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-bold'>Deuda</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Simulador de pago de tarjetas
        </p>
      </div>

      {/* Active plan banner */}
      {activePlan && (
        <ActivePlanBanner
          plan={{
            name: activePlan.name,
            monthlyPayment: activePlan.monthlyPayment,
            projectedMonths: activePlan.projectedMonths ?? 0,
          }}
        />
      )}

      {/* Debt overview */}
      {hasActiveDebt && overview && (
        <DebtOverviewCard
          totalDebt={overview.totalDebt}
          estimatedMonthlyInterest={overview.estimatedMonthlyInterest}
          cardCount={overview.cardCount}
        />
      )}

      {/* No debt state */}
      {overview?.cardCount === 0 && (
        <div className='flex flex-col items-center gap-3 py-10 text-center'>
          <div className='rounded-full bg-green-100 p-5 dark:bg-green-900/30'>
            <Trophy className='size-10 text-green-600 dark:text-green-400' />
          </div>
          <p className='text-lg font-semibold'>Sin deuda activa</p>
          <p className='text-sm text-muted-foreground'>
            No hay tarjetas con saldo pendiente.
          </p>
        </div>
      )}

      {/* Card list with utilization bars */}
      {debtCards.length > 0 && (
        <section>
          <h2 className='mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            Tarjetas con Deuda
          </h2>
          <div className='flex flex-col gap-2'>
            {debtCards.map((card) => (
              <CardRow key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {/* Payment simulator */}
      {hasActiveDebt && (
        <PaymentSimulatorCard
          sliderMin={sliderMin}
          sliderMax={sliderMax}
          paymentInput={paymentInput}
          paymentNum={paymentNum}
          minimumPaymentRequired={minimumReq}
          strategy={strategy}
          simulation={simulation}
          simulationFetching={simulationFetching}
          saveSuccess={saveSuccess}
          saveMutationPending={savePlanMutation.isPending}
          saveMutationError={savePlanMutation.error?.message ?? null}
          onPaymentChange={handlePaymentChange}
          onStrategySelect={handleStrategySelect}
          onSavePlan={handleSavePlan}
        />
      )}

      {/* Debt payoff timeline — full area chart with card evolution */}
      {simulation && (
        <DebtPayoffTimeline simulation={simulation} cards={debtCards} />
      )}

      {/* Strategy comparison */}
      <StrategyComparisonSection
        comparison={comparison}
        isLoading={comparisonFetching && comparison === undefined}
      />
    </div>
  )
}
