'use client'
import dynamic from 'next/dynamic'

const EnterpriseShell = dynamic(() => import('@/components/enterprise/enterprise-shell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 mx-auto rounded-xl bg-[#003ABC] flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">A</span>
        </div>
        <p className="text-sm text-slate-500">Loading Enterprise Platform...</p>
      </div>
    </div>
  ),
})

export default function Home() {
  return <EnterpriseShell />
}
