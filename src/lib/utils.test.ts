import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('merges class names correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes', () => {
    expect(cn('text-red-500', false, 'font-bold')).toBe(
      'text-red-500 font-bold'
    )
  })
})
