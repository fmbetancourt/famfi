import { describe, expect, it } from 'vitest'
import {
  type CardRate,
  CardRotationDetector,
  type TransactionInput,
} from './CardRotationDetector'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Card rates from docs/financial-context.md (Feb 2026).
 * Santander cards: 3.35% / Scotiabank cards: 2.40%
 */
const CARD_RATES: CardRate[] = [
  { cardId: 'santander-wl', monthlyRate: 3.35 },
  { cardId: 'santander-plat', monthlyRate: 3.35 },
  { cardId: 'scotiabank-sig', monthlyRate: 2.4 },
  { cardId: 'scotiabank-inf', monthlyRate: 2.4 },
]

/** Builds a minimal TransactionInput. */
function mkTx(
  overrides: Partial<TransactionInput> & { id: string }
): TransactionInput {
  return {
    type: 'EXPENSE',
    isInterCard: false,
    amount: 1_000_000,
    sourceCardId: null,
    date: new Date('2026-02-15'),
    description: 'Test transaction',
    ...overrides,
  }
}

/**
 * Real-world carousel: Santander WL pays Scotiabank Signature and vice-versa.
 * Volume confirmed in Feb 2026 statements (~$29M rotated).
 */
const REAL_CAROUSEL_TRANSACTIONS: TransactionInput[] = [
  mkTx({
    id: 'rot-1',
    type: 'INTER_CARD_TRANSFER',
    isInterCard: true,
    amount: 14_388_382, // Santander WL balance (pays Scotiabank)
    sourceCardId: 'santander-wl',
    description: 'SCOTIABANK PAGO CREDITOS S',
    date: new Date('2026-02-20'),
  }),
  mkTx({
    id: 'rot-2',
    type: 'INTER_CARD_TRANSFER',
    isInterCard: true,
    amount: 14_637_492, // Scotiabank Signature balance (pays Santander)
    sourceCardId: 'scotiabank-sig',
    description: 'SANTANDER PAGO CREDITOS S',
    date: new Date('2026-02-22'),
  }),
]

/** Regular expenses that must never be classified as rotations. */
const REGULAR_EXPENSES: TransactionInput[] = [
  mkTx({
    id: 'exp-1',
    type: 'EXPENSE',
    amount: 600_000,
    description: 'Supermercado',
  }),
  mkTx({
    id: 'exp-2',
    type: 'INCOME',
    amount: 6_200_000,
    description: 'Salario',
  }),
  mkTx({
    id: 'exp-3',
    type: 'CARD_PAYMENT',
    amount: 1_500_000,
    description: 'Pago tarjeta',
  }),
  mkTx({
    id: 'exp-4',
    type: 'INTEREST_CHARGE',
    amount: 482_011,
    description: 'Interés Santander',
  }),
  mkTx({
    id: 'exp-5',
    type: 'FEE',
    amount: 9_266,
    description: 'Comisión Scotiabank',
  }),
]

// ─── Detection correctness ────────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — detection', () => {
  it('detects INTER_CARD_TRANSFER type as a rotation', () => {
    const txs = [
      mkTx({ id: 'r1', type: 'INTER_CARD_TRANSFER', isInterCard: false }),
    ]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.rotationCount).toBe(1)
  })

  it('detects isInterCard=true as a rotation regardless of type', () => {
    // Covers the case where email tracker classifies it as CARD_PAYMENT
    // but also marks isInterCard = true
    const txs = [mkTx({ id: 'r1', type: 'CARD_PAYMENT', isInterCard: true })]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.rotationCount).toBe(1)
  })

  it('ignores regular EXPENSE, INCOME, CARD_PAYMENT, INTEREST_CHARGE, FEE transactions', () => {
    const result = CardRotationDetector.detectRotations(REGULAR_EXPENSES)
    expect(result.rotationCount).toBe(0)
  })

  it('correctly identifies rotations mixed in with regular transactions', () => {
    const mixed = [...REGULAR_EXPENSES, ...REAL_CAROUSEL_TRANSACTIONS]
    const result = CardRotationDetector.detectRotations(mixed, CARD_RATES)
    expect(result.rotationCount).toBe(2)
    expect(result.rotations.map((r) => r.transactionId)).toEqual(
      expect.arrayContaining(['rot-1', 'rot-2'])
    )
  })

  it('returns empty analysis when given an empty transaction list', () => {
    const result = CardRotationDetector.detectRotations([])
    expect(result.rotationCount).toBe(0)
    expect(result.totalVolumeRotated.value).toBe(0)
    expect(result.estimatedMonthlyCost.value).toBe(0)
    expect(result.isCarouselDetected).toBe(false)
    expect(result.rotations).toHaveLength(0)
  })

  it('preserves transaction metadata on each detected rotation', () => {
    const result = CardRotationDetector.detectRotations(
      REAL_CAROUSEL_TRANSACTIONS,
      CARD_RATES
    )
    const rot1 = result.rotations.find((r) => r.transactionId === 'rot-1')!
    expect(rot1.transactionId).toBe('rot-1')
    expect(rot1.sourceCardId).toBe('santander-wl')
    expect(rot1.description).toBe('SCOTIABANK PAGO CREDITOS S')
    expect(rot1.amount).toBe(14_388_382)
  })
})

