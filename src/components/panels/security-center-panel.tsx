'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldX,
  Plus,
  Copy,
  Check,
  Trash2,
  Pencil,
  Loader2,
  QrCode,
  KeyRound,
  Globe,
  Fingerprint,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ── Types ───────────────────────────────────────────────────────────────────

interface MfaStatus {
  enabled: boolean
}

interface MfaSetupResponse {
  qrCodeUrl: string
  secret: string
}

interface OAuthProvider {
  id: string
  name: string
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string
  status: 'active' | 'inactive'
  createdAt: string
}

interface SsoConfig {
  provider: 'saml' | 'ldap' | 'oidc'
  metadataUrl: string
  entityId: string
  callbackUrl: string
  active: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SecurityCenterPanel() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-[#1E293B]">Security Center</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Manage authentication, MFA, OAuth providers, and single sign-on configurations.
        </p>
      </div>

      <Tabs defaultValue="mfa" className="w-full">
        <TabsList className="bg-white border border-[#E2E8F0] rounded-lg p-1">
          <TabsTrigger
            value="mfa"
            className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md text-[#1E293B] text-sm"
          >
            <Fingerprint className="w-4 h-4 mr-2" />
            MFA
          </TabsTrigger>
          <TabsTrigger
            value="oauth"
            className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md text-[#1E293B] text-sm"
          >
            <Globe className="w-4 h-4 mr-2" />
            OAuth Providers
          </TabsTrigger>
          <TabsTrigger
            value="sso"
            className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md text-[#1E293B] text-sm"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            SSO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mfa" className="mt-4">
          <MfaTab />
        </TabsContent>
        <TabsContent value="oauth" className="mt-4">
          <OAuthTab />
        </TabsContent>
        <TabsContent value="sso" className="mt-4">
          <SsoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── MFA Tab ─────────────────────────────────────────────────────────────────

function MfaTab() {
  const [loading, setLoading] = useState(true)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)

  // Setup state
  const [showSetup, setShowSetup] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [secret, setSecret] = useState('')

  // Verify state
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Backup codes
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  // Disable confirmation
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [disabling, setDisabling] = useState(false)

  // Copied state
  const [copiedSecret, setCopiedSecret] = useState(false)

  const fetchMfaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setMfaEnabled(data.user?.mfaEnabled ?? false)
      }
    } catch {
      // stay disabled
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMfaStatus()
  }, [fetchMfaStatus])

  const handleEnableMfa = async () => {
    setMfaLoading(true)
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to setup MFA')
      }
      const data: MfaSetupResponse = await res.json()
      setQrCodeUrl(data.qrCodeUrl)
      setSecret(data.secret)
      setShowSetup(true)
      toast.success('MFA Setup Started', { description: 'Scan the QR code with your authenticator app.'  })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Setup Failed', { description: message })
    } finally {
      setMfaLoading(false)
    }
  }

  const handleVerifyMfa = async () => {
    if (!verifyCode.trim()) return
    setVerifying(true)
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verification failed')
      }
      const data = await res.json()
      setMfaEnabled(true)
      setShowSetup(false)
      setVerifyCode('')
      setBackupCodes(data.backupCodes || [])
      toast.success('MFA Enabled', { description: 'Multi-factor authentication is now active.'  })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Verification Failed', { description: message })
    } finally {
      setVerifying(false)
    }
  }

  const handleDisableMfa = async () => {
    setDisabling(true)
    try {
      const res = await fetch('/api/auth/mfa/disable', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to disable MFA')
      }
      setMfaEnabled(false)
      setBackupCodes([])
      setShowDisableDialog(false)
      toast.success('MFA Disabled', { description: 'Multi-factor authentication has been turned off.'  })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Disable Failed', { description: message })
    } finally {
      setDisabling(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSecret(true)
    setTimeout(() => setCopiedSecret(false), 2000)
  }

  if (loading) {
    return (
      <Card className="border-[#E2E8F0]">
        <CardHeader>
          <Skeleton className="h-6 w-40 bg-[#F1F5F9]" />
          <Skeleton className="h-4 w-56 bg-[#F1F5F9]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-36 bg-[#F1F5F9]" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mfaEnabled ? (
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ShieldX className="w-5 h-5 text-amber-600" />
                </div>
              )}
              <div>
                <CardTitle className="text-base text-[#1E293B]">Multi-Factor Authentication</CardTitle>
                <CardDescription className="text-sm text-[#64748B]">
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            <Badge variant={mfaEnabled ? 'default' : 'secondary'} className={
              mfaEnabled
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200'
            }>
              {mfaEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!mfaEnabled && !showSetup && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleEnableMfa}
                disabled={mfaLoading}
                className="bg-[#003ABC] hover:bg-[#002A99] text-white"
              >
                {mfaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <QrCode className="mr-2 h-4 w-4" />
                Enable MFA
              </Button>
              <p className="text-xs text-[#94A3B8]">
                Requires an authenticator app (Google Authenticator, Authy, etc.)
              </p>
            </div>
          )}

          {mfaEnabled && !showSetup && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1E293B]">MFA is protecting your account</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Use your authenticator app to generate codes during sign-in.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowDisableDialog(true)}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <ShieldX className="mr-2 h-4 w-4" />
                Disable MFA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup QR Code */}
      {showSetup && (
        <Card className="border-[#E2E8F0] border-dashed border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#1E293B] flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#003ABC]" />
              Scan QR Code
            </CardTitle>
            <CardDescription>
              Scan this QR code with your authenticator app, then enter the verification code below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code Display */}
            <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg border border-[#E2E8F0]">
              {qrCodeUrl ? (
                <div className="w-48 h-48 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-center overflow-hidden">
                  <img
                    src={qrCodeUrl}
                    alt="MFA QR Code"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      const parent = (e.target as HTMLImageElement).parentElement
                      if (parent) {
                        parent.innerHTML = '<div class="flex flex-col items-center gap-2 text-[#94A3B8]"><svg class="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="21" x2="21" y2="21.01"/></svg><span class="text-xs">QR Code URL provided below</span></div>'
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-[#CBD5E1]" />
                </div>
              )}
            </div>

            {/* Manual Secret */}
            <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
              <p className="text-xs font-medium text-[#64748B] mb-2">
                Can&apos;t scan? Enter this secret key manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-[#E2E8F0] rounded-md px-3 py-2 text-sm font-mono text-[#1E293B] select-all break-all">
                  {secret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(secret)}
                  className="h-9 w-9 flex-shrink-0 border-[#E2E8F0] hover:bg-[#F1F5F9]"
                >
                  {copiedSecret ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Verification Code Input */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="mfa-code" className="text-sm font-medium text-[#1E293B]">
                  Verification Code
                </Label>
                <Input
                  id="mfa-code"
                  placeholder="Enter 6-digit code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="border-[#E2E8F0] focus:border-[#003ABC] text-center text-lg tracking-[0.5em] font-mono"
                  maxLength={6}
                />
              </div>
              <Button
                onClick={handleVerifyMfa}
                disabled={verifyCode.length !== 6 || verifying}
                className="bg-[#003ABC] hover:bg-[#002A99] text-white h-10 px-6"
              >
                {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowSetup(false); setQrCodeUrl(''); setSecret(''); setVerifyCode('') }}
                className="border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] h-10"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup Codes */}
      {mfaEnabled && backupCodes.length > 0 && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#FF6A00]" />
                <CardTitle className="text-base text-[#1E293B]">Backup Codes</CardTitle>
              </div>
              <Badge variant="outline" className="border-[#FF6A00] text-[#FF6A00]">
                Save these codes
              </Badge>
            </div>
            <CardDescription>
              Store these backup codes in a safe place. Each code can only be used once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2 text-center font-mono text-sm text-[#1E293B]"
                >
                  {code}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disable MFA Confirmation */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent className="bg-white border-[#E2E8F0]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Disable Multi-Factor Authentication?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              This will remove the extra security layer on your account. You will no longer need a
              verification code to sign in. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#64748B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableMfa}
              disabled={disabling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {disabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable MFA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── OAuth Tab ───────────────────────────────────────────────────────────────

function OAuthTab() {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<OAuthProvider | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    clientId: '',
    clientSecret: '',
    authUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    scopes: '',
  })

  const resetForm = () => {
    setForm({ name: '', clientId: '', clientSecret: '', authUrl: '', tokenUrl: '', userInfoUrl: '', scopes: '' })
    setEditingProvider(null)
  }

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/oauth/providers')
      if (res.ok) {
        const data = await res.json()
        setProviders(data.data || data.providers || [])
      }
    } catch {
      // empty list
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const openEditDialog = (provider: OAuthProvider) => {
    setEditingProvider(provider)
    setForm({
      name: provider.name,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret || '',
      authUrl: provider.authUrl,
      tokenUrl: provider.tokenUrl,
      userInfoUrl: provider.userInfoUrl,
      scopes: provider.scopes,
    })
    setShowAddDialog(true)
  }

  const openAddDialog = () => {
    resetForm()
    setShowAddDialog(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.clientId || !form.authUrl || !form.tokenUrl) {
      toast.error('Validation Error', { description: 'Please fill in all required fields.' })
      return
    }
    setSaving(true)
    try {
      const url = editingProvider ? `/api/auth/oauth/providers?id=${editingProvider.id}` : '/api/auth/oauth/providers'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save provider')
      }
      toast.success(editingProvider ? 'Provider Updated' : 'Provider Added', { description: `${form.name} has been ${editingProvider ? 'updated' : 'added'} successfully.` })
      setShowAddDialog(false)
      resetForm()
      fetchProviders()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Save Failed', { description: message })
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (id: string) => {
    setDeleteId(id)
    setShowDeleteDialog(true)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeletingId(deleteId)
    try {
      const res = await fetch(`/api/auth/oauth/providers?id=${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Provider Deleted', { description: 'OAuth provider has been removed.'  })
      setProviders((prev) => prev.filter((p) => p.id !== deleteId))
    } catch {
      toast.error('Delete Failed', { description: 'Could not remove the provider.' })
    } finally {
      setDeletingId(null)
      setShowDeleteDialog(false)
      setDeleteId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-[#F1F5F9]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#1E293B]">OAuth Providers</h3>
          <p className="text-xs text-[#64748B] mt-0.5">Manage external authentication providers for your organization.</p>
        </div>
        <Button onClick={openAddDialog} className="bg-[#003ABC] hover:bg-[#002A99] text-white">
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card className="border-[#E2E8F0] border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-4">
              <Globe className="w-7 h-7 text-[#94A3B8]" />
            </div>
            <p className="text-sm font-medium text-[#1E293B]">No OAuth providers configured</p>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-sm">
              Add an OAuth provider to enable third-party authentication for your users.
            </p>
            <Button
              onClick={openAddDialog}
              variant="outline"
              className="mt-4 border-[#003ABC] text-[#003ABC] hover:bg-[#003ABC]/5"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {providers.map((provider) => (
            <Card key={provider.id} className="border-[#E2E8F0] hover:border-[#CBD5E1] transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#003ABC]/5 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-[#003ABC]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-[#1E293B]">{provider.name}</h4>
                        <Badge
                          variant="outline"
                          className={
                            provider.status === 'active'
                              ? 'border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px]'
                              : 'border-[#CBD5E1] text-[#64748B] bg-[#F8FAFC] text-[10px]'
                          }
                        >
                          {provider.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-1 font-mono">
                        Client ID: {provider.clientId.slice(0, 8)}...{provider.clientId.slice(-4)}
                      </p>
                      {provider.scopes && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {provider.scopes.split(',').map((scope) => (
                            <span
                              key={scope.trim()}
                              className="inline-block bg-[#F1F5F9] text-[#64748B] text-[10px] px-2 py-0.5 rounded-full"
                            >
                              {scope.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[#94A3B8] hover:text-[#003ABC] hover:bg-[#003ABC]/5"
                      onClick={() => openEditDialog(provider)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[#94A3B8] hover:text-red-600 hover:bg-red-50"
                      onClick={() => confirmDelete(provider.id)}
                      disabled={deletingId === provider.id}
                    >
                      {deletingId === provider.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetForm() } }}>
        <DialogContent className="bg-white border-[#E2E8F0] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {editingProvider ? 'Edit OAuth Provider' : 'Add OAuth Provider'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Configure an external OAuth provider for authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Provider Name *</Label>
              <Input
                placeholder="e.g., Google, GitHub, Okta"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Client ID *</Label>
              <Input
                placeholder="Enter client ID"
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Client Secret</Label>
              <Input
                type="password"
                placeholder="Enter client secret"
                value={form.clientSecret}
                onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] font-mono text-sm"
              />
            </div>
            <Separator className="bg-[#E2E8F0]" />
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Authorization URL *</Label>
              <Input
                placeholder="https://your-idp.com/oauth/authorize"
                value={form.authUrl}
                onChange={(e) => setForm((f) => ({ ...f, authUrl: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Token URL *</Label>
              <Input
                placeholder="https://your-idp.com/oauth/token"
                value={form.tokenUrl}
                onChange={(e) => setForm((f) => ({ ...f, tokenUrl: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">User Info URL</Label>
              <Input
                placeholder="https://your-idp.com/oauth/userinfo"
                value={form.userInfoUrl}
                onChange={(e) => setForm((f) => ({ ...f, userInfoUrl: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1E293B]">Scopes</Label>
              <Input
                placeholder="openid, profile, email"
                value={form.scopes}
                onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
                className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
              />
              <p className="text-[10px] text-[#94A3B8]">Comma-separated list of OAuth scopes</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowAddDialog(false); resetForm() }}
              className="border-[#E2E8F0] text-[#64748B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingProvider ? 'Update Provider' : 'Add Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white border-[#E2E8F0]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Delete OAuth Provider?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              This will permanently remove this OAuth provider. Users authenticated through this provider
              may lose access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#64748B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── SSO Tab ─────────────────────────────────────────────────────────────────

function SsoTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SsoConfig>({
    provider: 'saml',
    metadataUrl: '',
    entityId: '',
    callbackUrl: '',
    active: false,
  })
  const [hasConfig, setHasConfig] = useState(false)

  const fetchSsoConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/sso')
      if (res.ok) {
        const data = await res.json()
        const config = data.data || data.config || data
        if (config && config.provider) {
          setForm({
            provider: config.provider || 'saml',
            metadataUrl: config.metadataUrl || '',
            entityId: config.entityId || '',
            callbackUrl: config.callbackUrl || '',
            active: config.active ?? false,
          })
          setHasConfig(true)
        }
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSsoConfig()
  }, [fetchSsoConfig])

  const handleSave = async () => {
    if (!form.metadataUrl || !form.entityId) {
      toast.error('Validation Error', { description: 'Metadata URL and Entity ID are required.' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save SSO configuration')
      }
      setHasConfig(true)
      toast.success('SSO Configuration Saved', { description: 'Single sign-on settings have been updated.'  })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Save Failed', { description: message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 bg-[#F1F5F9]" />
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-[#F1F5F9]" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#1E293B]">Single Sign-On (SSO)</h3>
          <p className="text-xs text-[#64748B] mt-0.5">
            Configure SSO to allow users to authenticate with your identity provider.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            hasConfig && form.active
              ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
              : hasConfig
                ? 'border-amber-200 text-amber-700 bg-amber-50'
                : 'border-[#CBD5E1] text-[#64748B] bg-[#F8FAFC]'
          }
        >
          {hasConfig && form.active ? 'Active' : hasConfig ? 'Inactive' : 'Not Configured'}
        </Badge>
      </div>

      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-[#1E293B] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#003ABC]" />
            SSO Configuration
          </CardTitle>
          <CardDescription>
            Configure your identity provider settings. Changes will take effect after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#1E293B]">Provider Type</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => setForm((f) => ({ ...f, provider: v as SsoConfig['provider'] }))}
            >
              <SelectTrigger className="w-full sm:w-64 border-[#E2E8F0] focus:border-[#003ABC] text-[#1E293B]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E2E8F0]">
                <SelectItem value="saml" className="text-[#1E293B] focus:bg-[#F1F5F9]">
                  SAML 2.0
                </SelectItem>
                <SelectItem value="ldap" className="text-[#1E293B] focus:bg-[#F1F5F9]">
                  LDAP
                </SelectItem>
                <SelectItem value="oidc" className="text-[#1E293B] focus:bg-[#F1F5F9]">
                  OpenID Connect (OIDC)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[#94A3B8]">
              {form.provider === 'saml' && 'Security Assertion Markup Language for enterprise identity providers.'}
              {form.provider === 'ldap' && 'Lightweight Directory Access Protocol for directory-based authentication.'}
              {form.provider === 'oidc' && 'OpenID Connect layer on top of OAuth 2.0 for identity verification.'}
            </p>
          </div>

          <Separator className="bg-[#E2E8F0]" />

          {/* Metadata URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#1E293B]">Metadata URL *</Label>
            <Input
              placeholder="https://your-idp.com/saml/metadata"
              value={form.metadataUrl}
              onChange={(e) => setForm((f) => ({ ...f, metadataUrl: e.target.value }))}
              className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
            />
            <p className="text-[10px] text-[#94A3B8]">
              The URL where your identity provider publishes its metadata document.
            </p>
          </div>

          {/* Entity ID */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#1E293B]">Entity ID *</Label>
            <Input
              placeholder="https://your-app.com/sso/metadata"
              value={form.entityId}
              onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}
              className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
            />
            <p className="text-[10px] text-[#94A3B8]">
              The unique identifier for your service provider (SP).
            </p>
          </div>

          {/* Callback URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#1E293B]">Callback URL</Label>
            <Input
              placeholder="https://your-app.com/api/auth/sso/callback"
              value={form.callbackUrl}
              onChange={(e) => setForm((f) => ({ ...f, callbackUrl: e.target.value }))}
              className="border-[#E2E8F0] focus:border-[#003ABC] text-sm"
            />
            <p className="text-[10px] text-[#94A3B8]">
              The URL where the identity provider will send authentication responses.
            </p>
          </div>

          <Separator className="bg-[#E2E8F0]" />

          {/* Active Toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-sm font-medium text-[#1E293B]">Active</Label>
              <p className="text-[10px] text-[#94A3B8]">
                Enable SSO authentication for all users in the organization.
              </p>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#003ABC] hover:bg-[#002A99] text-white min-w-[140px]"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </div>
    </div>
  )
}