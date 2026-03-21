'use client'

import { signOut, useSession } from 'next-auth/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function Header() {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const firstName = name.split(' ')[0] ?? ''

  return (
    <header className='flex h-14 items-center justify-between border-b bg-background px-4'>
      <span className='text-lg font-bold md:hidden'>FamFi</span>
      <div className='hidden md:block' />
      <div className='flex items-center gap-3'>
        <span className='text-sm text-muted-foreground hidden sm:inline'>
          {firstName}
        </span>
        <Avatar className='size-8'>
          <AvatarFallback className='text-xs'>
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label='Cerrar sesión'
        >
          <LogOut className='size-4' />
        </Button>
      </div>
    </header>
  )
}
