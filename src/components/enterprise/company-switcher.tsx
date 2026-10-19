'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAppStore } from '@/store/app'

type CompanyOption = { id: string; name: string; slug: string; status: string }

export default function CompanySwitcher() {
  const selectedCompany = useAppStore((state) => state.selectedCompany)
  const setSelectedCompany = useAppStore((state) => state.setSelectedCompany)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchApi<{ data?: CompanyOption[] }>('/api/companies')
      .then((response) => { if (!cancelled) setCompanies(response.data ?? []) })
      .catch(() => { if (!cancelled) setCompanies([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (!loading && companies.length === 0) return null

  return (
    <label className="inline-flex max-w-[240px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-700" aria-hidden="true" />
      <span className="sr-only">Active company</span>
      <select
        aria-label="Active company"
        value={selectedCompany ?? ''}
        disabled={loading}
        onChange={(event) => setSelectedCompany(event.target.value || null)}
        className="min-w-0 max-w-[190px] bg-transparent text-xs font-medium outline-none disabled:opacity-60"
      >
        <option value="">{loading ? 'Loading companies…' : 'Choose company'}</option>
        {companies.map((company) => (
          <option key={company.id} value={company.slug} disabled={company.status !== 'active'}>
            {company.name}{company.status !== 'active' ? ` (${company.status})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
