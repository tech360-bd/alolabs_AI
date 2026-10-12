'use client'

import { useEffect, useState } from 'react'
import { Building2, Globe, Wifi } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface Company {
  id: string
  name: string
  slug: string
  domain: string | null
  status: string
  webCrmConnected: boolean
  monthlyUsageLimit: number
  userCount: number
  usageCount: number
  paidApiAllowed: boolean
}

export default function CompaniesPanel() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((res) => setCompanies(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  const totalCompanies = companies.length
  const activeCompanies = companies.filter((c) => c.status === 'active').length
  const connectedCompanies = companies.filter((c) => c.webCrmConnected).length

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-[#1E293B]">Companies</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Companies', value: totalCompanies },
          { label: 'Active', value: activeCompanies },
          { label: 'CRM Connected', value: connectedCompanies },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-center">
            <p className="text-3xl font-bold text-[#003ABC]">{s.value}</p>
            <p className="text-xs text-[#64748B] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {companies.map((company) => (
          <div key={company.id} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-[#003ABC]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1E293B]">{company.name}</h3>
                  {company.domain && (
                    <div className="flex items-center gap-1 text-xs text-[#64748B]">
                      <Globe className="w-3 h-3" />
                      {company.domain}
                    </div>
                  )}
                </div>
              </div>
              <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className={company.status === 'active' ? 'bg-emerald-600/10 text-emerald-600' : 'bg-gray-100 text-[#64748B]'}>
                {company.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                {company.webCrmConnected ? (
                  <Badge className="bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] py-0">
                    <Wifi className="w-2.5 h-2.5 mr-1" />
                    CRM Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] py-0">
                    CRM Disconnected
                  </Badge>
                )}
              </div>
              <span className="text-[#64748B]">{company.usageCount} uses</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}