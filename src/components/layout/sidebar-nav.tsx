'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { navItems } from './nav-items'

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className='hidden md:flex md:w-60 md:flex-col md:border-r md:bg-muted/30'>
      <div className='flex h-14 items-center border-b px-4'>
        <Link href='/' className='text-lg font-bold'>
          FamFi
        </Link>
      </div>
      <nav className='flex flex-1 flex-col gap-1 p-3'>
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className='size-4' />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
