'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingDown } from 'lucide-react'
import type { DebtPayoffSimulation } from '@/domain/services/DebtCalculator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Warm-to-cool color palette assigned in descending-balance order.
 * The highest-debt card always maps to red; smaller cards shift toward cool hues.
 * As cards are paid off the chart naturally becomes "greener", mirroring the
 * visual intent of "rojo (mucha deuda) → verde (cerca de 0)".
 */
const CARD_COLORS = [
  '#ef4444', // red    — heaviest debt
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet — lightest debt
]

const MAX_CHART_POINTS = 60

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
  return '$' + Math.abs(amount).toLocaleString('de-DE')
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}

/**
 * Reduces `snapshots` to at most `maxPoints` entries while always including
 * the final snapshot. Preserves the shape of the debt curve for very long
 * simulations (e.g. 120 months → ~60 chart points).
 */
function downsample(
  snapshots: DebtPayoffSimulation['monthlySnapshots'],
  maxPoints: number
): DebtPayoffSimulation['monthlySnapshots'] {
  if (snapshots.length <= maxPoints) return snapshots
  const step = Math.ceil(snapshots.length / maxPoints)
  const result: DebtPayoffSimulation['monthlySnapshots'] = []
  for (let i = 0; i < snapshots.length; i += step) {
    result.push(snapshots[i])
  }
  // Always include the last data point
  const last = snapshots.at(-1)
  if (last && result.at(-1) !== last) {
    result.push(last)
  }
  return result
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardEntry {
  id: string
  name: string
  initialBalance: number
  color: string
}

/** One row in the Recharts data array. Card IDs act as dynamic keys. */
type ChartPoint = Record<string, number> & {
  month: number
  accInterest: number
  monthlyPayment: number
}

type TooltipPayloadItem = {
  dataKey: string
  value: number
  payload: ChartPoint
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function TimelineTooltip({
  active,
  payload,
  label,
  cardEntries,
}: Readonly<{
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: number
  cardEntries: CardEntry[]
}>) {
  if (!active || !payload || payload.length === 0) return null

  const dataPoint = payload[0]?.payload
  if (!dataPoint) return null

  const cardItems = cardEntries
    .map((card) => ({
      id: card.id,
      name: card.name,
      balance: dataPoint[card.id] ?? 0,
      color: card.color,
    }))
    .filter((c) => c.balance > 0)

  const totalDebt = cardItems.reduce((sum, c) => sum + c.balance, 0)
  const accInterest = dataPoint.accInterest ?? 0
  const monthlyPayment = dataPoint.monthlyPayment ?? 0

  if (totalDebt === 0) return null

  return (
    <div className='rounded-xl border bg-background/95 p-3 text-xs shadow-lg backdrop-blur-sm'>
      <p className='mb-2 font-semibold'>Mes {label}</p>

      {/* Per-card balance breakdown */}
      <div className='max-h-40 space-y-1 overflow-y-auto'>
        {cardItems.map((c) => (
          <div key={c.id} className='flex items-center justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-1.5'>
              <span
                className='size-2 shrink-0 rounded-full'
                style={{ backgroundColor: c.color }}
              />
              <span className='max-w-27.5 truncate text-muted-foreground'>
                {c.name}
              </span>
            </div>
            <span className='shrink-0 font-medium'>{formatCLP(c.balance)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className='mt-2 space-y-1 border-t pt-2'>
        <div className='flex justify-between gap-3'>
          <span className='text-muted-foreground'>Total deuda</span>
          <span className='font-bold'>{formatCLP(totalDebt)}</span>
        </div>
        {accInterest > 0 && (
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>Interés acumulado</span>
            <span className='text-red-500'>{formatCLP(accInterest)}</span>
          </div>
        )}
        {monthlyPayment > 0 && (
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>Pago este mes</span>
            <span>{formatCLP(monthlyPayment)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tooltip factory ──────────────────────────────────────────────────────────

/**
 * Returns a stable tooltip renderer pre-bound to the given card entries.
 * Defined at module level so the returned function is not re-created inside
 * DebtPayoffTimeline's render cycle (avoids the nested-component lint rule).
 */
function createTooltipContent(cardEntries: CardEntry[]) {
  return function TooltipContent(props: {
    active?: boolean
    payload?: unknown
    label?: number | string
  }) {
    return (
      <TimelineTooltip
        active={props.active}
        payload={props.payload as TooltipPayloadItem[] | undefined}
        label={
          typeof props.label === 'number' ? props.label : Number(props.label)
        }
        cardEntries={cardEntries}
      />
    )
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface DebtPayoffTimelineProps {
  simulation: DebtPayoffSimulation
  /** Cards participating in the simulation — used for initial (month 0) balances. */
  cards: ReadonlyArray<{ id: string; name: string; currentBalance: number }>
}

export function DebtPayoffTimeline({
  simulation,
  cards,
}: Readonly<DebtPayoffTimelineProps>) {
  // Cards that appeared in the simulation, sorted by balance desc → warm colors first
  const cardEntries: CardEntry[] = useMemo(() => {
    if (simulation.monthlySnapshots.length === 0) return []
    const simIds = new Set(
      Object.keys(simulation.monthlySnapshots[0].cardBalances)
    )
    return [...cards]
      .filter((c) => simIds.has(c.id))
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        initialBalance: c.currentBalance,
        color: CARD_COLORS[i % CARD_COLORS.length],
      }))
    // Intentional dep: simulation.monthlySnapshots instead of the IDE-suggested
    // simulation.monthlySnapshots[0].cardBalances — the latter throws when the
    // array is empty. The parent array covers both accesses (.length and [0]).
  }, [cards, simulation.monthlySnapshots])

  // Build Recharts data: month 0 = today + downsampled simulation snapshots
  const { chartData, xTicks } = useMemo(() => {
    const sampled = downsample(simulation.monthlySnapshots, MAX_CHART_POINTS)

    const data: ChartPoint[] = [
      // Month 0: current balances before any payment
      {
        month: 0,
        accInterest: 0,
        monthlyPayment: 0,
        ...Object.fromEntries(cardEntries.map((c) => [c.id, c.initialBalance])),
      },
      // Months 1..N: accumulated interest as a prefix sum (no mutation).
      // sampled is at most MAX_CHART_POINTS=60 items, so O(n²) is acceptable.
      ...sampled.map(
        (snap, idx) =>
          ({
            month: snap.month,
            accInterest: sampled
              .slice(0, idx + 1)
              .reduce((sum, s) => sum + s.interestPaid, 0),
            monthlyPayment: snap.interestPaid + snap.principalPaid,
            ...snap.cardBalances,
          }) as ChartPoint
      ),
    ]

    // X-axis ticks: every 6 months, always including the final month
    const ticks: number[] = []
    for (let m = 0; m <= simulation.totalMonths; m += 6) {
      ticks.push(m)
    }
    if (ticks.at(-1) !== simulation.totalMonths) {
      ticks.push(simulation.totalMonths)
    }

    return { chartData: data, xTicks: ticks }
  }, [cardEntries, simulation.monthlySnapshots, simulation.totalMonths])

  // Stable tooltip renderer — only recreated when card entries change
  const tooltipContent = useMemo(
    () => createTooltipContent(cardEntries),
    [cardEntries]
  )

  if (cardEntries.length === 0 || chartData.length < 2) return null

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <TrendingDown className='size-4' />
          Evolución de la Deuda
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width='100%' height={240}>
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              {cardEntries.map((card) => (
                <linearGradient
                  key={card.id}
                  id={`tl-grad-${card.id}`}
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop offset='5%' stopColor={card.color} stopOpacity={0.7} />
                  <stop offset='95%' stopColor={card.color} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>

            <XAxis
              dataKey='month'
              type='number'
              domain={[0, simulation.totalMonths]}
              ticks={xTicks}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `M${v}`}
              padding={{ right: 8 }}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 10 }}
              width={40}
            />

            <Tooltip content={tooltipContent} />

            {/*
             * Stacked areas — rendered bottom-to-top = highest to lowest balance.
             * As the highest-balance (red) card is paid off, cooler colors emerge,
             * giving the "red → green" gradient effect over the course of the plan.
             */}
            {cardEntries.map((card) => (
              <Area
                key={card.id}
                type='monotone'
                dataKey={card.id}
                stackId='debt'
                stroke={card.color}
                strokeWidth={1}
                fill={`url(#tl-grad-${card.id})`}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}

            {/* Vertical reference lines marking when each card reaches zero */}
            {simulation.freedCards.map((fc) => (
              <ReferenceLine
                key={fc.cardId}
                x={fc.month}
                stroke='#22c55e'
                strokeDasharray='4 3'
                strokeWidth={1.5}
                strokeOpacity={0.55}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>

        {/* Freed-card legend: name + month of liberation, colored by card */}
        <div className='mt-3 flex flex-wrap gap-1.5'>
          {simulation.freedCards.map((fc) => {
            const entry = cardEntries.find((c) => c.id === fc.cardId)
            const color = entry?.color ?? '#94a3b8'
            const label =
              fc.cardName.length > 16
                ? `${fc.cardName.substring(0, 14)}…`
                : fc.cardName
            return (
              <span
                key={fc.cardId}
                className='flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs'
                style={{ borderColor: color, color }}
              >
                <span
                  className='size-1.5 shrink-0 rounded-full'
                  style={{ backgroundColor: color }}
                />
                {label} M{fc.month}
              </span>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
