'use client'

import { fetchApi, buildQueryString } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useState, useEffect, useRef } from 'react'

interface UseFormOptions {
  endpoint: string
  method?: 'POST' | 'PUT'
}

export function useCreateForm({ endpoint, method = 'POST' }: UseFormOptions) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const { toast } = useToast()

  const openCreate = () => {
    setForm({})
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (item: any) => {
    setForm({ ...item })
    setEditingId(item.id)
    setOpen(true)
  }

  const submit = async (overrides?: Record<string, any>) => {
    setLoading(true)
    try {
      const url = editingId ? `${endpoint}/${editingId}` : endpoint
      const res = await fetchApi(url, {
        method: editingId ? 'PUT' : method,
        body: JSON.stringify({ ...form, ...overrides }),
      })
      toast({ title: editingId ? 'Updated successfully' : 'Created successfully' })
      setOpen(false)
      setForm({})
      setEditingId(null)
      return res
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { open, setOpen, loading, editingId, form, setForm, openCreate, openEdit, submit }
}

export function useDelete() {
  const [deleting, setDeleting] = useState<string | null>(null)
  const { toast } = useToast()

  const deleteItem = async (endpoint: string, id: string, onSuccess?: () => void) => {
    setDeleting(id)
    try {
      await fetchApi(`${endpoint}/${id}`, { method: 'DELETE' })
      toast({ title: 'Deleted successfully' })
      onSuccess?.()
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  return { deleting, deleteItem }
}

export function useApproveAction() {
  const [acting, setActing] = useState<string | null>(null)
  const { toast } = useToast()

  const act = async (endpoint: string, id: string, action: 'approve' | 'reject', onSuccess?: () => void) => {
    setActing(id)
    try {
      await fetchApi(`${endpoint}/${id}/${action}`, { method: 'POST' })
      toast({ title: action === 'approve' ? 'Approved' : 'Rejected' })
      onSuccess?.()
    } catch (e: any) {
      toast({ title: `${action} failed`, description: e.message, variant: 'destructive' })
    } finally {
      setActing(null)
    }
  }

  return { acting, act }
}

export function useApiGet<T = any>(endpoint: string, params?: Record<string, string | number | undefined>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = () => setRefreshCounter((c) => c + 1)

  const qs = params ? buildQueryString(params) : ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchApi<T>(`${endpoint}${qs}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [endpoint, qs, refreshCounter])

  return { data, loading, error, refresh }
}
/**
 * F3: useApiGetV1 — like useApiGet but unwraps the /v1/* { success, data } envelope.
 * Use this for any /api/v1/** endpoint so the component receives `data` directly
 * instead of { success, data }.
 */
export function useApiGetV1<T = any>(endpoint: string, params?: Record<string, string | number | undefined>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = () => setRefreshCounter((c) => c + 1)

  const qs = params ? buildQueryString(params) : ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchApi<{ success?: boolean; data?: T; error?: { code: string; message: string } }>(`${endpoint}${qs}`)
      .then((json) => {
        if (cancelled) return
        if (json && json.success === false) {
          setError(json.error?.message ?? 'Request failed')
          setData(null)
        } else {
          setData((json?.data ?? json) as T)
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [endpoint, qs, refreshCounter])

  return { data, loading, error, refresh }
}
