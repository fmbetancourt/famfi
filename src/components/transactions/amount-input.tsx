'use client'

import { useCallback, useState } from 'react'

interface AmountInputProps {
  value: number
  onChange: (value: number) => void
  error?: string
}

function formatDisplay(pesos: number): string {
  if (pesos === 0) return ''
  return pesos.toLocaleString('de-DE')
}

/**
 * Large numeric input for CLP amounts.
 * Shows formatted value with thousands separator, stores raw integer.
 * Uses inputMode="numeric" for mobile numeric keyboard.
 */
export function AmountInput({
  value,
  onChange,
  error,
}: Readonly<AmountInputProps>) {
  const [display, setDisplay] = useState(formatDisplay(value))

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strip everything except digits
      const raw = e.target.value.replaceAll(/\D/g, '')
      if (raw === '') {
        setDisplay('')
        onChange(0)
        return
      }
      const num = Number.parseInt(raw, 10)
      setDisplay(num.toLocaleString('de-DE'))
      onChange(num)
    },
    [onChange]
  )

  return (
    <div>
      <div className='relative'>
        <span className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-muted-foreground'>
          $
        </span>
        <input
          type='text'
          inputMode='numeric'
          placeholder='0'
          value={display}
          onChange={handleChange}
          className={`w-full rounded-xl border-2 bg-background py-5 pl-12 pr-4 text-3xl font-bold tabular-nums outline-none transition-colors ${
            error
              ? 'border-destructive focus:border-destructive'
              : 'border-input focus:border-primary'
          }`}
          autoFocus
        />
      </div>
      {error && <p className='mt-1 text-sm text-destructive'>{error}</p>}
    </div>
  )
}
