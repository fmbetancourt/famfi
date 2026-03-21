import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createCaller } from '@/infrastructure/trpc/server'
import { DebtSummaryCard } from '@/components/dashboard/debt-summary-card'
import { UpcomingPaymentsCard } from '@/components/dashboard/upcoming-payments-card'
import { DebtDistributionChart } from '@/components/dashboard/debt-distribution-chart'
import { MonthlyBudgetCard } from '@/components/dashboard/monthly-budget-card'
import { DebtPlanWidget } from '@/components/dashboard/debt-plan-widget'
import {
  BudgetSkeleton,
  ChartSkeleton,
  DebtPlanWidgetSkeleton,
  DebtSummarySkeleton,
  PaymentsSkeleton,
} from '@/components/dashboard/skeletons'

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

async function DashboardContent() {
  const [session, caller] = await Promise.all([
    getServerSession(authOptions),
    createCaller(),
  ])

  const firstName = session?.user?.name?.split(' ')[0] ?? ''
  const now = new Date()
  const currentMonth = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  const [summary, distribution, payments, spending, debtPlanWidget] =
    await Promise.all([
      caller.dashboard.getSummary(),
      caller.dashboard.getDebtDistribution(),
      caller.dashboard.getUpcomingPayments(),
      caller.dashboard.getMonthlySpending(),
      caller.dashboard.getDebtPlanWidget(),
    ])

  return (
    <div className='p-4 md:p-6'>
      <div className='mb-5'>
        <h1 className='text-2xl font-bold'>Hola, {firstName}</h1>
        <p className='text-sm text-muted-foreground'>
          Resumen financiero familiar
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <div className='md:col-span-2'>
          <DebtSummaryCard
            totalDebt={summary.totalDebt}
            cardCount={summary.cardsWithDebt}
            totalLimit={summary.totalLimit}
            monthlyInterest={summary.monthlyInterest}
          />
        </div>

        <div className='md:col-span-2'>
          <DebtPlanWidget {...debtPlanWidget} />
        </div>

        <UpcomingPaymentsCard payments={payments} />

        <MonthlyBudgetCard
          planned={spending.totalPlanned}
          spent={spending.totalSpent}
          month={currentMonth}
          hasBudget={spending.hasBudget}
          dayOfMonth={spending.dayOfMonth}
          daysInMonth={spending.daysInMonth}
          topDeviations={spending.topDeviations}
        />

        <div className='md:col-span-2'>
          <DebtDistributionChart data={distribution.slices} />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardSkeleton() {
  return (
    <div className='p-4 md:p-6'>
      <div className='mb-5'>
        <div className='h-8 w-40 animate-pulse rounded bg-muted' />
        <div className='mt-2 h-4 w-56 animate-pulse rounded bg-muted' />
      </div>
      <div className='grid gap-4 md:grid-cols-2'>
        <div className='md:col-span-2'>
          <DebtSummarySkeleton />
        </div>
        <div className='md:col-span-2'>
          <DebtPlanWidgetSkeleton />
        </div>
        <PaymentsSkeleton />
        <BudgetSkeleton />
        <div className='md:col-span-2'>
          <ChartSkeleton />
        </div>
      </div>
    </div>
  )
}