// ─── Carousel detection ───────────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — carousel detection', () => {
  it('isCarouselDetected is false for a single rotation', () => {
    const txs = [mkTx({ id: 'r1', type: 'INTER_CARD_TRANSFER' })]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.isCarouselDetected).toBe(false)
  })

  it('isCarouselDetected is true for two or more rotations', () => {
    const result = CardRotationDetector.detectRotations(
      REAL_CAROUSEL_TRANSACTIONS
    )
    expect(result.isCarouselDetected).toBe(true)
  })

  it('isCarouselDetected is false when no rotations are present', () => {
    const result = CardRotationDetector.detectRotations(REGULAR_EXPENSES)
    expect(result.isCarouselDetected).toBe(false)
  })
})

// ─── Volume calculation ───────────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — volume', () => {
  it('totalVolumeRotated sums all rotation amounts', () => {
    // 14,388,382 + 14,637,492 = 29,025,874
    const result = CardRotationDetector.detectRotations(
      REAL_CAROUSEL_TRANSACTIONS
    )
    expect(result.totalVolumeRotated.value).toBe(14_388_382 + 14_637_492)
  })

  it('totalVolumeRotated is zero when no rotations are detected', () => {
    const result = CardRotationDetector.detectRotations(REGULAR_EXPENSES)
    expect(result.totalVolumeRotated.isZero()).toBe(true)
  })

  it('correctly sums three rotations', () => {
    const txs = [
      mkTx({ id: 'r1', type: 'INTER_CARD_TRANSFER', amount: 5_000_000 }),
      mkTx({ id: 'r2', type: 'INTER_CARD_TRANSFER', amount: 3_000_000 }),
      mkTx({ id: 'r3', type: 'INTER_CARD_TRANSFER', amount: 2_000_000 }),
    ]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.totalVolumeRotated.value).toBe(10_000_000)
  })
})

// ─── Cost calculation ─────────────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — cost calculation', () => {
  it('uses provided card rate for interest estimation', () => {
    // $10,000,000 at 3.35% = $335,000/month
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 10_000_000,
        sourceCardId: 'santander-wl',
      }),
    ]
    const result = CardRotationDetector.detectRotations(txs, CARD_RATES)
    expect(result.rotations[0].estimatedMonthlyInterest).toBe(335_000)
    expect(result.estimatedMonthlyInterest.value).toBe(335_000)
  })

  it('uses DEFAULT_MONTHLY_RATE (3.35%) when source card has no rate entry', () => {
    // $10,000,000 at 3.35% = $335,000/month
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 10_000_000,
        sourceCardId: 'unknown-card-id',
      }),
    ]
    const result = CardRotationDetector.detectRotations(txs, CARD_RATES)
    expect(result.rotations[0].estimatedMonthlyInterest).toBe(335_000)
  })

  it('uses DEFAULT_MONTHLY_RATE when sourceCardId is null', () => {
    // $5,000,000 at 3.35% = $167,500/month
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 5_000_000,
        sourceCardId: null,
      }),
    ]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.rotations[0].estimatedMonthlyInterest).toBe(167_500)
  })

  it('uses DEFAULT_MONTHLY_RATE when cardRates is not provided', () => {
    // Without cardRates, every rotation uses 3.35%
    // $14,637,492 at 3.35% = $490,356 (rounded)
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 14_637_492,
        sourceCardId: 'scotiabank-sig',
      }),
    ]
    // Expected: 14,637,492 × 3.35 / 100 = 490,355.982 → rounds to 490,356
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.rotations[0].estimatedMonthlyInterest).toBe(490_356)
  })

  it('fees are zero in Phase 1', () => {
    const result = CardRotationDetector.detectRotations(
      REAL_CAROUSEL_TRANSACTIONS,
      CARD_RATES
    )
    expect(result.estimatedFees.isZero()).toBe(true)
    for (const rot of result.rotations) {
      expect(rot.estimatedFees).toBe(0)
    }
  })

  it('estimatedMonthlyCost equals estimatedMonthlyInterest when fees are zero', () => {
    const result = CardRotationDetector.detectRotations(
      REAL_CAROUSEL_TRANSACTIONS,
      CARD_RATES
    )
    expect(result.estimatedMonthlyCost.value).toBe(
      result.estimatedMonthlyInterest.value
    )
  })

  it('rounds fractional peso results to nearest integer', () => {
    // $100,001 at 3.35% = 3,350.0335 → rounds to 3,350
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 100_001,
        sourceCardId: 'santander-wl',
      }),
    ]
    const result = CardRotationDetector.detectRotations(txs, CARD_RATES)
    expect(result.rotations[0].estimatedMonthlyInterest).toBe(3_350)
  })
})

