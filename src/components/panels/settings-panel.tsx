'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const defaults = { app_name: '', app_url: '', maintenance_mode: false, feature_ai: true, feature_social: true, feature_email: true }
const flags = { maintenance_mode: 'Maintenance requested', feature_ai: 'AI features', feature_social: 'Social integrations', feature_email: 'Email integrations' } as const
export default function SettingsPanel() {
  const [form, setForm] = useState(defaults), [saved, setSaved] = useState(defaults)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [services, setServices] = useState<{type: string; name: string; status: string}[]>([])
  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading')
    try {
      const r = await apiFetch('/api/settings', {signal}); if (!r.ok) throw Error()
      const {map} = await r.json(), values = {...defaults, app_name: map.app_name || '', app_url: map.app_url || ''}
      for (const key of Object.keys(flags) as (keyof typeof flags)[]) if (map[key] !== undefined) values[key] = map[key] === 'true'
      if (signal?.aborted) return;
      setForm(values); setSaved(values); setState('ready')
    } catch { if (!signal?.aborted) setState('error') }
  }, [])
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); void apiFetch('/api/infra/status', {signal:abort.signal}).then(async r => { if (r.ok) setServices((await r.json()).services || []) }).catch(() => {}); return () => abort.abort() }, [load])
  async function save() {
    setState('saving')
    try {
      const r = await apiFetch('/api/settings', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.entries(form).map(([key,value]) => ({key,value})))})
      if (!r.ok) throw Error(); setSaved(form); toast.success('Application preferences saved')
    } catch { toast.error('Preferences were not saved') } finally { setState('ready') }
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  return <section className="space-y-4 p-6" aria-label="System settings"><h2 className="text-xl font-semibold">System settings</h2>
    <Card><CardHeader><CardTitle>Application preferences</CardTitle><p className="text-sm text-slate-600">These values are saved in the application database. They do not change the deployment, provider credentials or access policies.</p></CardHeader><CardContent>
      {state === 'loading' ? <p role="status">Loading preferences…</p> : state === 'error' ? <Button onClick={() => void load()}>Retry loading preferences</Button> : <fieldset disabled={state === 'saving'} className="space-y-4">
        <label className="block">Application name<Input value={form.app_name} maxLength={1024} onChange={e => setForm({...form, app_name:e.target.value})}/></label>
        <label className="block">Application URL<Input value={form.app_url} maxLength={1024} onChange={e => setForm({...form, app_url:e.target.value})}/></label>
        {Object.entries(flags).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-4">{label}<Switch aria-label={label} checked={form[key as keyof typeof flags]} onCheckedChange={v => setForm({...form,[key]:v})}/></label>)}
        <div className="flex gap-2"><Button disabled={!dirty} onClick={save}>Save preferences</Button><Button variant="outline" disabled={!dirty} onClick={() => setForm(saved)}>Discard changes</Button></div>
      </fieldset>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Infrastructure status</CardTitle></CardHeader><CardContent>{services.length ? <ul>{services.map(s => <li key={s.type} className="flex justify-between border-b py-2"><span>{s.name}</span><span>{s.status}</span></li>)}</ul> : <p>No service status available for this session.</p>}</CardContent></Card>
  </section>
}
