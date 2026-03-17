'use client'

import { useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { trpc } from '@/infrastructure/trpc/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryIcon } from '@/components/transactions/category-icon'
import { BudgetDonutChart } from './budget-donut-chart'

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
  return '$' + amount.toLocaleString('de-DE')
}

type ItemStatus = 'ok' | 'warning' | 'exceeded'

function statusBarColor(status: ItemStatus): string {
  if (status === 'exceeded') return 'bg-red-500'
  if (status === 'warning') return 'bg-yellow-500'
  return 'bg-green-500'
}

function statusTextColor(status: ItemStatus): string {
  if (status === 'exceeded') return 'text-red-600 dark:text-red-400'
  if (status === 'warning') return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function progressBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

function progressTextColor(pct: number): string {
  if (pct > 100) return 'text-red-600'
  if (pct >= 80) return 'text-yellow-600'
  return 'text-green-600'
}

function prevMonth(
  month: number,
  year: number
): { month: number; year: number } {
  if (month === 1) return { month: 12, year: year - 1 }
  return { month: month - 1, year }
}

function nextMonth(
  month: number,
  year: number
): { month: number; year: number } {
  if (month === 12) return { month: 1, year: year + 1 }
  return { month: month + 1, year }
}

// ─── Local types (mirror tRPC output shape) ───────────────────────────────────

interface BudgetItemDetail {
  id: string
  categoryId: string
  category: {
    id: string
    name: string
    icon: string | null
    color: string | null
    isFixed: boolean
  }
  planned: number
  actual: number
  progress: number
  status: ItemStatus
}

interface BudgetDetail {
  id: string
  month: number
  year: number
  totalIncome: number
  totalPlanned: number
  totalActual: number
  remainingIncome: number
  items: BudgetItemDetail[]
}

type CategoryMeta = {
  id: string
  name: string
  icon: string | null
  color: string | null
  isFixed: boolean
  sortOrder: number
}

// ─── LoadingSkeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className='flex flex-col gap-3'>
      <div className='h-36 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
      <div className='h-16 animate-pulse rounded-xl bg-muted' />
    </div>
  )
}

// ─── BudgetSummaryCard ────────────────────────────────────────────────────────

