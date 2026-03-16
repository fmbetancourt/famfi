import { router } from '../trpc'
import { dashboardRouter } from './dashboard'
import { cardRouter } from './card'
import { transactionRouter } from './transaction'
import { budgetRouter } from './budget'

export const appRouter = router({
  dashboard: dashboardRouter,
  card: cardRouter,
  transaction: transactionRouter,
  budget: budgetRouter,
})

export type AppRouter = typeof appRouter