// ─── Real-world scenario ──────────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — real-world carousel (Feb 2026)', () => {
  const result = CardRotationDetector.detectRotations(
    REAL_CAROUSEL_TRANSACTIONS,
    CARD_RATES
  )

  it('detects exactly 2 rotations', () => {
    expect(result.rotationCount).toBe(2)
  })

  it('flags as carousel', () => {
    expect(result.isCarouselDetected).toBe(true)
  })

  it("total volume is ~$29M (Freddy's confirmed carousel amount)", () => {
    // 14,388,382 + 14,637,492 = 29,025,874
    expect(result.totalVolumeRotated.value).toBe(29_025_874)
  })

  it('Santander WL rotation costs $482,011/month (3.35% × $14.4M)', () => {
    // 14,388,382 × 3.35 / 100 = 482,010.797 → 482,011
    const wlRotation = result.rotations.find(
      (r) => r.sourceCardId === 'santander-wl'
    )!
    expect(wlRotation.estimatedMonthlyInterest).toBe(482_011)
  })

  it('Scotiabank Signature rotation costs $351,300/month (2.40% × $14.6M)', () => {
    // 14,637,492 × 2.40 / 100 = 351,299.808 → 351,300
    const sigRotation = result.rotations.find(
      (r) => r.sourceCardId === 'scotiabank-sig'
    )!
    expect(sigRotation.estimatedMonthlyInterest).toBe(351_300)
  })

  it('total estimated monthly cost is ~$833K', () => {
    // 482,011 + 351,300 = 833,311
    expect(result.estimatedMonthlyCost.value).toBe(833_311)
  })

  it('costRatePct is approximately 2.87% of rotated volume', () => {
    // 833,311 / 29,025,874 × 100 = 2.869...% → rounded to 2.87
    expect(result.costRatePct).toBe(2.87)
  })
})

// ─── costRatePct edge cases ───────────────────────────────────────────────────

describe('CardRotationDetector.detectRotations — costRatePct', () => {
  it('returns 0 when there are no rotations', () => {
    const result = CardRotationDetector.detectRotations([])
    expect(result.costRatePct).toBe(0)
  })

  it('returns 0 when totalVolumeRotated is zero (should not divide by zero)', () => {
    // Edge case: rotation with amount 0 (unusual but safe)
    const txs = [mkTx({ id: 'r1', type: 'INTER_CARD_TRANSFER', amount: 0 })]
    const result = CardRotationDetector.detectRotations(txs)
    expect(result.costRatePct).toBe(0)
  })

  it('equals the card rate when a single rotation uses a known card', () => {
    // $X at 3.35% → cost = 0.0335 × X → costRatePct = 3.35%
    const txs = [
      mkTx({
        id: 'r1',
        type: 'INTER_CARD_TRANSFER',
        amount: 10_000_000,
        sourceCardId: 'santander-wl',
      }),
    ]
    const result = CardRotationDetector.detectRotations(txs, CARD_RATES)
    expect(result.costRatePct).toBe(3.35)
  })
})
