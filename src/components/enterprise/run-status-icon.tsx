import { CheckCircle2, Clock, FileText, Loader2, XCircle } from 'lucide-react';

export function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
  if (status === 'running' || status === 'planning') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
  if (status === 'waiting_approval') return <FileText className="h-4 w-4 shrink-0 text-amber-500" />
  return <Clock className="h-4 w-4 shrink-0 text-slate-400" />
}
