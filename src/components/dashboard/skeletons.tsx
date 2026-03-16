import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function DebtSummarySkeleton() {
  return (
    <div className='rounded-xl bg-gradient-to-br from-red-500/60 to-orange-500/60 p-5'>
      <div className='flex items-start justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-24 bg-white/20' />
          <Skeleton className='h-9 w-48 bg-white/20' />
          <Skeleton className='h-4 w-36 bg-white/20' />
        </div>
        <Skeleton className='size-10 rounded-lg bg-white/20' />
      </div>
      <div className='mt-4 space-y-1'>
        <div className='flex justify-between'>
          <Skeleton className='h-3 w-16 bg-white/20' />
          <Skeleton className='h-3 w-28 bg-white/20' />
        </div>
        <Skeleton className='h-2 w-full rounded-full bg-white/20' />
      </div>
    </div>
  )
}

export function PaymentsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className='h-5 w-44' />
      </CardHeader>
      <CardContent className='grid gap-3'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='flex items-center justify-between'>
            <div className='space-y-1'>
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-3 w-20' />
            </div>
            <Skeleton className='h-6 w-16 rounded-full' />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function BudgetSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className='h-5 w-32' />
      </CardHeader>
      <CardContent className='grid gap-4'>
        <div className='space-y-2'>
          <div className='flex justify-between'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-4 w-10' />
          </div>
          <Skeleton className='h-3 w-full rounded-full' />
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1'>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-6 w-28' />
          </div>
          <div className='space-y-1'>
            <Skeleton className='h-3 w-16' />
            <Skeleton className='h-6 w-20' />
          </div>
        </div>
        <Skeleton className='h-9 w-full rounded-lg' />
      </CardContent>
    </Card>
  )
}

export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className='h-5 w-44' />
      </CardHeader>
      <CardContent>
        <div className='flex flex-col items-center gap-4 sm:flex-row'>
          <Skeleton className='size-48 shrink-0 rounded-full' />
          <div className='grid w-full gap-2'>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className='flex items-center gap-2'>
                <Skeleton className='size-3 rounded-full' />
                <Skeleton className='h-4 flex-1' />
                <Skeleton className='h-4 w-10' />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
