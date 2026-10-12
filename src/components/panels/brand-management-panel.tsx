'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Palette,
  Upload,
  Check,
  Eye,
  Building2,
  Type,
  Circle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// ── Types ───────────────────────────────────────────────────────────────────

interface BrandConfig {
  id: string
  companyId: string
  companyName: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  fontFamily: string
  sidebarStyle: 'light' | 'dark' | 'gradient'
  faviconUrl: string | null
  updatedAt: string
}

const DEFAULT_BRANDS: BrandConfig[] = [
  {
    id: 'alo-labs',
    companyId: 'alo-labs',
    companyName: 'ALO Labs',
    logoUrl: null,
    primaryColor: '#0A1628',
    accentColor: '#00D4FF',
    fontFamily: 'Inter',
    sidebarStyle: 'dark',
    faviconUrl: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'alo-education',
    companyId: 'alo-education',
    companyName: 'ALO Education',
    logoUrl: null,
    primaryColor: '#1B2A4A',
    accentColor: '#FF6B35',
    fontFamily: 'Inter',
    sidebarStyle: 'gradient',
    faviconUrl: null,
    updatedAt: new Date().toISOString(),
  },
]

const PRESET_FONTS = ['Inter', 'Poppins', 'Roboto', 'Plus Jakarta Sans', 'DM Sans', 'Space Grotesk']

// ── Component ───────────────────────────────────────────────────────────────

