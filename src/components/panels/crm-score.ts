export function scoreBarColor(score: number) {
  if (score >= 70) return '[&>div]:bg-emerald-500'
  if (score >= 40) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-red-400'
}

export function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-500'
}
