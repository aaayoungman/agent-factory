'use client'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { DataProvider } from '@/components/data-provider'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSetup = pathname === '/setup'

  if (isSetup) {
    return <>{children}</>
  }

  return (
    <DataProvider>
      <Sidebar />
      {/* md:ml-64 only pushes content on desktop; mobile has overlay sidebar */}
      <main className="min-h-screen p-4 pt-16 md:pt-6 md:ml-64 md:p-6">
        {children}
      </main>
    </DataProvider>
  )
}
