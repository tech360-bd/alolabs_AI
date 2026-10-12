'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Star, Download, Plus, Tag, Package, Bot, Workflow, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/* ────────────── Types ────────────── */

interface MarketplaceListing {
  id: string
  type: string
  itemId: string
  title: string
  description: string
  category: string | null
  tags: string
  version: string
  authorId: string | null
  authorName: string | null
  pricing: string
  priceMonthly: number
  rating: number
  reviewCount: number
  installCount: number
  featured: boolean
  status: string
  createdAt: string
  updatedAt: string
  reviews?: MarketplaceReview[]
}

interface MarketplaceReview {
  id: string
  listingId: string
  rating: number
  title: string | null
  comment: string | null
  companyId: string | null
  userId: string | null
  createdAt: string
}

/* ────────────── Helpers ────────────── */

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  }
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  const sizeClass = size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <span className={`inline-flex items-center gap-0.5 ${sizeClass}`}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={`f-${i}`} className="text-amber-400">★</span>
      ))}
      {hasHalf && <span className="text-amber-400">★</span>}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <span key={`e-${i}`} className="text-slate-300">★</span>
      ))}
    </span>
  )
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'agent') return <Bot className="w-4 h-4" />
  if (type === 'skill') return <Package className="w-4 h-4" />
  return <Workflow className="w-4 h-4" />
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    agent: 'bg-violet-100 text-violet-700 border-violet-200',
    skill: 'bg-sky-100 text-sky-700 border-sky-200',
    workflow: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${map[type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
    >
      <TypeIcon type={type} />
      {type}
    </span>
  )
}

