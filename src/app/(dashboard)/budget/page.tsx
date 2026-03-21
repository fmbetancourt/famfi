import { BudgetPageView } from '@/components/budget/budget-page-view'

export default function BudgetPage() {
  const now = new Date()
  return (
    <BudgetPageView
      initialMonth={now.getMonth() + 1}
      initialYear={now.getFullYear()}
    />
  )
}
