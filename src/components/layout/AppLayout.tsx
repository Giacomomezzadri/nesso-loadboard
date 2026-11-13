import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { MobileNavDrawer } from './MobileNavDrawer'
import { PrintHeader } from './PrintHeader'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function BrandMark() {
  return (
    <div className="flex items-center gap-2 px-1">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 1.5 22 6v6.2c0 6-4.3 9.6-10 10.3-5.7-.7-10-4.3-10-10.3V6z" fill="var(--color-primary)" />
        <path d="M12 1.5 22 6v6.2c0 6-4.3 9.6-10 10.3z" fill="var(--color-ink)" fillOpacity="0.16" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">LozioBoard</span>
    </div>
  )
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-full bg-page">
      <aside className="no-print hidden w-60 shrink-0 flex-col gap-5 border-r border-border bg-surface p-5 md:flex">
        <BrandMark />
        <Sidebar className="flex-1" />
      </aside>

      <MobileNavDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-7">
          <PrintHeader />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
