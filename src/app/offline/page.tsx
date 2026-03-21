'use client'

export default function OfflinePage() {
  return (
    <div className='flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center'>
      <div className='text-5xl'>📡</div>
      <h1 className='text-2xl font-bold'>Sin conexión</h1>
      <p className='max-w-sm text-muted-foreground'>
        No hay conexión a internet. Verifica tu red e intenta nuevamente.
      </p>
      <button
        onClick={() => window.location.reload()}
        className='rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground'
      >
        Reintentar
      </button>
    </div>
  )
}
