'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
// InputOTP replaced with simple input (input-otp component was unused elsewhere)
import { Loader2, Eye, EyeOff, AlertCircle, Shield, ArrowLeft, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AloLogo } from '@/components/alo-logo'

// ─── Login Step States ────────────────────────────────────────────────────────
type LoginStep = 'credentials' | 'mfa' | 'error'
type AuthMode = 'login' | 'register' | 'forgot'

interface MfaPendingData {
  userId: string
  email: string
  name: string
  role: string
  tempToken: string
}

export default function LoginPage() {
  const login = useAppStore((s) => s.login)
  const { toast } = useToast()

  /**
   * Navigate into the app after a successful credential/MFA exchange.
   *
   * This component used to be rendered *inside* the shell (which swapped views
   * in place), so it never navigated. It is now the /login route, and the
   * dashboard lives at /dashboard, so it has to. `?next=` is honoured only when
   * it is a same-origin absolute path — a protocol-relative `//evil.com` or a
   * full URL would otherwise turn the login form into an open redirect.
   */
  const redirectAfterLogin = useCallback(() => {
    const requested = new URLSearchParams(window.location.search).get('next')
    const safe = requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : '/dashboard'
    window.location.assign(safe)
  }, [])

  // ── Form State ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [resetSent, setResetSent] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  // ── UI State ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<LoginStep>('credentials')
  const [loading, setLoading] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── MFA State ────────────────────────────────────────────────────────────
  const [mfaCode, setMfaCode] = useState('')
  const [mfaData, setMfaData] = useState<MfaPendingData | null>(null)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [mfaCountdown, setMfaCountdown] = useState(0)
  const mfaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Countdown Effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mfaCountdown <= 0) {
      if (mfaTimerRef.current) {
        clearInterval(mfaTimerRef.current)
        mfaTimerRef.current = null
      }
      return
    }
    mfaTimerRef.current = setInterval(() => {
      setMfaCountdown((prev) => {
        if (prev <= 1) {
          if (mfaTimerRef.current) clearInterval(mfaTimerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (mfaTimerRef.current) clearInterval(mfaTimerRef.current)
    }
  }, [mfaCountdown])

  // ── Clear Errors on Input Change ─────────────────────────────────────────
  useEffect(() => {
    if (error) setError(null)
  }, [email, password, name, confirmPassword])

  // ── OAuth Handler ──────────────────────────────────────────────────────
  /**
   * Kick off the OAuth flow: fetch the provider's authorization URL from
   * `/api/auth/oauth/{provider}` (a JSON API), then jump to the EXTERNAL
   * provider. Navigating straight to the API route would only render raw
   * JSON — the button would appear dead. The `?next=` target travels to the
   * server, gets embedded in the single-use state blob, and is sanitized
   * there before any callback redirect; it is never trusted client-side.
   */
  const handleOAuth = useCallback(async (provider: string) => {
    setOauthLoading(provider)
    setError(null)
    try {
      const next = new URLSearchParams(window.location.search).get('next') || ''
      const res = await fetch(`/api/auth/oauth/${encodeURIComponent(provider)}?next=${encodeURIComponent(next)}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload?.authorizationUrl) {
        throw new Error(payload?.error || 'Could not start the sign-in flow. Please try again.')
      }
      window.location.href = payload.authorizationUrl as string
    } catch (err) {
      setOauthLoading(null)
      setError(err instanceof Error ? err.message : 'Could not start the sign-in flow. Please try again.')
    }
  }, [])

  // ── Register Handler ────────────────────────────────────────────────────
  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!name || !email || !password) {
        setError('Please fill in all fields.')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Registration failed.')
        }
        const data = await res.json()
        login(data.user, data.token)
        toast({ title: 'Welcome to ALO Labs!', description: `Account created as ${data.user.name}` })
        redirectAfterLogin()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Registration failed.')
        setStep('error')
      } finally {
        setLoading(false)
      }
    },
    [name, email, password, confirmPassword, login, toast, redirectAfterLogin]
  )

  // ── Forgot Password Handler ──────────────────────────────────────────────
  const handleForgotPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email) { setError('Please enter your email.'); return }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/auth/password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) throw new Error('Reset request failed.')
        setResetSent(true)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Reset failed.')
      } finally {
        setLoading(false)
      }
    },
    [email]
  )

  // ── Submit Handler (Login) ───────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email || !password) {
        setError('Please enter both email and password.')
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Authenticate via API
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, rememberMe }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Login failed. Please try again.')
        }

        const data = await res.json()

        // Check if MFA is required
        if (data.mfaPending) {
          setMfaData({
            userId: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            tempToken: data.tempToken,
          })
          setMfaCode('')
          setMfaError(null)
          setMfaCountdown(60)
          setStep('mfa')
          return
        }

        // Direct login success
        login(data.user, data.token)
        toast({
          title: 'Welcome back!',
          description: `Logged in as ${data.user.name}`,
        })
        redirectAfterLogin()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
        setError(message)
        setStep('error')
      } finally {
        setLoading(false)
      }
    },
    [email, password, rememberMe, login, toast, redirectAfterLogin]
  )

  // ── MFA Verification Handler ─────────────────────────────────────────────
  const handleMfaVerify = useCallback(async () => {
    if (!mfaCode || mfaCode.length < 6) {
      setMfaError('Please enter the full 6-digit code.')
      return
    }
    if (!mfaData) return

    setMfaLoading(true)
    setMfaError(null)

    try {
      // Verify MFA code via API
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: mfaData.userId,
          tempToken: mfaData.tempToken,
          code: mfaCode,
          context: 'login',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'MFA verification failed.')
      }

      const data = await res.json()
      login(data.user, data.token)
      toast({
        title: 'Welcome back!',
        description: `Logged in as ${data.user.name}`,
      })
      redirectAfterLogin()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed.'
      setMfaError(message)
    } finally {
      setMfaLoading(false)
    }
  }, [mfaCode, mfaData, login, toast, redirectAfterLogin])

  // ── Back to Login from MFA ───────────────────────────────────────────────
  const handleBackToLogin = useCallback(() => {
    setStep('credentials')
    setMfaData(null)
    setMfaCode('')
    setMfaError(null)
    if (mfaTimerRef.current) clearInterval(mfaTimerRef.current)
    setMfaCountdown(0)
  }, [])

  // ── Resend MFA Code ──────────────────────────────────────────────────────
  const handleResendMfa = useCallback(async () => {
    if (mfaCountdown > 0 || !mfaData) return

    try {
      const res = await fetch('/api/auth/mfa/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: mfaData.userId, tempToken: mfaData.tempToken }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to resend code.')
      }

      setMfaCountdown(60)
      toast({ title: 'Code resent', description: 'A new code has been sent.' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend.'
      setMfaError(message)
    }
  }, [mfaCountdown, mfaData, toast])

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4 relative overflow-hidden">
      {/* ── Background Subtle Gradient ──────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#F8FAFC] via-white to-[#EFF6FF] -z-10" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#003ABC]/[0.03] to-transparent rounded-full -z-10 translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-[#FF6A00]/[0.03] to-transparent rounded-full -z-10 -translate-x-1/3 translate-y-1/3" />

      {/* ── Main Card ──────────────────────────────────────────────────────── */}
      <Card className="w-full max-w-md shadow-lg border-[#E2E8F0]/80 bg-white">
        <CardHeader className="text-center pb-2 pt-8 px-8">
          {/* Logo */}
          <div className="mx-auto mb-4">
            <AloLogo size={56} />
          </div>

          {/* Branding */}
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">
            <span className="text-[#FF6A00]">ALO Labs</span>{' '}
            <span className="text-[#003ABC]">AgentOS</span>
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">AI Agent Operating System</p>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          {/* ═══════ CREDENTIALS STEP ═══════ */}
          {step === 'credentials' && mode === 'login' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-[#1E293B]">Sign in to your account</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Enter your credentials to access the platform
                </p>
              </div>

              {/* OAuth Buttons */}
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleOAuth('google')}
                    disabled={!!oauthLoading}
                    className="flex items-center justify-center gap-2 h-10 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#1E293B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                  >
                    {oauthLoading === 'google' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('github')}
                    disabled={!!oauthLoading}
                    className="flex items-center justify-center gap-2 h-10 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#1E293B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                  >
                    {oauthLoading === 'github' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                      </svg>
                    )}
                    GitHub
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E2E8F0]"/></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-[#94A3B8]">or continue with email</span></div>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium text-[#1E293B]">
                    Email
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]"
                    disabled={loading}
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-sm font-medium text-[#1E293B]">
                      Password
                    </Label>
                    <button
                      type="button"
                      className="text-xs font-medium text-[#003ABC] hover:text-[#002A8F] transition-colors"
                      onClick={() => { setMode('forgot'); setError(null); setResetSent(false) }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-10 pr-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    className="border-[#E2E8F0] data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC]"
                  />
                  <Label
                    htmlFor="remember-me"
                    className="text-sm text-[#64748B] cursor-pointer select-none"
                  >
                    Remember me for 30 days
                  </Label>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full h-10 bg-[#003ABC] hover:bg-[#002A8F] text-white font-medium rounded-lg transition-colors"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              {/* Sign up link */}
              <p className="mt-6 text-center text-sm text-[#64748B]">
                Don't have an account?{' '}
                <button
                  type="button"
                  className="font-semibold text-[#003ABC] hover:text-[#002A8F] transition-colors"
                  onClick={() => { setMode('register'); setError(null); setStep('credentials') }}
                >
                  Create one
                </button>
              </p>

              {/* Footer */}
              <p className="mt-4 text-center text-xs text-[#94A3B8]">
                &copy; {new Date().getFullYear()} ALO Labs, Inc. All rights reserved.
              </p>
            </>
          )}

          {/* ═══════ REGISTER MODE ═══════ */}
          {step === 'credentials' && mode === 'register' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-[#1E293B]">Create your account</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Get started with ALO Labs AgentOS — free to explore
                </p>
              </div>

              {/* OAuth Buttons (same as login) */}
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => handleOAuth('google')} disabled={!!oauthLoading} className="flex items-center justify-center gap-2 h-10 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#1E293B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50">
                    {oauthLoading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    Google
                  </button>
                  <button type="button" onClick={() => handleOAuth('github')} disabled={!!oauthLoading} className="flex items-center justify-center gap-2 h-10 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#1E293B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50">
                    {oauthLoading === 'github' ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                      </svg>
                    )}
                    GitHub
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E2E8F0]"/></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-[#94A3B8]">or sign up with email</span></div>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name" className="text-sm font-medium text-[#1E293B]">Full name</Label>
                  <Input id="reg-name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]" disabled={loading} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email" className="text-sm font-medium text-[#1E293B]">Email</Label>
                  <Input id="reg-email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]" disabled={loading} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password" className="text-sm font-medium text-[#1E293B]">Password</Label>
                  <Input id="reg-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]" disabled={loading} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm" className="text-sm font-medium text-[#1E293B]">Confirm password</Label>
                  <Input id="reg-confirm" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]" disabled={loading} />
                </div>
                <Button type="submit" className="w-full h-10 bg-[#003ABC] hover:bg-[#002A8F] text-white font-medium rounded-lg transition-colors" disabled={loading}>
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</>) : 'Create account'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-[#64748B]">
                Already have an account?{' '}
                <button type="button" className="font-semibold text-[#003ABC] hover:text-[#002A8F] transition-colors" onClick={() => { setMode('login'); setError(null); setStep('credentials') }}>
                  Sign in
                </button>
              </p>
              <p className="mt-4 text-center text-xs text-[#94A3B8]">
                &copy; {new Date().getFullYear()} ALO Labs, Inc. All rights reserved.
              </p>
            </>
          )}

          {/* ═══════ FORGOT PASSWORD MODE ═══════ */}
          {step === 'credentials' && mode === 'forgot' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-[#1E293B]">Reset your password</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Enter your email and we'll send you a reset link
                </p>
              </div>

              {resetSent ? (
                <div className="text-center py-8">
                  <div className="mx-auto w-12 h-12 rounded-full bg-[#003ABC]/10 flex items-center justify-center mb-4">
                    <Mail className="h-6 w-6 text-[#003ABC]" />
                  </div>
                  <p className="text-sm text-[#64748B]">
                    If an account exists for <span className="font-medium text-[#1E293B]">{email}</span>,
                    a reset link has been sent. Check your inbox.
                  </p>
                  <button type="button" className="mt-6 text-sm font-medium text-[#003ABC] hover:text-[#002A8F] transition-colors" onClick={() => { setMode('login'); setResetSent(false); setError(null) }}>
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  {error && (
                    <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50 text-red-700">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
                    </Alert>
                  )}
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email" className="text-sm font-medium text-[#1E293B]">Email</Label>
                      <Input id="forgot-email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]" disabled={loading} />
                    </div>
                    <Button type="submit" className="w-full h-10 bg-[#003ABC] hover:bg-[#002A8F] text-white font-medium rounded-lg transition-colors" disabled={loading}>
                      {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : 'Send reset link'}
                    </Button>
                  </form>
                  <p className="mt-6 text-center text-sm text-[#64748B]">
                    <button type="button" className="font-semibold text-[#003ABC] hover:text-[#002A8F] transition-colors" onClick={() => { setMode('login'); setError(null) }}>
                      Back to sign in
                    </button>
                  </p>
                </>
              )}
            </>
          )}

          {/* ═══════ MFA VERIFICATION STEP ═══════ */}
          {step === 'mfa' && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#003ABC]/10 flex items-center justify-center mb-3">
                  <Shield className="h-6 w-6 text-[#003ABC]" />
                </div>
                <h2 className="text-lg font-semibold text-[#1E293B]">Two-Factor Authentication</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Enter the 6-digit code from your authenticator app
                </p>
                {mfaData && (
                  <p className="text-xs text-[#94A3B8] mt-2">
                    Verifying as <span className="font-medium text-[#1E293B]">{mfaData.email}</span>
                  </p>
                )}
              </div>

              {/* MFA Error */}
              {mfaError && (
                <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-sm text-red-700">{mfaError}</AlertDescription>
                </Alert>
              )}

              {/* TOTP Code Input */}
              <div className="space-y-6">
                <div className="flex justify-center">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000 000"
                    value={mfaCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setMfaCode(val)
                      if (mfaError) setMfaError(null)
                    }}
                    disabled={mfaLoading}
                    className="h-12 w-48 text-center text-xl font-semibold tracking-[0.5em] border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B]"
                    autoFocus
                  />
                </div>

                {/* Verify Button */}
                <Button
                  type="button"
                  onClick={handleMfaVerify}
                  className="w-full h-10 bg-[#003ABC] hover:bg-[#002A8F] text-white font-medium rounded-lg transition-colors"
                  disabled={mfaLoading || mfaCode.length < 6}
                >
                  {mfaLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Code'
                  )}
                </Button>

                {/* Resend + Back */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#1E293B] transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to login
                  </button>
                  <button
                    type="button"
                    onClick={handleResendMfa}
                    disabled={mfaCountdown > 0}
                    className="text-sm font-medium text-[#003ABC] hover:text-[#002A8F] disabled:text-[#94A3B8] disabled:cursor-not-allowed transition-colors"
                  >
                    {mfaCountdown > 0
                      ? `Resend in ${mfaCountdown}s`
                      : 'Resend code'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══════ ERROR STATE (retry) ═══════ */}
          {step === 'error' && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <h2 className="text-lg font-semibold text-[#1E293B]">Sign In Failed</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  We couldn&apos;t sign you in. Please check your credentials and try again.
                </p>
              </div>

              {/* Error Details */}
              {error && (
                <Alert variant="destructive" className="mb-6 border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                onClick={() => {
                  setStep('credentials')
                  setError(null)
                }}
                className="w-full h-10 bg-[#003ABC] hover:bg-[#002A8F] text-white font-medium rounded-lg transition-colors"
              >
                Try Again
              </Button>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    toast({
                      title: 'Support',
                      description: 'Please contact your administrator for assistance.',
                    })
                  }}
                  className="text-sm text-[#64748B] hover:text-[#003ABC] transition-colors"
                >
                  Need help? Contact support
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}