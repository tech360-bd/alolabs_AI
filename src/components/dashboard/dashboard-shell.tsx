'use client'

/**
 * DashboardShell — the single authenticated dashboard for ALO Labs AgentOS.
 *
 * This replaces the three parallel shells that used to live in the repository
 * (enterprise-shell, agent-hub-shell, app-shell). Only one of them was ever
 * mounted, so every panel that existed solely in the other two was unreachable.
 * Navigation now comes from `src/lib/dashboard/navigation.ts`, which merges all
 * three catalogues (149 views, 29 groups).
 *
 * AUTHENTICATION
 * --------------
 * This component is the *client-side* half of a two-layer gate:
 *
 *   1. Server layer — `src/app/dashboard/page.tsx` verifies the `session-token`
 *      cookie against the database before this component is ever sent to the
 *      browser. An unauthenticated request is redirected to `/login` by the
 *      server, so the dashboard HTML never leaves the origin.
 *   2. Edge layer — `src/proxy.ts` refuses page requests under `/dashboard`
 *      that carry no session cookie.
 *
 * The check below is therefore defence in depth, not the primary control: if a
 * session is revoked while a tab is open, the user is dropped to the login
 * screen instead of continuing to interact with a dead session.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, LogOut, Activity, LayoutDashboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AloLabsLogo, Mark } from '@/components/brand/alo-logo'
import { useAppStore } from '@/store/app'
import {
  DASHBOARD_NAV,
  DASHBOARD_NAV_INDEX,
  DASHBOARD_PANELS,
  DEFAULT_DASHBOARD_VIEW,
  type DashboardNavItem,
} from '@/lib/dashboard/navigation'
import LoginPage from '@/components/pages/login'

// ─── Lazy panel registry ─────────────────────────────────────────────────────
// Created ONCE at module scope. Building a React.lazy() inside render (even with
// useMemo) creates a brand-new component type on every view change, which
// remounts the panel and throws away its state — and trips
// react-hooks/static-components. The registry is keyed by view id.
const LAZY_PANELS: Record<string, React.LazyExoticComponent<React.ComponentType<{ onNavigate?: (view: string) => void }>>> =
  Object.fromEntries(
    Object.entries(DASHBOARD_PANELS).map(([id, load]) => [id, React.lazy(load)]),
  )

// ─── Loading fallback ────────────────────────────────────────────────────────

function PanelLoader() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function SidebarContent({
  collapsed,
  activeId,
  onSelect,
}: {
  collapsed: boolean
  activeId: string
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DASHBOARD_NAV
    return DASHBOARD_NAV
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0)
  }, [query])

  return (
    <div className="flex h-full flex-col">
      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search views…"
              aria-label="Search dashboard views"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      )}
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              {!collapsed && (
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
              )}
              {group.items.map((item: DashboardNavItem) => {
                const Icon = item.icon
                const isActive = activeId === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                      collapsed ? 'justify-center px-2' : '',
                      isActive
                        ? 'bg-[#003ABC]/8 text-[#003ABC] shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200',
                    ].join(' ')}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#003ABC]' : 'text-slate-500 dark:text-slate-400'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                )
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-400">No views match “{query}”.</p>
          )}
        </nav>
      </ScrollArea>
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export interface DashboardUser {
  id: string
  email: string
  name: string
  role: string
}

export default function DashboardShell({ initialUser }: { initialUser?: DashboardUser } = {}) {
  const router = useRouter()
  const storeUser = useAppStore((s) => s.user)
  const appLogout = useAppStore((s) => s.logout)
  const _init = useAppStore((s) => s._init)

  const [view, setView] = useState<string>(DEFAULT_DASHBOARD_VIEW)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Hydrate the store and the saved theme after mount. Deliberately NOT an
  // early-return "is mounted" gate: the nav must be part of the server-rendered
  // HTML so the dashboard is usable (and auditable) without JavaScript, and so a
  // crawler or curl sees the real navigation rather than a spinner.
  useEffect(() => {
    _init()
    const saved = localStorage.getItem('enterprise-theme')
    if (saved === 'light' || saved === 'dark') setTheme(saved)
  }, [_init])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('enterprise-theme', next)
      return next
    })
  }, [])

  const handleLogout = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('alo_token')
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ token }),
      })
    } catch {
      // Network failure must not strand the user in a broken session UI.
    }
    appLogout()
    router.push('/login')
    router.refresh()
  }, [appLogout, router])

  const Panel = LAZY_PANELS[view] ?? LAZY_PANELS[DEFAULT_DASHBOARD_VIEW]

  // The server has already verified the session cookie; fall back to the
  // identity it resolved so the chrome renders before localStorage hydrates.
  const user = storeUser ?? initialUser ?? null

  const handleSelect = useCallback((id: string) => {
    setView(id)
    setMobileOpen(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', id)
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // Hydrate the selected view from the URL once.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    if (requested && DASHBOARD_NAV_INDEX[requested]) setView(requested)
  }, [])

  // Defence in depth: the server already redirected an unauthenticated visitor.
  if (!user) {
    return <LoginPage />
  }

  const isDark = theme === 'dark'
  const current = DASHBOARD_NAV_INDEX[view] ?? DASHBOARD_NAV_INDEX[DEFAULT_DASHBOARD_VIEW]
  const CurrentIcon = current?.icon ?? LayoutDashboard
  const initials = (user.name || user.email || 'AL').slice(0, 2).toUpperCase()

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? 'dark' : ''}`}>
      <div className={`flex h-full flex-1 ${isDark ? 'bg-[#0F172A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
        {/* Desktop sidebar */}
        <aside
          className={`hidden flex-col border-r transition-all duration-300 lg:flex ${
            isDark ? 'border-slate-700/50 bg-[#1E293B]/80' : 'border-slate-200 bg-white/80'
          } ${sidebarOpen ? 'w-[260px]' : 'w-[68px]'}`}
        >
          <div className={`flex h-14 shrink-0 items-center gap-3 border-b px-4 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            {sidebarOpen ? (
              <AloLabsLogo size={30} />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Mark size={30} />
              </span>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <SidebarContent collapsed={!sidebarOpen} activeId={view} onSelect={handleSelect} />
          </div>

          <div className={`border-t p-2 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen((v) => !v)} className="w-full justify-center" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className={`flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-sm ${isDark ? 'border-slate-700/50 bg-[#1E293B]/80' : 'border-slate-200 bg-white/80'}`}>
            <div className="flex items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className={`w-[280px] p-0 ${isDark ? 'bg-[#1E293B]' : 'bg-white'}`}>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className={`flex h-14 items-center gap-3 border-b px-4 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    <AloLabsLogo size={28} tagline={false} />
                  </div>
                  <SidebarContent collapsed={false} activeId={view} onSelect={handleSelect} />
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-3 lg:hidden">
                <AloLabsLogo size={30} tagline={false} />
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-sm font-medium text-slate-900 dark:text-white">Dashboard</span>
                <span className="text-slate-400">/</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <CurrentIcon className="h-3.5 w-3.5" />
                  {current?.label ?? 'Overview'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden capitalize sm:inline-flex">{user.role.replace('_', ' ')}</Badge>
              <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 dark:bg-emerald-950/30 sm:flex">
                <Activity className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Online</span>
              </div>
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8" aria-label="Toggle theme">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#FF6A00] text-xs font-bold text-white">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<PanelLoader />}>
              <Panel onNavigate={handleSelect} />
            </Suspense>
          </main>

          <footer className={`flex h-10 shrink-0 items-center justify-between border-t px-4 text-[11px] ${isDark ? 'border-slate-700/50 bg-[#1E293B]/80 text-slate-500' : 'border-slate-200 bg-white/80 text-slate-400'}`}>
            <span className="font-medium">ALO Labs AgentOS v3.0 — Enterprise AI Platform</span>
            <span className="hidden sm:inline">Secure. Smart. Scalable.</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
