'use client'

import { Globe } from 'lucide-react'
import Observability from './observability'

/** Usage records are measured by the tenant stats endpoint. They are not a
 * complete request counter, uptime probe, or per-route latency measurement. */
export default function ApiGateway() {
  return (
    <div>
      <div className="flex items-center gap-3 px-6 pt-6">
        <Globe className="h-5 w-5 text-[#003ABC]" />
        <div>
          <h2 className="text-xl font-semibold">API Gateway</h2>
          <p className="text-sm text-slate-500">Recorded tenant usage is shown below. Gateway uptime, endpoint health and request rates are not measured here.</p>
        </div>
      </div>
      <Observability />
    </div>
  )
}
