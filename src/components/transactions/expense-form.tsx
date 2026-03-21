'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/infrastructure/trpc/client'
import { AmountInput } from './amount-input'
import { CategoryPicker } from './category-picker'

const formSchema = z.object({
  amount: z.number().int().positive('Ingresa un monto'),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  creditCardId: z.string().nullable(),
  memberId: z.string().min(1),
  // Keep in sync with the server-side createInput in transaction.ts
  description: z.string().min(1, 'Describe el gasto').max(200),
  date: z.string().min(1),
})

type FormValues = z.infer<typeof formSchema>

interface ExpenseFormProps {
  userId: string
  familyMembers: { id: string; name: string }[]
}

/** Simple segmented control as replacement for ToggleGroup. */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Readonly<{
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}>) {
  return (
    <div className='flex rounded-lg border bg-muted/30 p-0.5'>
      {options.map((opt) => (
        <button
          key={opt.value}
          type='button'
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function ExpenseForm({
  userId,
  familyMembers,
}: Readonly<ExpenseFormProps>) {
  const router = useRouter()
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card')

  const today = new Date().toISOString().split('T')[0]

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      categoryId: '',
      creditCardId: null,
      memberId: userId,
      description: '',
      date: today,
    },
  })

  const currentMemberId = watch('memberId')

  const { data: categoryData } = trpc.transaction.getCategories.useQuery()
  const { data: memberCards } = trpc.transaction.getMemberCards.useQuery(
    { memberId: currentMemberId },
    { enabled: !!currentMemberId }
  )

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: () => {
      toast.success('Gasto registrado')
      router.push('/transactions')
    },
    onError: (err) => {
      toast.error(err.message || 'Error al guardar')
    },
  })

  const onSubmit = useCallback(
    (values: FormValues) => {
      if (paymentMethod === 'card' && !values.creditCardId) {
        setError('creditCardId', { message: 'Selecciona una tarjeta' })
        return
      }
      createMutation.mutate({
        amount: values.amount,
        description: values.description,
        categoryId: values.categoryId,
        creditCardId: paymentMethod === 'card' ? values.creditCardId : null,
        memberId: values.memberId,
        date: new Date(values.date),
      })
    },
    [createMutation, paymentMethod, setError]
  )

  const handlePaymentMethodChange = useCallback(
    (val: 'cash' | 'card') => {
      setPaymentMethod(val)
      if (val === 'cash') {
        setValue('creditCardId', null)
      }
    },
    [setValue]
  )

  const handleMemberChange = useCallback(
    (val: string) => {
      setValue('memberId', val)
      setValue('creditCardId', null)
    },
    [setValue]
  )

  const allCategories = categoryData?.all ?? []

  const memberOptions = familyMembers.map((m) => ({
    value: m.id,
    label: m.id === userId ? 'Yo' : m.name.split(' ')[0],
  }))

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='grid gap-5 pb-24'>
      {/* 1. Amount */}
      <Controller
        name='amount'
        control={control}
        render={({ field }) => (
          <AmountInput
            value={field.value}
            onChange={field.onChange}
            error={errors.amount?.message}
          />
        )}
      />

      {/* 2. Category */}
      <Controller
        name='categoryId'
        control={control}
        render={({ field }) => (
          <CategoryPicker
            categories={allCategories}
            value={field.value || null}
            onChange={field.onChange}
            error={errors.categoryId?.message}
          />
        )}
      />

      {/* 3. Payment Method */}
      <div>
        <Label className='mb-2 block'>Medio de pago</Label>
        <SegmentedControl
          options={[
            { value: 'cash' as const, label: 'Efectivo / Débito' },
            { value: 'card' as const, label: 'Tarjeta de Crédito' },
          ]}
          value={paymentMethod}
          onChange={handlePaymentMethodChange}
        />

        {paymentMethod === 'card' && (
          <div className='mt-3'>
            <Controller
              name='creditCardId'
              control={control}
              render={({ field }) => (
                <select
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  className='h-9 w-full rounded-md border bg-background px-2 text-sm'
                >
                  <option value=''>Selecciona tarjeta</option>
                  {memberCards?.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.bank} ···{card.lastFourDigits}
                    </option>
                  ))}
                  {(!memberCards || memberCards.length === 0) && (
                    <option value='' disabled>
                      Sin tarjetas activas
                    </option>
                  )}
                </select>
              )}
            />
            {errors.creditCardId && (
              <p className='mt-1 text-xs text-destructive'>
                {errors.creditCardId.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 4. Who spent */}
      {familyMembers.length > 1 && (
        <div>
          <Label className='mb-2 block'>¿Quién gastó?</Label>
          <SegmentedControl
            options={memberOptions}
            value={currentMemberId}
            onChange={handleMemberChange}
          />
        </div>
      )}

      {/* 5. Description */}
      <div>
        <Label htmlFor='description' className='mb-2 block'>
          Descripción
        </Label>
        <Controller
          name='description'
          control={control}
          render={({ field }) => (
            <Input
              id='description'
              placeholder='¿En qué gastaste?'
              {...field}
            />
          )}
        />
        {errors.description && (
          <p className='mt-1 text-xs text-destructive'>
            {errors.description.message}
          </p>
        )}
      </div>

      {/* 6. Date */}
      <div>
        <Label htmlFor='date' className='mb-2 block'>
          Fecha
        </Label>
        <Controller
          name='date'
          control={control}
          render={({ field }) => (
            <Input id='date' type='date' max={today} {...field} />
          )}
        />
      </div>

      {/* 7. Submit — sticky at bottom */}
      <div className='fixed inset-x-0 bottom-0 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:static md:border-0 md:p-0'>
        <Button
          type='submit'
          size='lg'
          className='w-full text-base'
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className='mr-2 size-5 animate-spin' />
              Guardando...
            </>
          ) : (
            'Guardar Gasto'
          )}
        </Button>
      </div>
    </form>
  )
}
