import {
  Car,
  Gift,
  GraduationCap,
  Heart,
  Home,
  type LucideIcon,
  Shirt,
  ShoppingCart,
  Truck,
  UtensilsCrossed,
  Wifi,
  Zap,
} from 'lucide-react'

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

export function CategoryIcon({
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
