import { router } from '../trpc'
import { dashboardRouter } from './dashboard'
import { cardRouter } from './card'
import { transactionRouter } from './transaction'
import { budgetRouter } from './budget'
import { debtRouter } from './debt'

export const appRouter = router({
  dashboard: dashboardRouter,
  card: cardRouter,
  transaction: transactionRouter,
  budget: budgetRouter,
  debt: debtRouter,
})

export type AppRouter = typeof appRouter