function PricingBadge({ pricing, priceMonthly }: { pricing: string; priceMonthly: number }) {
  if (pricing === 'free') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        Free
      </span>
    )
  }
  if (pricing === 'enterprise') {
    return (
      <span className="inline-flex items-center rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-2 py-0.5 text-[10px] font-medium text-[#FF6A00]">
        Enterprise
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#003ABC]/30 bg-[#003ABC]/10 px-2 py-0.5 text-[10px] font-medium text-[#003ABC]">
      ${priceMonthly ? (priceMonthly / 100).toFixed(0) : '?'}/mo
    </span>
  )
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ────────────── Detail Dialog ────────────── */

function ListingDetailDialog({
  listing,
  open,
  onOpenChange,
  onInstall,
}: {
  listing: MarketplaceListing | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onInstall: (id: string) => void
}) {
  const [reviews, setReviews] = useState<MarketplaceReview[]>([])
  const [loadingReviews, setLoadingReviews] = useState(false)

  useEffect(() => {
    if (open && listing) {
      fetch(`/api/marketplace/${listing.id}/reviews`)
        .then((r) => r.json())
        .then((res) => {
          setReviews(res.data ?? [])
          setLoadingReviews(false)
        })
        .catch(() => setLoadingReviews(false))
    }
  }, [open, listing])

  if (!listing) return null

  const tags = parseTags(listing.tags)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TypeBadge type={listing.type} />
            <PricingBadge pricing={listing.pricing} priceMonthly={listing.priceMonthly} />
            {listing.featured && (
              <Badge className="bg-[#FF6A00] text-white text-[10px] border-0">Featured</Badge>
            )}
          </div>
          <DialogTitle className="text-[#1E293B] text-lg">{listing.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <StarRating rating={listing.rating} size="sm" />
              <span className="text-slate-600 ml-1">{listing.rating.toFixed(1)}</span>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{listing.reviewCount} reviews</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{fmtNum(listing.installCount)} installs</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              Version {listing.version}
            </span>
            {listing.authorName && (
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {listing.authorName}
              </span>
            )}
            {listing.category && (
              <span>{listing.category}</span>
            )}
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-[#1E293B] whitespace-pre-wrap leading-relaxed">{listing.description}</p>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] hover:bg-slate-200 border-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Reviews */}
          <div>
            <h4 className="text-sm font-semibold text-[#1E293B] mb-2">
              Reviews ({listing.reviewCount})
            </h4>
            {loadingReviews ? (
              <p className="text-xs text-slate-500">Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-slate-500">No reviews yet.</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {reviews.map((review) => (
                  <div key={review.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1">
                      <StarRating rating={review.rating} />
                      <span className="text-[10px] text-slate-400">{fmtDate(review.createdAt)}</span>
                    </div>
                    {review.title && (
                      <p className="text-xs font-medium text-[#1E293B]">{review.title}</p>
                    )}
                    {review.comment && (
                      <p className="text-xs text-slate-600 mt-0.5">{review.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-sm">
            Close
          </Button>
          <Button
            onClick={() => {
              onInstall(listing.id)
              onOpenChange(false)
            }}
            className="bg-[#003ABC] hover:bg-[#002A9E] text-white text-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────── Publish Dialog ────────────── */

function PublishDialog({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPublished: () => void
}) {
  const [form, setForm] = useState({
    type: 'agent',
    itemId: '',
    title: '',
    description: '',
    category: '',
    tags: '',
    version: '1.0.0',
    authorName: '',
    pricing: 'free',
    priceMonthly: '0',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.type || !form.itemId || !form.title || !form.description) return
    setSubmitting(true)
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags,
          priceMonthly: Number(form.priceMonthly) * 100,
        }),
      })
      if (res.ok) {
        onPublished()
        onOpenChange(false)
        setForm({
          type: 'agent',
          itemId: '',
          title: '',
          description: '',
          category: '',
          tags: '',
          version: '1.0.0',
          authorName: '',
          pricing: 'free',
          priceMonthly: '0',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Publish to Marketplace</DialogTitle>
          <DialogDescription>Create a new listing for an agent, skill, or workflow.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Type *</Label>
              <Select value={form.type} onValueChange={(v) => handleChange('type', v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="skill">Skill</SelectItem>
                  <SelectItem value="workflow">Workflow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Pricing</Label>
              <Select value={form.pricing} onValueChange={(v) => handleChange('pricing', v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Item ID *</Label>
            <Input
              value={form.itemId}
              onChange={(e) => handleChange('itemId', e.target.value)}
              placeholder="The ID of the agent/skill/workflow"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Listing title"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Description *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Detailed description of the listing..."
              rows={4}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Category</Label>
              <Input
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
                placeholder="e.g. Productivity"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Version</Label>
              <Input
                value={form.version}
                onChange={(e) => handleChange('version', e.target.value)}
                placeholder="1.0.0"
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Tags (comma-separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => handleChange('tags', e.target.value)}
              placeholder="automation, productivity, sales"
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Author Name</Label>
              <Input
                value={form.authorName}
                onChange={(e) => handleChange('authorName', e.target.value)}
                placeholder="Author display name"
                className="text-sm"
              />
            </div>
            {form.pricing === 'premium' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#1E293B]">Monthly Price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.priceMonthly}
                  onChange={(e) => handleChange('priceMonthly', e.target.value)}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.itemId || !form.title || !form.description}
            className="bg-[#003ABC] hover:bg-[#002A9E] text-white text-sm"
          >
            {submitting ? 'Publishing...' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────── Main Panel ────────────── */

export default function MarketplacePanel() {
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filters
  const [searchQuery, setSearchQueryRaw] = useState('')
  const [typeFilter, setTypeFilterRaw] = useState('')
  const [pricingFilter, setPricingFilterRaw] = useState('')
  const [sortBy, setSortByRaw] = useState('createdAt')
  const [page, setPageRaw] = useState(1)

  // Dialogs
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const limit = 12

  const fetchListings = useCallback(() => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('search', searchQuery)
    if (typeFilter) params.set('type', typeFilter)
    if (pricingFilter) params.set('pricing', pricingFilter)
    if (sortBy) params.set('sort', sortBy)
    params.set('page', String(page))
    params.set('limit', String(limit))

    fetch(`/api/marketplace?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        setListings(res.data ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [searchQuery, typeFilter, pricingFilter, sortBy, page])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  const handleInstall = async (id: string) => {
    try {
      const res = await fetch(`/api/marketplace/${id}/install`, { method: 'POST' })
      if (res.ok) fetchListings()
    } catch {}
  }

  const viewListing = (listing: MarketplaceListing) => {
    setSelectedListing(listing)
    setDetailOpen(true)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-[#1E293B]">Marketplace</h2>
        <Button
          onClick={() => setPublishOpen(true)}
          className="bg-[#003ABC] hover:bg-[#002A9E] text-white text-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Publish to Marketplace
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => { setSearchQueryRaw(e.target.value); setPageRaw(1) }}
            placeholder="Search agents, skills, workflows..."
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilterRaw(v === '__all__' ? '' : v); setPageRaw(1) }}>
            <SelectTrigger className="w-[140px] text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              <SelectItem value="agent">Agents</SelectItem>
              <SelectItem value="skill">Skills</SelectItem>
              <SelectItem value="workflow">Workflows</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pricingFilter} onValueChange={(v) => { setPricingFilterRaw(v === '__all__' ? '' : v); setPageRaw(1) }}>
            <SelectTrigger className="w-[140px] text-sm">
              <SelectValue placeholder="All Pricing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Pricing</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => { setSortByRaw(v); setPageRaw(1) }}>
            <SelectTrigger className="w-[130px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Newest</SelectItem>
              <SelectItem value="rating">Top Rated</SelectItem>
              <SelectItem value="installCount">Most Installed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-500">
        {total} {total === 1 ? 'result' : 'results'} found
      </p>

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading...</p>
      ) : listings.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No listings found.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listings.map((listing) => {
              const tags = parseTags(listing.tags)
              return (
                <Card
                  key={listing.id}
                  className="border-slate-200 bg-white hover:shadow-md hover:border-[#003ABC]/20 transition-all cursor-pointer group"
                  onClick={() => viewListing(listing)}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Top row: type + pricing */}
                    <div className="flex items-center justify-between">
                      <TypeBadge type={listing.type} />
                      <PricingBadge pricing={listing.pricing} priceMonthly={listing.priceMonthly} />
                    </div>

                    {/* Title */}
                    <div>
                      <h3 className="text-sm font-semibold text-[#1E293B] group-hover:text-[#003ABC] transition-colors line-clamp-1">
                        {listing.title}
                      </h3>
                      {listing.authorName && (
                        <p className="text-[11px] text-slate-500 mt-0.5">by {listing.authorName}</p>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {listing.description}
                    </p>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-slate-100 text-slate-600 text-[10px] hover:bg-slate-200 border-0 px-1.5"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Bottom row: rating, installs, featured */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5">
                          <StarRating rating={listing.rating} />
                          <span className="text-[11px] text-slate-500 ml-0.5">{listing.rating.toFixed(1)}</span>
                        </span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                          <Download className="w-3 h-3" />
                          {fmtNum(listing.installCount)}
                        </span>
                      </div>
                      {listing.featured && (
                        <Badge className="bg-[#FF6A00] text-white text-[9px] border-0 px-1.5">
                          Featured
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageRaw((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs"
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageRaw((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <ListingDetailDialog
        listing={selectedListing}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onInstall={handleInstall}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={fetchListings}
      />
    </div>
  )
}