function BudgetSummaryCard({ budget }: Readonly<{ budget: BudgetDetail }>) {
  const spentPct =
    budget.totalPlanned > 0
      ? Math.round((budget.totalActual / budget.totalPlanned) * 100)
      : 0

  const barColor = progressBarColor(spentPct)
  const pctColor = progressTextColor(spentPct)

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>Resumen del Mes</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {/* Spent vs planned progress bar */}
        <div>
          <div className='flex justify-between text-sm'>
            <span className='text-muted-foreground'>
              Gastado vs Planificado
            </span>
            <span className={pctColor}>{spentPct}%</span>
          </div>
          <div className='mt-2 h-2.5 rounded-full bg-muted'>
            <div
              className={`h-2.5 rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(spentPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className='grid grid-cols-2 gap-2 text-sm'>
          <div className='rounded-lg bg-muted/50 px-3 py-2'>
            <p className='text-xs text-muted-foreground'>Ingreso</p>
            <p className='font-semibold'>{formatCLP(budget.totalIncome)}</p>
          </div>
          <div className='rounded-lg bg-muted/50 px-3 py-2'>
            <p className='text-xs text-muted-foreground'>Planificado</p>
            <p className='font-semibold'>{formatCLP(budget.totalPlanned)}</p>
          </div>
          <div className='rounded-lg bg-muted/50 px-3 py-2'>
            <p className='text-xs text-muted-foreground'>Gastado</p>
            <p className='font-semibold'>{formatCLP(budget.totalActual)}</p>
          </div>
          <div className='rounded-lg bg-muted/50 px-3 py-2'>
            <p className='text-xs text-muted-foreground'>Disponible</p>
            <p
              className={`font-semibold ${budget.remainingIncome < 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {formatCLP(budget.remainingIncome)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────

function CategoryRow({
  item,
  isEditing,
  editingValue,
  isSaving,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
}: Readonly<{
  item: BudgetItemDetail
  isEditing: boolean
  editingValue: string
  isSaving: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onEditValueChange: (v: string) => void
}>) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='p-3'>
        <div className='flex items-start gap-3'>
          {/* Category icon badge */}
          <div
            className='flex size-9 shrink-0 items-center justify-center rounded-lg'
            style={{
              backgroundColor: item.category.color
                ? `${item.category.color}25`
                : '#94a3b825',
            }}
          >
            <CategoryIcon
              iconName={item.category.icon}
              color={item.category.color}
              className='size-4'
            />
          </div>

          {/* Main content */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center justify-between gap-2'>
              <span className='truncate text-sm font-medium'>
                {item.category.name}
              </span>

              {/* Edit / save / cancel controls */}
              {isEditing ? (
                <div className='flex shrink-0 items-center gap-0.5'>
                  <button
                    onClick={onCancel}
                    className='rounded p-1 text-muted-foreground hover:bg-muted'
                    aria-label='Cancelar edición'
                  >
                    <X className='size-4' />
                  </button>
                  <button
                    onClick={onSave}
                    disabled={isSaving}
                    className='rounded p-1 text-green-600 hover:bg-muted disabled:opacity-50'
                    aria-label='Guardar monto'
                  >
                    {isSaving ? (
                      <Loader2 className='size-4 animate-spin' />
                    ) : (
                      <Check className='size-4' />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={onEdit}
                  className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted'
                  aria-label='Editar monto planificado'
                >
                  <Pencil className='size-4' />
                </button>
              )}
            </div>

            {/* Inline number input when editing */}
            {isEditing ? (
              <div className='mt-1.5'>
                <input
                  type='number'
                  value={editingValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSave()
                    if (e.key === 'Escape') onCancel()
                  }}
                  className='h-8 w-full rounded-md border bg-background px-2 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                  autoFocus
                  placeholder='Monto planificado'
                  min={1}
                />
              </div>
            ) : (
              <>
                {/* Amounts */}
                <div className='mt-1 flex items-baseline justify-between text-xs'>
                  <span className='text-muted-foreground'>
                    <span className={statusTextColor(item.status)}>
                      {formatCLP(item.actual)}
                    </span>
                    {' / '}
                    <span>{formatCLP(item.planned)}</span>
                  </span>
                  <span className={statusTextColor(item.status)}>
                    {item.progress}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className='mt-1.5 h-1.5 rounded-full bg-muted'>
                  <div
                    className={`h-1.5 rounded-full transition-all ${statusBarColor(item.status)}`}
                    style={{ width: `${Math.min(item.progress, 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  monthName,
  year,
  prevMonthName,
  prevYear,
  isDuplicating,
  duplicateError,
  onCreateManual,
  onDuplicate,
  onSuggestion,
}: Readonly<{
  monthName: string
  year: number
  prevMonthName: string
  prevYear: number
  isDuplicating: boolean
  duplicateError: string | null
  onCreateManual: () => void
  onDuplicate: () => void
  onSuggestion: () => void
}>) {
  return (
    <div className='flex flex-col items-center gap-5 py-8 text-center'>
      <div className='rounded-full bg-muted p-5'>
        <Plus className='size-8 text-muted-foreground' />
      </div>

      <div>
        <p className='font-semibold'>
          Sin presupuesto para {monthName} {year}
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Elige cómo quieres empezar
        </p>
      </div>

      {duplicateError && (
        <p className='rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive'>
          {duplicateError}
        </p>
      )}

      <div className='flex w-full max-w-sm flex-col gap-2'>
        <button
          onClick={onCreateManual}
          className='flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground'
        >
          <Plus className='size-4' />
          Crear Presupuesto
        </button>

        <button
          onClick={onDuplicate}
          disabled={isDuplicating}
          className='flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-medium disabled:opacity-50'
        >
          {isDuplicating ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <Copy className='size-4' />
          )}
          Copiar de {prevMonthName} {prevYear}
        </button>

        <button
          onClick={onSuggestion}
          className='flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-medium'
        >
          <Sparkles className='size-4' />
          Usar sugerencia automática
        </button>
      </div>
    </div>
  )
}

// ─── CategoryAmountRow (used inside create form) ──────────────────────────────

function CategoryAmountRow({
  category,
  amount,
  onChange,
}: Readonly<{
  category: CategoryMeta
  amount: number
  onChange: (v: number) => void
}>) {
  return (
    <div className='flex items-center gap-3 rounded-xl border bg-card p-3'>
      <div
        className='flex size-9 shrink-0 items-center justify-center rounded-lg'
        style={{
          backgroundColor: category.color ? `${category.color}25` : '#94a3b825',
        }}
      >
        <CategoryIcon
          iconName={category.icon}
          color={category.color}
          className='size-4'
        />
      </div>

      <span className='flex-1 truncate text-sm font-medium'>
        {category.name}
      </span>

      <input
        type='number'
        value={amount === 0 ? '' : amount}
        onChange={(e) => {
          const v = Number.parseInt(e.target.value, 10)
          onChange(Number.isNaN(v) || v < 0 ? 0 : v)
        }}
        placeholder='0'
        min={0}
        className='h-9 w-28 rounded-md border bg-background px-2 text-right text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
      />
    </div>
  )
}

// ─── CreateForm ───────────────────────────────────────────────────────────────

function CreateForm({
  mode,
  categories,
  isLoadingCategories,
  baseAmounts,
  pendingAmounts,
  isCreating,
  createError,
  onAmountChange,
  onCancel,
  onSubmit,
}: Readonly<{
  mode: 'manual' | 'suggestion'
  categories: { fixed: CategoryMeta[]; variable: CategoryMeta[] } | undefined
  isLoadingCategories: boolean
  /** Suggestion amounts used as defaults; pendingAmounts contains explicit overrides. */
  baseAmounts: Record<string, number>
  pendingAmounts: Record<string, number>
  isCreating: boolean
  createError: string | null
  onAmountChange: (catId: string, amount: number) => void
  onCancel: () => void
  onSubmit: () => void
}>) {
  const allCats = [
    ...(categories?.fixed ?? []),
    ...(categories?.variable ?? []),
  ]
  const totalPlanned = allCats.reduce(
    (sum, cat) => sum + (pendingAmounts[cat.id] ?? baseAmounts[cat.id] ?? 0),
    0
  )

  if (isLoadingCategories) {
    return (
      <div className='flex flex-col items-center gap-3 py-12'>
        <Loader2 className='size-8 animate-spin text-muted-foreground' />
        <p className='text-sm text-muted-foreground'>
          {mode === 'suggestion'
            ? 'Calculando sugerencias...'
            : 'Cargando categorías...'}
        </p>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      {/* Form header */}
      <div className='flex items-center justify-between'>
        <h2 className='font-semibold'>
          {mode === 'suggestion' ? 'Presupuesto Sugerido' : 'Nuevo Presupuesto'}
        </h2>
        <button
          onClick={onCancel}
          className='text-sm text-muted-foreground hover:text-foreground'
        >
          Cancelar
        </button>
      </div>

      {mode === 'suggestion' &&
        !categories?.fixed.length &&
        !categories?.variable.length && (
          <p className='rounded-lg border border-dashed px-4 py-3 text-center text-sm text-muted-foreground'>
            Sin historial suficiente. Ingresa los montos manualmente.
          </p>
        )}

      {/* Fixed categories */}
      {(categories?.fixed.length ?? 0) > 0 && (
        <section>
          <p className='mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            Gastos Fijos
          </p>
          <div className='flex flex-col gap-2'>
            {categories?.fixed.map((cat) => (
              <CategoryAmountRow
                key={cat.id}
                category={cat}
                amount={pendingAmounts[cat.id] ?? baseAmounts[cat.id] ?? 0}
                onChange={(v) => onAmountChange(cat.id, v)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Variable categories */}
      {(categories?.variable.length ?? 0) > 0 && (
        <section>
          <p className='mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            Gastos Variables
          </p>
          <div className='flex flex-col gap-2'>
            {categories?.variable.map((cat) => (
              <CategoryAmountRow
                key={cat.id}
                category={cat}
                amount={pendingAmounts[cat.id] ?? baseAmounts[cat.id] ?? 0}
                onChange={(v) => onAmountChange(cat.id, v)}
              />
            ))}
          </div>
        </section>
      )}

      {createError && (
        <p className='rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive'>
          {createError}
        </p>
      )}

      {/* Sticky submit footer */}
      <div className='sticky bottom-20 rounded-xl border bg-card p-4 shadow-lg'>
        <div className='mb-3 flex justify-between text-sm'>
          <span className='text-muted-foreground'>Total planificado</span>
          <span className='font-semibold'>{formatCLP(totalPlanned)}</span>
        </div>
        <button
          onClick={onSubmit}
          disabled={totalPlanned === 0 || isCreating}
          className='flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50'
        >
          {isCreating ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <Check className='size-4' />
          )}
          Crear Presupuesto
        </button>
      </div>
    </div>
  )
}

// ─── BudgetPageView (main export) ─────────────────────────────────────────────

export function BudgetPageView({
  initialMonth,
  initialYear,
}: Readonly<{
  initialMonth: number
  initialYear: number
}>) {
  const [month, setMonth] = useState(initialMonth)
  const [year, setYear] = useState(initialYear)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [createMode, setCreateMode] = useState<'manual' | 'suggestion' | null>(
    null
  )
  const [pendingAmounts, setPendingAmounts] = useState<Record<string, number>>(
    {}
  )

  const utils = trpc.useUtils()

  const { data: budget, isLoading } = trpc.budget.getByMonth.useQuery({
    month,
    year,
  })

  const { data: categories, isLoading: loadingCategories } =
    trpc.transaction.getCategories.useQuery(undefined, {
      enabled: createMode !== null,
    })

  const { data: suggestions, isLoading: loadingSuggestions } =
    trpc.budget.getSuggestion.useQuery(
      { month, year },
      { enabled: createMode === 'suggestion' }
    )

  // Build a lookup of suggestion amounts; used as base values in the create form.
  // pendingAmounts holds user overrides on top of these base values.
  const suggestionsMap: Record<string, number> = {}
  if (suggestions) {
    for (const s of suggestions)
      suggestionsMap[s.categoryId] = s.suggestedAmount
  }

  const createMutation = trpc.budget.create.useMutation({
    onSuccess: () => {
      setCreateMode(null)
      setPendingAmounts({})
      utils.budget.getByMonth.invalidate({ month, year })
    },
  })

  const duplicateMutation = trpc.budget.duplicate.useMutation({
    onSuccess: () => utils.budget.getByMonth.invalidate({ month, year }),
  })

  const updateItemMutation = trpc.budget.updateItem.useMutation({
    onSuccess: () => {
      setEditingItemId(null)
      utils.budget.getByMonth.invalidate({ month, year })
    },
  })

  const prev = prevMonth(month, year)
  const next = nextMonth(month, year)

  function goToPrev() {
    setMonth(prev.month)
    setYear(prev.year)
    setCreateMode(null)
    setPendingAmounts({})
    setEditingItemId(null)
  }

  function goToNext() {
    setMonth(next.month)
    setYear(next.year)
    setCreateMode(null)
    setPendingAmounts({})
    setEditingItemId(null)
  }

  function handleDuplicate() {
    duplicateMutation.mutate({
      sourceMonth: prev.month,
      sourceYear: prev.year,
      targetMonth: month,
      targetYear: year,
    })
  }

  function startEdit(itemId: string, currentPlanned: number) {
    setEditingItemId(itemId)
    setEditingValue(String(currentPlanned))
  }

  function saveEdit(itemId: string) {
    const amount = Number.parseInt(editingValue.replaceAll(/\D/g, ''), 10)
    if (!Number.isNaN(amount) && amount > 0) {
      updateItemMutation.mutate({ budgetItemId: itemId, planned: amount })
    } else {
      setEditingItemId(null)
    }
  }

  function handleCreate() {
    // Merge base suggestion amounts with explicit user overrides
    const effectiveAmounts = { ...suggestionsMap, ...pendingAmounts }
    const items = Object.entries(effectiveAmounts)
      .filter(([, v]) => v > 0)
      .map(([categoryId, planned]) => ({ categoryId, planned }))
    if (items.length === 0) return
    createMutation.mutate({ month, year, items })
  }

  const fixedItems = budget?.items.filter((i) => i.category.isFixed) ?? []
  const variableItems = budget?.items.filter((i) => !i.category.isFixed) ?? []
  const donutData = (budget?.items ?? [])
    .filter((i) => i.planned > 0)
    .map((i) => ({
      name: i.category.name,
      value: i.planned,
      color: i.category.color ?? '#94a3b8',
    }))

  const isCreateLoading =
    loadingCategories || (createMode === 'suggestion' && loadingSuggestions)

  return (
    <div className='flex flex-col gap-4 p-4 pb-28 md:p-6'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-bold'>Presupuesto</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Planificación mensual
        </p>
      </div>

      {/* Month navigator */}
      <div className='flex items-center justify-between rounded-xl border bg-card px-4 py-3'>
        <button
          onClick={goToPrev}
          className='rounded-lg p-1.5 hover:bg-muted active:bg-muted'
          aria-label='Mes anterior'
        >
          <ChevronLeft className='size-5' />
        </button>
        <span className='text-base font-semibold'>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={goToNext}
          className='rounded-lg p-1.5 hover:bg-muted active:bg-muted'
          aria-label='Mes siguiente'
        >
          <ChevronRight className='size-5' />
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && <LoadingSkeleton />}

      {/* Empty state — no budget, no create form open */}
      {!isLoading && !budget && createMode === null && (
        <EmptyState
          monthName={MONTH_NAMES[month - 1]}
          year={year}
          prevMonthName={MONTH_NAMES[prev.month - 1]}
          prevYear={prev.year}
          isDuplicating={duplicateMutation.isPending}
          duplicateError={duplicateMutation.error?.message ?? null}
          onCreateManual={() => {
            setCreateMode('manual')
            setPendingAmounts({})
          }}
          onDuplicate={handleDuplicate}
          onSuggestion={() => setCreateMode('suggestion')}
        />
      )}

      {/* Create form — manual or suggestion */}
      {!isLoading && !budget && createMode !== null && (
        <CreateForm
          mode={createMode}
          categories={categories}
          isLoadingCategories={isCreateLoading}
          baseAmounts={suggestionsMap}
          pendingAmounts={pendingAmounts}
          isCreating={createMutation.isPending}
          createError={createMutation.error?.message ?? null}
          onAmountChange={(catId, amount) =>
            setPendingAmounts((existing) => ({ ...existing, [catId]: amount }))
          }
          onCancel={() => {
            setCreateMode(null)
            setPendingAmounts({})
          }}
          onSubmit={handleCreate}
        />
      )}

      {/* Budget detail view */}
      {!isLoading && budget && createMode === null && (
        <>
          <BudgetSummaryCard budget={budget} />

          {fixedItems.length > 0 && (
            <section>
              <h2 className='mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Gastos Fijos
              </h2>
              <div className='flex flex-col gap-2'>
                {fixedItems.map((item) => (
                  <CategoryRow
                    key={item.id}
                    item={item}
                    isEditing={editingItemId === item.id}
                    editingValue={editingValue}
                    isSaving={
                      updateItemMutation.isPending && editingItemId === item.id
                    }
                    onEdit={() => startEdit(item.id, item.planned)}
                    onSave={() => saveEdit(item.id)}
                    onCancel={() => setEditingItemId(null)}
                    onEditValueChange={setEditingValue}
                  />
                ))}
              </div>
            </section>
          )}

          {variableItems.length > 0 && (
            <section>
              <h2 className='mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Gastos Variables
              </h2>
              <div className='flex flex-col gap-2'>
                {variableItems.map((item) => (
                  <CategoryRow
                    key={item.id}
                    item={item}
                    isEditing={editingItemId === item.id}
                    editingValue={editingValue}
                    isSaving={
                      updateItemMutation.isPending && editingItemId === item.id
                    }
                    onEdit={() => startEdit(item.id, item.planned)}
                    onSave={() => saveEdit(item.id)}
                    onCancel={() => setEditingItemId(null)}
                    onEditValueChange={setEditingValue}
                  />
                ))}
              </div>
            </section>
          )}

          {donutData.length > 0 && <BudgetDonutChart data={donutData} />}
        </>
      )}
    </div>
  )
}
