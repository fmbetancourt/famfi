'use client'

import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BudgetSlice {
  name: string
  value: number
  color: string
}

function formatCLP(amount: number): string {
  return '$' + amount.toLocaleString('de-DE')
}

function CustomTooltip({
  active,
  payload,
}: Readonly<{
  active?: boolean
  payload?: { name: string; value: number }[]
}>) {
  if (!active || !payload?.[0]) return null
  const { name, value } = payload[0]
  return (
    <div className='rounded-lg border bg-background px-3 py-2 text-sm shadow-md'>
      <p className='font-medium'>{name}</p>
      <p className='text-muted-foreground'>{formatCLP(value)}</p>
    </div>
  )
}

export function BudgetDonutChart({ data }: Readonly<{ data: BudgetSlice[] }>) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  // Recharts reads `fill` from each data item to color individual sectors
  const chartData = data.map((d) => ({ ...d, fill: d.color }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>
          Distribución del Presupuesto
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col items-center gap-4 sm:flex-row'>
          <div className='h-48 w-48 shrink-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey='value'
                  nameKey='name'
                  cx='50%'
                  cy='50%'
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className='grid w-full gap-1.5'>
            {data.map((entry) => {
              const pct = Math.round((entry.value / total) * 100)
              return (
                <div
                  key={entry.name}
                  className='flex items-center gap-2 text-sm'
                >
                  <span
                    className='size-3 shrink-0 rounded-full'
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className='flex-1 truncate text-muted-foreground'>
                    {entry.name}
                  </span>
                  <span className='tabular-nums text-muted-foreground'>
                    {pct}%
                  </span>
                  <span className='font-medium tabular-nums'>
                    {formatCLP(entry.value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
