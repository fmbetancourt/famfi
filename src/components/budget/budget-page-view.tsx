'use client'

import { useState } from 'react'
import {
  BookOpen,
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

// ─── Initial budget template (Moreno-Gutiérrez family, from financial-context.md) ─

/**
 * Pre-fills the create form with the family's known monthly expense structure.
 * Total ~$6,674,000 intentionally exceeds $6,200,000 income by $474,000 —
 * the user sees the over-budget alert and must trim the amounts to fit.
 * Keyed by category nameEn (stable across seeds).
 */
const INITIAL_TEMPLATE: Record<string, number> = {
  Mortgages: 2_000_000, // dividendos 3 propiedades
  Rent: 500_000, // arriendo vivienda propia
  'Common Expenses': 150_000, // gastos comunes
  Utilities: 200_000, // luz, agua, gas, internet
  'Car & Transport': 650_000, // combustible, TAG, mantención, seguros auto
  Insurance: 250_000, // seguros de vida y otros
  'Mom Allowance': 124_000, // mesadas mamá Freddy + mamá Rahydee
  Groceries: 600_000, // LiderBCI con descuento empleado
  'Dining & Delivery': 700_000, // delivery + restaurantes
  'Credit Card Payment': 1_500_000, // objetivo pago deuda TDC (avalanche)
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

/** The item being edited in the bottom sheet. */
interface BudgetEditTarget {
  id: string
  name: string
  icon: string | null
  color: string | null
  currentPlanned: number
}

type CategoryMeta = {
  id: string
  name: string
  nameEn: string | null
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

/** Tappable row — opens the EditItemSheet on click. No inline editing. */
function CategoryRow({
  item,
  onTap,
}: Readonly<{
  item: BudgetItemDetail
  onTap: () => void
}>) {
  return (
    <button
      onClick={onTap}
      className='w-full text-left active:opacity-80'
      aria-label={`Editar ${item.category.name}`}
    >
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
                <Pencil className='size-3.5 shrink-0 text-muted-foreground' />
              </div>

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
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

// ─── EditItemSheet ────────────────────────────────────────────────────────────

/**
 * Bottom sheet that appears when the user taps a CategoryRow.
 * Shows current planned amount, an input for the new amount, and a live
 * preview of how the change affects the overall budget vs income.
 */
function EditItemSheet({
  target,
  currentBudgetTotal,
  totalIncome,
  value,
  isSaving,
  saveError,
  onValueChange,
  onSave,
  onClose,
}: Readonly<{
  target: BudgetEditTarget
  currentBudgetTotal: number
  totalIncome: number
  value: string
  isSaving: boolean
  saveError: string | null
  onValueChange: (v: string) => void
  onSave: () => void
  onClose: () => void
}>) {
  const newAmount = Number.parseInt(value.replaceAll(/\D/g, ''), 10)
  const isValidAmount = !Number.isNaN(newAmount) && newAmount > 0
  const delta = isValidAmount ? newAmount - target.currentPlanned : 0
  const newTotal = currentBudgetTotal + delta
  const remainingAfter = totalIncome - newTotal

  return (
    <div className='fixed inset-0 z-50'>
      {/* Backdrop — native button enables keyboard dismiss */}
      <button
        type='button'
        className='absolute inset-0 cursor-default bg-black/40'
        onClick={onClose}
        aria-label='Cerrar'
        tabIndex={-1}
      />
      {/* Sheet panel — sibling of backdrop so clicks don't bubble to it */}
      <div className='absolute bottom-0 left-0 right-0 rounded-t-2xl bg-background p-6 pb-10 shadow-2xl'>
        {/* Drag handle */}
        <div className='mx-auto mb-5 h-1 w-10 rounded-full bg-muted' />

        {/* Category header */}
        <div className='mb-5 flex items-center gap-3'>
          <div
            className='flex size-10 shrink-0 items-center justify-center rounded-xl'
            style={{
              backgroundColor: target.color ? `${target.color}25` : '#94a3b825',
            }}
          >
            <CategoryIcon
              iconName={target.icon}
              color={target.color}
              className='size-5'
            />
          </div>
          <div>
            <p className='font-semibold'>{target.name}</p>
            <p className='text-sm text-muted-foreground'>
              Actual: {formatCLP(target.currentPlanned)}
            </p>
          </div>
          <button
            onClick={onClose}
            className='ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted'
            aria-label='Cerrar'
          >
            <X className='size-5' />
          </button>
        </div>

        {/* Amount input */}
        <div className='mb-4'>
          <p className='mb-1.5 text-sm font-medium'>Nuevo monto planificado</p>
          <input
            type='number'
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValidAmount) onSave()
              if (e.key === 'Escape') onClose()
            }}
            className='h-12 w-full rounded-xl border bg-background px-4 text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
            autoFocus
            placeholder='0'
            min={1}
          />
        </div>

        {/* Budget impact preview */}
        <div className='mb-4 rounded-xl bg-muted/50 p-3 text-sm'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>
              Nuevo total planificado
            </span>
            <span className='font-semibold'>
              {isValidAmount
                ? formatCLP(newTotal)
                : formatCLP(currentBudgetTotal)}
            </span>
          </div>
          {totalIncome > 0 && isValidAmount && (
            <div
              className={`mt-1 flex justify-between font-medium ${remainingAfter < 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              <span>
                {remainingAfter < 0 ? 'Excede ingreso en' : 'Disponible'}
              </span>
              <span>{formatCLP(Math.abs(remainingAfter))}</span>
            </div>
          )}
        </div>

        {saveError && (
          <p className='mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'>
            {saveError}
          </p>
        )}

        {/* Actions */}
        <button
          onClick={onSave}
          disabled={!isValidAmount || isSaving}
          className='flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50'
        >
          {isSaving ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <Check className='size-4' />
          )}
          Actualizar
        </button>
      </div>
    </div>
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
  onTemplate,
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
  onTemplate: () => void
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

        <button
          onClick={onTemplate}
          className='flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-medium'
        >
          <BookOpen className='size-4' />
          Plantilla familiar inicial
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

function createFormTitle(mode: 'manual' | 'suggestion' | 'template'): string {
  if (mode === 'suggestion') return 'Presupuesto Sugerido'
  if (mode === 'template') return 'Plantilla Familiar'
  return 'Nuevo Presupuesto'
}

function CreateForm({
  mode,
  categories,
  isLoadingCategories,
  baseAmounts,
  pendingAmounts,
  totalIncome,
  isCreating,
  createError,
  onAmountChange,
  onCancel,
  onSubmit,
}: Readonly<{
  mode: 'manual' | 'suggestion' | 'template'
  categories: { fixed: CategoryMeta[]; variable: CategoryMeta[] } | undefined
  isLoadingCategories: boolean
  /** Suggestion/template amounts used as defaults; pendingAmounts contains explicit overrides. */
  baseAmounts: Record<string, number>
  pendingAmounts: Record<string, number>
  /** Family's monthly recurring income — used for the over-budget alert. 0 while loading. */
  totalIncome: number
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
  const isOverBudget = totalIncome > 0 && totalPlanned > totalIncome
  const remaining = totalIncome - totalPlanned

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
        <h2 className='font-semibold'>{createFormTitle(mode)}</h2>
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
        <div className='mb-3 flex flex-col gap-1 text-sm'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>Total planificado</span>
            <span className='font-semibold'>{formatCLP(totalPlanned)}</span>
          </div>
          {totalIncome > 0 && (
            <>
              <div className='flex justify-between text-muted-foreground'>
                <span>Ingreso mensual</span>
                <span>{formatCLP(totalIncome)}</span>
              </div>
              <div
                className={`flex justify-between font-medium ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
              >
                <span>{isOverBudget ? 'Excede ingreso en' : 'Disponible'}</span>
                <span>{formatCLP(Math.abs(remaining))}</span>
              </div>
            </>
          )}
        </div>

        {isOverBudget && (
          <p className='mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/20 dark:text-red-400'>
            El presupuesto excede el ingreso. Ajusta los montos antes de
            guardar.
          </p>
        )}

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

// ─── BudgetPageView helpers ───────────────────────────────────────────────────

function resolveBaseAmounts(
  mode: 'manual' | 'suggestion' | 'template' | null,
  suggestionsMap: Record<string, number>,
  templateBaseAmounts: Record<string, number>
): Record<string, number> {
  if (mode === 'suggestion') return suggestionsMap
  if (mode === 'template') return templateBaseAmounts
  return {}
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
  const [editingItem, setEditingItem] = useState<BudgetEditTarget | null>(null)
  const [editSheetValue, setEditSheetValue] = useState('')
  const [createMode, setCreateMode] = useState<
    'manual' | 'suggestion' | 'template' | null
  >(null)
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

  // Build a lookup of suggestion amounts; used as base values in suggestion mode.
  const suggestionsMap: Record<string, number> = {}
  if (suggestions) {
    for (const s of suggestions)
      suggestionsMap[s.categoryId] = s.suggestedAmount
  }

  const { data: totalIncomeData } = trpc.budget.getTotalIncome.useQuery(
    undefined,
    { enabled: createMode !== null }
  )

  // Resolve INITIAL_TEMPLATE amounts to categoryIds using the nameEn stable key.
  const templateBaseAmounts: Record<string, number> = {}
  if (categories) {
    for (const cat of [
      ...(categories.fixed ?? []),
      ...(categories.variable ?? []),
    ]) {
      const amount = INITIAL_TEMPLATE[cat.nameEn ?? '']
      if (amount) templateBaseAmounts[cat.id] = amount
    }
  }

  // Base amounts differ by mode; pendingAmounts always wins on top.
  const baseAmounts = resolveBaseAmounts(
    createMode,
    suggestionsMap,
    templateBaseAmounts
  )

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
      setEditingItem(null)
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
    setEditingItem(null)
  }

  function goToNext() {
    setMonth(next.month)
    setYear(next.year)
    setCreateMode(null)
    setPendingAmounts({})
    setEditingItem(null)
  }

  function handleDuplicate() {
    duplicateMutation.mutate({
      sourceMonth: prev.month,
      sourceYear: prev.year,
      targetMonth: month,
      targetYear: year,
    })
  }

  function openEditSheet(item: BudgetItemDetail) {
    setEditingItem({
      id: item.id,
      name: item.category.name,
      icon: item.category.icon,
      color: item.category.color,
      currentPlanned: item.planned,
    })
    setEditSheetValue(String(item.planned))
  }

  function saveEditSheet() {
    if (!editingItem) return
    const amount = Number.parseInt(editSheetValue.replaceAll(/\D/g, ''), 10)
    if (!Number.isNaN(amount) && amount > 0) {
      updateItemMutation.mutate({
        budgetItemId: editingItem.id,
        planned: amount,
      })
    } else {
      setEditingItem(null)
    }
  }

  function handleCreate() {
    // Merge base amounts (suggestion/template) with explicit user overrides
    const effectiveAmounts = { ...baseAmounts, ...pendingAmounts }
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
          onTemplate={() => {
            setCreateMode('template')
            setPendingAmounts({})
          }}
        />
      )}

      {/* Create form — manual, suggestion, or template */}
      {!isLoading && !budget && createMode !== null && (
        <CreateForm
          mode={createMode}
          categories={categories}
          isLoadingCategories={isCreateLoading}
          baseAmounts={baseAmounts}
          pendingAmounts={pendingAmounts}
          totalIncome={totalIncomeData ?? 0}
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
                    onTap={() => openEditSheet(item)}
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
                    onTap={() => openEditSheet(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {donutData.length > 0 && <BudgetDonutChart data={donutData} />}
        </>
      )}

      {/* Bottom sheet for editing an existing budget item */}
      {editingItem && budget && (
        <EditItemSheet
          target={editingItem}
          currentBudgetTotal={budget.totalPlanned}
          totalIncome={budget.totalIncome}
          value={editSheetValue}
          isSaving={updateItemMutation.isPending}
          saveError={updateItemMutation.error?.message ?? null}
          onValueChange={setEditSheetValue}
          onSave={saveEditSheet}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
