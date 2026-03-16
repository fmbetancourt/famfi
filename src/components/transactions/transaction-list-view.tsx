'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Filter,
  Loader2,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/infrastructure/trpc/client'
import { CategoryIcon } from './category-icon'

// --- Types ---

interface FamilyMember {
  id: string
  name: string
}

interface TransactionListViewProps {
  userId: string
  familyMembers: FamilyMember[]
}

interface TransactionItem {
  id: string
  amount: number
  description: string
  date: string // ISO string (no superjson transformer)
  category: { name: string; icon: string | null; color: string | null }
  member: { name: string }
  creditCard: { name: string; bank: string } | null
}

interface CategoryTotal {
  name: string
  icon: string | null
  color: string | null
  total: number
}

// --- Helpers ---

function getMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthEnd(): string {
  const d = new Date()
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function formatCLP(amount: number): string {
  return amount.toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
  })
}

function toDateKey(isoDate: string): string {
  return isoDate.slice(0, 10)
}

function formatDayHeader(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function groupByDay(
  transactions: TransactionItem[]
): Map<string, TransactionItem[]> {
  const groups = new Map<string, TransactionItem[]>()
  for (const tx of transactions) {
    const key = toDateKey(tx.date)
    const group = groups.get(key)
    if (group) {
      group.push(tx)
    } else {
      groups.set(key, [tx])
    }
  }
  return groups
}

function aggregateByCategory(transactions: TransactionItem[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const tx of transactions) {
    const key = tx.category.name
    const existing = map.get(key)
    if (existing) {
      existing.total += tx.amount
    } else {
      map.set(key, {
        name: tx.category.name,
        icon: tx.category.icon,
        color: tx.category.color,
        total: tx.amount,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

// --- Sub-components ---

function PeriodSummary({
  total,
  breakdown,
}: Readonly<{ total: number; breakdown: CategoryTotal[] }>) {
  if (breakdown.length === 0) return null

  return (
    <div className='mt-4 rounded-lg border p-4'>
      <div className='flex items-baseline justify-between'>
        <span className='text-sm text-muted-foreground'>Total del periodo</span>
        <span className='text-xl font-bold'>{formatCLP(total)}</span>
      </div>
      <div className='mt-3 space-y-2'>
        {breakdown.slice(0, 5).map((cat) => {
          const pct = total > 0 ? (cat.total / total) * 100 : 0
          return (
            <div key={cat.name} className='flex items-center gap-2 text-sm'>
              <CategoryIcon
                iconName={cat.icon}
                color={cat.color}
                className='size-4 shrink-0'
              />
              <span className='w-20 truncate text-xs'>{cat.name}</span>
              <div className='flex-1'>
                <div className='h-2 overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full rounded-full transition-all'
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cat.color ?? 'hsl(var(--primary))',
                    }}
                  />
                </div>
              </div>
              <span className='w-20 text-right text-xs tabular-nums text-muted-foreground'>
                {formatCLP(cat.total)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TransactionRow({ tx }: Readonly<{ tx: TransactionItem }>) {
  return (
    <div className='flex items-center gap-3 px-3 py-3'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-full bg-muted'>
        <CategoryIcon
          iconName={tx.category.icon}
          color={tx.category.color}
          className='size-4'
        />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{tx.description}</p>
        <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <span>{tx.category.name}</span>
          {tx.creditCard && (
            <>
              <span aria-hidden='true'>&middot;</span>
              <span className='inline-flex items-center gap-0.5'>
                <CreditCard className='size-3' />
                {tx.creditCard.bank}
              </span>
            </>
          )}
        </div>
      </div>
      <span className='shrink-0 text-sm font-semibold tabular-nums text-destructive'>
        -{formatCLP(tx.amount)}
      </span>
    </div>
  )
}

function DayGroup({
  dateKey,
  transactions,
}: Readonly<{ dateKey: string; transactions: TransactionItem[] }>) {
  const dayTotal = transactions.reduce((sum, tx) => sum + tx.amount, 0)

  return (
    <div>
      <div className='mb-2 flex items-baseline justify-between'>
        <h3 className='text-xs font-medium capitalize text-muted-foreground'>
          {formatDayHeader(dateKey)}
        </h3>
        <span className='text-xs tabular-nums text-muted-foreground'>
          {formatCLP(dayTotal)}
        </span>
      </div>
      <div className='divide-y rounded-lg border'>
        {transactions.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ hasFilters }: Readonly<{ hasFilters: boolean }>) {
  return (
    <div className='mt-8 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground'>
      <p className='text-lg'>No hay transacciones</p>
      <p className='text-sm'>
        {hasFilters
          ? 'Intenta ajustando los filtros'
          : 'Registra tu primer gasto con el botón +'}
      </p>
    </div>
  )
}

// --- Main component ---

export function TransactionListView({
  userId,
  familyMembers,
}: Readonly<TransactionListViewProps>) {
  const [startDate, setStartDate] = useState(getMonthStart)
  const [endDate, setEndDate] = useState(getMonthEnd)
  const [memberId, setMemberId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: categoryData } = trpc.transaction.getCategories.useQuery()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.transaction.list.useInfiniteQuery(
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate + 'T23:59:59'),
        limit: 20,
        ...(memberId && { memberId }),
        ...(categoryId && { categoryId }),
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    )

  const allTransactions = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []) as TransactionItem[],
    [data?.pages]
  )

  const totalSpent = useMemo(
    () => allTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [allTransactions]
  )

  const categoryBreakdown = useMemo(
    () => aggregateByCategory(allTransactions),
    [allTransactions]
  )

  const dayGroups = useMemo(
    () => groupByDay(allTransactions),
    [allTransactions]
  )

  const hasActiveFilters = memberId !== '' || categoryId !== ''

  return (
    <div className='p-4 md:p-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Gastos</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Registro de transacciones
          </p>
        </div>
        <Link href='/transactions/new' className='hidden md:block'>
          <Button size='sm'>
            <Plus className='mr-1 size-4' />
            Nuevo
          </Button>
        </Link>
      </div>

      {/* Date range + filter toggle */}
      <div className='mt-4 flex flex-wrap items-end gap-2'>
        <div className='flex min-w-0 flex-1 gap-2'>
          <div className='min-w-0 flex-1'>
            <Label htmlFor='filter-start' className='mb-1 block text-xs'>
              Desde
            </Label>
            <Input
              id='filter-start'
              type='date'
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className='h-9 text-sm'
            />
          </div>
          <div className='min-w-0 flex-1'>
            <Label htmlFor='filter-end' className='mb-1 block text-xs'>
              Hasta
            </Label>
            <Input
              id='filter-end'
              type='date'
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className='h-9 text-sm'
            />
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          className='h-9 gap-1'
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className='size-4' />
          {hasActiveFilters && (
            <span className='size-2 rounded-full bg-primary' />
          )}
          {filtersOpen ? (
            <ChevronUp className='size-3' />
          ) : (
            <ChevronDown className='size-3' />
          )}
        </Button>
      </div>

      {/* Collapsible filters */}
      {filtersOpen && (
        <div className='mt-3 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2'>
          <div>
            <Label htmlFor='filter-member' className='mb-1 block text-xs'>
              Miembro
            </Label>
            <select
              id='filter-member'
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className='h-9 w-full rounded-md border bg-background px-2 text-sm'
            >
              <option value=''>Todos</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === userId ? 'Yo' : m.name.split(' ')[0]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor='filter-category' className='mb-1 block text-xs'>
              Categoría
            </Label>
            <select
              id='filter-category'
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className='h-9 w-full rounded-md border bg-background px-2 text-sm'
            >
              <option value=''>Todas</option>
              {categoryData?.all.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setMemberId('')
                setCategoryId('')
              }}
              className='text-xs sm:col-span-2'
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {/* Period Summary */}
      {!isLoading && allTransactions.length > 0 && (
        <PeriodSummary total={totalSpent} breakdown={categoryBreakdown} />
      )}

      {/* Transaction List */}
      {isLoading && (
        <div className='mt-12 flex justify-center'>
          <Loader2 className='size-8 animate-spin text-muted-foreground' />
        </div>
      )}

      {!isLoading && allTransactions.length === 0 && (
        <EmptyState hasFilters={hasActiveFilters} />
      )}

      {!isLoading && allTransactions.length > 0 && (
        <div className='mt-4 space-y-4'>
          {[...dayGroups.entries()].map(([dateKey, transactions]) => (
            <DayGroup
              key={dateKey}
              dateKey={dateKey}
              transactions={transactions}
            />
          ))}

          {hasNextPage && (
            <div className='flex justify-center pt-2 pb-4'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    Cargando...
                  </>
                ) : (
                  'Cargar más'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Mobile FAB — positioned above bottom nav (h-16 + safe area) */}
      <Link
        href='/transactions/new'
        className='fixed bottom-24 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden'
      >
        <Plus className='size-6' />
      </Link>
    </div>
  )
}
