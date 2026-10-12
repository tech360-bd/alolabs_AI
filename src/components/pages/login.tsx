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
import { Loader2, Eye, EyeOff, AlertCircle, Shield, ArrowLeft } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AloLogo } from '@/components/alo-logo'

// ─── Login Step States ────────────────────────────────────────────────────────
type LoginStep = 'credentials' | 'mfa' | 'error'

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

  // ── Form State ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
  }, [email, password])

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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
        setError(message)
        setStep('error')
      } finally {
        setLoading(false)
      }
    },
    [email, password, rememberMe, login, toast]
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed.'
      setMfaError(message)
    } finally {
      setMfaLoading(false)
    }
  }, [mfaCode, mfaData, login, toast])

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
          {step === 'credentials' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-[#1E293B]">Sign in to your account</h2>
                <p className="text-sm text-[#64748B] mt-1">
                  Enter your credentials to access the platform
                </p>
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
                      onClick={() => {
                        toast({
                          title: 'Password Reset',
                          description: 'Password reset functionality is available through your system administrator.',
                        })
                      }}
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

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-[#94A3B8]">
                &copy; {new Date().getFullYear()} ALO Labs, Inc. All rights reserved.
              </p>
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