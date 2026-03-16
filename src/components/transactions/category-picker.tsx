'use client'

import { useState } from 'react'
import {
  Car,
  Gift,
  GraduationCap,
  Heart,
  Home,
  type LucideIcon,
  MoreHorizontal,
  Shirt,
  ShoppingCart,
  Truck,
  UtensilsCrossed,
  Wifi,
  Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
}

interface CategoryPickerProps {
  categories: Category[]
  value: string | null
  onChange: (id: string) => void
  error?: string
}

const ICON_MAP: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  'utensils-crossed': UtensilsCrossed,
  truck: Truck,
  car: Car,
  heart: Heart,
  home: Home,
  zap: Zap,
  wifi: Wifi,
  'graduation-cap': GraduationCap,
  shirt: Shirt,
  gift: Gift,
}

const DEFAULT_ICON = ShoppingCart

function CategoryIcon({
  iconName,
  color,
  className,
}: Readonly<{
  iconName: string | null
  color: string | null
  className?: string
}>) {
  const Icon = (iconName && ICON_MAP[iconName]) || DEFAULT_ICON
  return <Icon className={className} style={color ? { color } : undefined} />
}

const QUICK_PICK_ICONS = new Set([
  'shopping-cart',
  'truck',
  'utensils-crossed',
  'car',
  'heart',
  'zap',
])

export function CategoryPicker({
  categories,
  value,
  onChange,
  error,
}: Readonly<CategoryPickerProps>) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const quickCategories = categories.filter(
    (c) => c.icon != null && QUICK_PICK_ICONS.has(c.icon)
  )
  const quickPicks =
    quickCategories.length >= 5
      ? quickCategories.slice(0, 5)
      : categories.slice(0, 5)

  const selected = categories.find((c) => c.id === value)
  const isSelectedInMore = value && !quickPicks.some((q) => q.id === value)

  return (
    <div>
      <span className='mb-2 block text-sm font-medium'>Categoría</span>
      <div className='grid grid-cols-3 gap-2'>
        {quickPicks.map((cat) => (
          <button
            key={cat.id}
            type='button'
            onClick={() => onChange(cat.id)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs transition-colors ${
              value === cat.id
                ? 'border-primary bg-primary/5'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            }`}
          >
            <CategoryIcon
              iconName={cat.icon}
              color={value === cat.id ? null : cat.color}
              className={`size-6 ${value === cat.id ? 'text-primary' : ''}`}
            />
            <span className='truncate'>{cat.name}</span>
          </button>
        ))}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs transition-colors ${
              isSelectedInMore
                ? 'border-primary bg-primary/5'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            }`}
          >
            <MoreHorizontal className='size-6 text-muted-foreground' />
            <span>{isSelectedInMore ? selected?.name : 'Más'}</span>
          </DialogTrigger>
          <DialogContent className='max-h-[80vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>Todas las categorías</DialogTitle>
            </DialogHeader>
            <div className='grid grid-cols-3 gap-2 pt-2'>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type='button'
                  onClick={() => {
                    onChange(cat.id)
                    setDialogOpen(false)
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs transition-colors ${
                    value === cat.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <CategoryIcon
                    iconName={cat.icon}
                    color={value === cat.id ? null : cat.color}
                    className={`size-5 ${value === cat.id ? 'text-primary' : ''}`}
                  />
                  <span className='truncate'>{cat.name}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p className='mt-1 text-sm text-destructive'>{error}</p>}
    </div>
  )
}
