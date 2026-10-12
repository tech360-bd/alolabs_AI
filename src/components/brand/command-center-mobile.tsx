/**
 * CommandCenterMobile — the blue-theme mobile view from the brand sheet,
 * rebuilt as a live component so the marketing site, the app shell and the
 * brand book all show the same surface.
 *
 * Twelve tiles over the search field, four-tab bar at the foot, the lockup in
 * the header — the whole thing scales with its container.
 */

import * as React from 'react'
import {
  LayoutDashboard,
  Bot,
  ListChecks,
  BadgeCheck,
  FileBarChart,
  BookOpen,
  GraduationCap,
  Handshake,
  IdCard,
  Megaphone,
  Landmark,
  Settings,
  Home,
  MessageSquare,
  Bell,
  User,
  Menu,
  Search,
  Mic,
} from 'lucide-react'
import { Mark } from './alo-logo'
import { BRAND, COMMAND_TAB_BAR, COMMAND_TILES, COMPANY } from '@/lib/brand/tokens'
import { cn } from '@/lib/utils'

const TILE_ICONS = [
  LayoutDashboard, Bot, ListChecks,
  BadgeCheck, FileBarChart, BookOpen,
  GraduationCap, Handshake, IdCard,
  Megaphone, Landmark, Settings,
] as const

const TAB_ICONS = [Home, MessageSquare, Bell, User] as const

export function CommandCenterMobile({ className }: { className?: string }) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[320px] rounded-[36px] p-2.5 shadow-xl', className)}
      style={{ background: BRAND.navy, boxShadow: '0 24px 55px -30px rgba(0,28,107,0.75)' }}
    >
      <div className="overflow-hidden rounded-[28px]" style={{ background: BRAND.tintSoft }}>
        {/* Status + header */}
        <div className="flex items-center justify-between px-4 pt-3 text-[10px] font-semibold text-white" style={{ background: BRAND.blue }}>
          <span>9:41</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="inline-block h-2 w-3.5 rounded-sm bg-white/80" />
            <span className="inline-block h-2 w-2 rounded-sm bg-white/80" />
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3 pt-2" style={{ background: BRAND.blue }}>
          <span className="flex size-8 items-center justify-center rounded-full bg-white">
            <Mark size={20} />
          </span>
          <p className="flex-1 text-[12px] font-bold tracking-[0.06em] text-white">
            {COMPANY.legalName.toUpperCase()} COMMAND CENTER
          </p>
          <Menu className="size-4 text-white/85" aria-hidden="true" />
        </div>

        {/* Search */}
        <div className="border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <Search className="size-3.5 text-slate-400" aria-hidden="true" />
            <span className="flex-1 truncate text-[10px] text-slate-400">Ask ALO AgentOS anything…</span>
            <Mic className="size-3.5" style={{ color: BRAND.orange }} aria-hidden="true" />
          </div>
        </div>

        {/* Tile grid */}
        <div className="grid grid-cols-3 gap-2 px-3 py-3">
          {COMMAND_TILES.map((tile, i) => {
            const Icon = TILE_ICONS[i]
            return (
              <div
                key={tile}
                className="flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-2.5"
                style={{ background: BRAND.tint, border: `1px solid ${BRAND.tintLine}` }}
              >
                <span className="flex size-6 items-center justify-center rounded-md bg-white" aria-hidden="true">
                  <Icon className="size-3.5" style={{ color: BRAND.blue }} strokeWidth={2.2} />
                </span>
                <span className="text-[8.5px] font-semibold leading-none" style={{ color: BRAND.blue }}>
                  {tile}
                </span>
              </div>
            )
          })}
        </div>

        {/* Tab bar */}
        <div className="flex items-center justify-around border-t border-slate-200 bg-white px-2 py-2">
          {COMMAND_TAB_BAR.map((tab, i) => {
            const Icon = TAB_ICONS[i]
            const active = i === 0
            return (
              <span key={tab} className="flex flex-col items-center gap-0.5">
                <Icon
                  className="size-4"
                  style={{ color: active ? BRAND.orange : BRAND.graySoft }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <span
                  className="text-[7.5px] font-semibold"
                  style={{ color: active ? BRAND.orange : BRAND.graySoft }}
                >
                  {tab}
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