export default function BrandManagementPanel() {
  const [brands, setBrands] = useState<BrandConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('alo-labs')

  // Edit state per brand
  const [editState, setEditState] = useState<Record<string, BrandConfig>>({})
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/brands')
      const data = await res.json()
      const loaded: BrandConfig[] = data.data || []
      // Merge with defaults so we always have both brands
      const merged = DEFAULT_BRANDS.map((def) => {
        const found = loaded.find((b: BrandConfig) => b.companyId === def.companyId)
        return found || def
      })
      setBrands(merged)
      // Initialize edit state
      const init: Record<string, BrandConfig> = {}
      merged.forEach((b) => {
        init[b.companyId] = { ...b }
      })
      setEditState(init)
    } catch {
      // Fallback to defaults
      setBrands(DEFAULT_BRANDS)
      const init: Record<string, BrandConfig> = {}
      DEFAULT_BRANDS.forEach((b) => {
        init[b.companyId] = { ...b }
      })
      setEditState(init)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Handlers ───────────────────────────────────────────────────────────

  const updateField = (companyId: string, field: keyof BrandConfig, value: string) => {
    setEditState((prev) => ({
      ...prev,
      [companyId]: { ...prev[companyId], [field]: value },
    }))
  }

  const handleSave = async (companyId: string) => {
    setSaving(true)
    try {
      const brand = editState[companyId]
      await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brand),
      })
      setSavedId(companyId)
      setTimeout(() => setSavedId(null), 2000)
      fetchData()
    } catch {
      // silently handle
    } finally {
      setSaving(false)
    }
  }

  const currentBrand = editState[activeTab]

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
        <Skeleton className="h-8 w-56 bg-slate-200" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[500px] rounded-xl bg-slate-100" />
          <Skeleton className="h-[500px] rounded-xl bg-slate-100" />
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#1E293B]">Brand Engine</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Customize branding, logos, colors, and theme settings for each company
        </p>
      </div>

      {/* Brand tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-[#E2E8F0]">
          {brands.map((brand) => (
            <TabsTrigger
              key={brand.companyId}
              value={brand.companyId}
              className="text-[#64748B] data-[state=active]:bg-[#003ABC]/10 data-[state=active]:text-[#003ABC]"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full border border-[#E2E8F0]"
                  style={{ backgroundColor: brand.primaryColor }}
                />
                {brand.companyName}
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {brands.map((brand) => (
          <TabsContent key={brand.companyId} value={brand.companyId}>
            {editState[brand.companyId] && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Settings Card ─────────────────────────────────────── */}
                <Card className="border-[#E2E8F0]">
                  <CardHeader>
                    <CardTitle className="text-[#1E293B] text-base flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[#003ABC]" />
                      Brand Settings
                    </CardTitle>
                    <CardDescription className="text-[#64748B]">
                      Configure visual identity for {brand.companyName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                      <Label className="text-[#1E293B]">Company Logo</Label>
                      <div className="flex items-center gap-4">
                        <div
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-[#E2E8F0] flex items-center justify-center bg-[#F8FAFC] hover:bg-slate-50 cursor-pointer transition-colors"
                          style={{ borderColor: editState[brand.companyId].accentColor + '60' }}
                        >
                          {editState[brand.companyId].logoUrl ? (
                            <img
                              src={editState[brand.companyId].logoUrl!}
                              alt="Logo"
                              className="w-12 h-12 object-contain rounded-lg"
                            />
                          ) : (
                            <Upload className="w-5 h-5 text-[#94A3B8]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#E2E8F0] text-[#1E293B] text-xs"
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = 'image/*'
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0]
                                if (file) {
                                  const reader = new FileReader()
                                  reader.onload = (ev) => {
                                    updateField(brand.companyId, 'logoUrl', ev.target?.result as string)
                                  }
                                  reader.readAsDataURL(file)
                                }
                              }
                              input.click()
                            }}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1.5" />
                            Upload Logo
                          </Button>
                          <p className="text-[10px] text-[#94A3B8] mt-1">PNG, SVG, or JPG. Max 2MB.</p>
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-[#E2E8F0]" />

                    {/* Colors */}
                    <div className="space-y-3">
                      <Label className="text-[#1E293B]">Colors</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[#94A3B8] text-xs">Primary Color</Label>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <input
                                type="color"
                                value={editState[brand.companyId].primaryColor}
                                onChange={(e) => updateField(brand.companyId, 'primaryColor', e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-10 h-10"
                              />
                              <div
                                className="w-10 h-10 rounded-lg border border-[#E2E8F0] cursor-pointer"
                                style={{ backgroundColor: editState[brand.companyId].primaryColor }}
                              />
                            </div>
                            <Input
                              value={editState[brand.companyId].primaryColor}
                              onChange={(e) => updateField(brand.companyId, 'primaryColor', e.target.value)}
                              className="flex-1 border-[#E2E8F0] font-mono text-xs focus-visible:ring-[#003ABC]"
                              maxLength={7}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[#94A3B8] text-xs">Accent Color</Label>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <input
                                type="color"
                                value={editState[brand.companyId].accentColor}
                                onChange={(e) => updateField(brand.companyId, 'accentColor', e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-10 h-10"
                              />
                              <div
                                className="w-10 h-10 rounded-lg border border-[#E2E8F0] cursor-pointer"
                                style={{ backgroundColor: editState[brand.companyId].accentColor }}
                              />
                            </div>
                            <Input
                              value={editState[brand.companyId].accentColor}
                              onChange={(e) => updateField(brand.companyId, 'accentColor', e.target.value)}
                              className="flex-1 border-[#E2E8F0] font-mono text-xs focus-visible:ring-[#003ABC]"
                              maxLength={7}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-[#E2E8F0]" />

                    {/* Font Family */}
                    <div className="space-y-2">
                      <Label className="text-[#1E293B] flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5" />
                        Font Family
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {PRESET_FONTS.map((font) => (
                          <Button
                            key={font}
                            variant="outline"
                            size="sm"
                            onClick={() => updateField(brand.companyId, 'fontFamily', font)}
                            className={
                              editState[brand.companyId].fontFamily === font
                                ? 'bg-[#003ABC]/10 border-[#003ABC] text-[#003ABC] text-xs'
                                : 'border-[#E2E8F0] text-[#64748B] text-xs hover:bg-[#F8FAFC]'
                            }
                            style={{ fontFamily: font }}
                          >
                            {font}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Separator className="bg-[#E2E8F0]" />

                    {/* Sidebar Style */}
                    <div className="space-y-2">
                      <Label className="text-[#1E293B]">Sidebar Style</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['light', 'dark', 'gradient'] as const).map((style) => (
                          <Button
                            key={style}
                            variant="outline"
                            size="sm"
                            onClick={() => updateField(brand.companyId, 'sidebarStyle', style)}
                            className={
                              editState[brand.companyId].sidebarStyle === style
                                ? 'bg-[#003ABC]/10 border-[#003ABC] text-[#003ABC] text-xs capitalize'
                                : 'border-[#E2E8F0] text-[#64748B] text-xs hover:bg-[#F8FAFC] capitalize'
                            }
                          >
                            {style}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Separator className="bg-[#E2E8F0]" />

                    {/* Save */}
                    <Button
                      onClick={() => handleSave(brand.companyId)}
                      disabled={saving}
                      className="w-full bg-[#003ABC] hover:bg-[#002A99] text-white"
                    >
                      {saving && savedId !== brand.companyId ? (
                        'Saving...'
                      ) : savedId === brand.companyId ? (
                        <span className="flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Saved
                        </span>
                      ) : (
                        'Save Brand Settings'
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* ── Preview Card ──────────────────────────────────────── */}
                <Card className="border-[#E2E8F0]">
                  <CardHeader>
                    <CardTitle className="text-[#1E293B] text-base flex items-center gap-2">
                      <Eye className="w-4 h-4 text-[#003ABC]" />
                      Live Preview
                    </CardTitle>
                    <CardDescription className="text-[#64748B]">
                      Preview how the brand looks in the application
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BrandPreview brand={editState[brand.companyId]} />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ── Brand Preview Sub-component ─────────────────────────────────────────────

function BrandPreview({ brand }: { brand: BrandConfig }) {
  const sidebarBg =
    brand.sidebarStyle === 'dark'
      ? brand.primaryColor
      : brand.sidebarStyle === 'gradient'
        ? `linear-gradient(180deg, ${brand.primaryColor} 0%, ${brand.primaryColor}cc 100%)`
        : '#FFFFFF'

  const textColor = brand.sidebarStyle === 'light' ? '#1E293B' : '#FFFFFF'
  const mutedColor = brand.sidebarStyle === 'light' ? '#64748B' : '#94A3B8'
  const activeBg = brand.sidebarStyle === 'light' ? '#F1F5F9' : 'rgba(255,255,255,0.1)'

  return (
    <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Preview top bar */}
      <div className="h-8 bg-white border-b border-[#E2E8F0] flex items-center px-3 gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
      </div>

      <div className="flex h-[380px]">
        {/* Preview sidebar */}
        <div className="w-[140px] shrink-0 p-3 flex flex-col" style={{ background: sidebarBg }}>
          {/* Logo area */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: mutedColor + '30' }}>
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs"
              style={{ backgroundColor: brand.accentColor }}
            >
              A
            </div>
            <span className="text-xs font-bold" style={{ color: textColor }}>
              {brand.companyName}
            </span>
          </div>

          {/* Nav items */}
          <div className="space-y-1 flex-1">
            {['Dashboard', 'Agents', 'Workflows', 'Tasks', 'Settings'].map((item, i) => (
              <div
                key={item}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] cursor-default"
                style={{
                  backgroundColor: i === 0 ? activeBg : 'transparent',
                  color: i === 0 ? brand.accentColor : mutedColor,
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                <Circle className="w-3 h-3 fill-current" />
                {item}
              </div>
            ))}
          </div>

          {/* Bottom */}
          <div className="pt-2 border-t" style={{ borderColor: mutedColor + '30' }}>
            <div className="flex items-center gap-2 px-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                style={{ backgroundColor: brand.accentColor }}
              >
                SA
              </div>
              <div>
                <p className="text-[10px] font-medium" style={{ color: textColor }}>Admin</p>
                <p className="text-[8px]" style={{ color: mutedColor }}>Super Admin</p>
              </div>
            </div>
          </div>
        </div>

        {/* Preview main area */}
        <div className="flex-1 bg-[#F8FAFC] p-4 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#1E293B]" style={{ fontFamily: brand.fontFamily }}>
              Dashboard
            </h3>
            <div className="flex items-center gap-2">
              <Badge
                className="text-[9px] px-2 py-0 border-0"
                style={{ backgroundColor: brand.accentColor + '20', color: brand.accentColor }}
              >
                Healthy
              </Badge>
            </div>
          </div>

          {/* Preview stat cards */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Agents', value: '—' },
              { label: 'Tasks', value: '—' },
              { label: 'Workflows', value: '—' },
              { label: 'Users', value: '—' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg border border-[#E2E8F0] p-2.5">
                <p className="text-lg font-bold text-[#1E293B]" style={{ fontFamily: brand.fontFamily }}>
                  {stat.value}
                </p>
                <p className="text-[9px] text-[#94A3B8]">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Preview chart area */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-3 h-[120px]">
            <div className="flex items-end gap-1.5 h-full pb-4">
              {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${h}%`,
                    backgroundColor:
                      i === 9 ? brand.accentColor : brand.accentColor + '30',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}