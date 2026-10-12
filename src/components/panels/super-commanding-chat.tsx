'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Send, Crown, Radio, Loader2, Check, CheckCheck,
  Users, Zap, Shield, BarChart3, ArrowRightLeft, Trash2, Sparkles,
  MessageSquare, Target, Building2, Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ChatMessage {
  id: string
  role: 'user' | 'ai' | 'agent'
  content: string
  timestamp: string
  agentName?: string
  agentId?: string
  agentDept?: string
  status?: 'sending' | 'sent' | 'delivered' | 'read'
}

interface AgentResponse {
  agentId: string
  name: string
  department: string
  status: string
  message: string
}

interface Company {
  id: string
  name: string
  slug: string
  crmConnected: boolean
}

const QUICK_MESSAGES = [
  { label: 'Status Report', msg: 'Give me a full system status report', icon: BarChart3 },
  { label: 'Score Leads', msg: 'Score all pending leads for all companies', icon: Target },
  { label: 'Sync All CRMs', msg: 'Sync all CRM data from all connected companies now', icon: ArrowRightLeft },
  { label: 'Security Check', msg: 'Run a full security scan across all systems', icon: Shield },
  { label: 'Dispatch Agents', msg: 'Dispatch 50 agents to all CRMs for lead scoring and follow-up', icon: Users },
  { label: 'Revenue Report', msg: 'Generate a revenue prediction report for this month', icon: Zap },
]

const AGENT_COLORS = [
  'text-[#FF6A00]', 'text-[#003ABC]', 'text-[#16A34A]', 'text-[#D97706]',
  'text-[#7C3AED]', 'text-[#0077FF]', 'text-[#EF4444]', 'text-[#1E293B]',
]

const AGENT_BG_COLORS = [
  'bg-[#FF6A00]/10', 'bg-[#003ABC]/10', 'bg-[#22C55E]/10', 'bg-[#F59E0B]/10',
  'bg-[#7C3AED]/10', 'bg-[#0077FF]/10', 'bg-[#EF4444]/10', 'bg-[#F1F5F9]',
]

export default function SuperCommandingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [targetCompany, setTargetCompany] = useState<string>('__all__')
  const [broadcast, setBroadcast] = useState(false)
  const [showQuickMsgs, setShowQuickMsgs] = useState(true)
  const [msgIdCounter, setMsgIdCounter] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((res) => {
        const list = (res.data || []).map((c: { id: string; name: string; slug: string; webCrmConnected: boolean }) => ({
          id: c.id, name: c.name, slug: c.slug, crmConnected: c.webCrmConnected,
        }))
        setCompanies(list)
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newMsg: ChatMessage = {
      ...msg,
      id,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    }
    setMessages((prev) => [...prev, newMsg])
    setMsgIdCounter((c) => c + 1)
    return id
  }, [])

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return
    const msgText = text.trim()
    setInput('')
    setShowQuickMsgs(false)
    setSending(true)

    const userMsgId = addMessage({ role: 'user', content: msgText, status: 'sending' })

    setTimeout(() => {
      setMessages((prev) => prev.map((m) => m.id === userMsgId ? { ...m, status: 'sent' as const } : m))
    }, 300)

    try {
      const res = await fetch('/api/super-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          sessionId: 'super-admin-chat',
          targetCompany: targetCompany === '__all__' ? null : targetCompany,
          broadcast,
        }),
      })

      const json = await res.json()

      setMessages((prev) => prev.map((m) => m.id === userMsgId ? { ...m, status: 'delivered' as const } : m))

      if (json.success) {
        addMessage({
          role: 'ai',
          content: json.response,
          status: 'read',
        })

        const agents: AgentResponse[] = json.agents || []
        agents.forEach((agent, i) => {
          setTimeout(() => {
            addMessage({
              role: 'agent',
              content: agent.message,
              agentName: agent.name,
              agentId: agent.agentId,
              agentDept: agent.department,
              status: 'read',
            })
          }, (i + 1) * 600)
        })

        setTimeout(() => {
          setMessages((prev) => prev.map((m) => m.id === userMsgId ? { ...m, status: 'read' as const } : m))
        }, 500)
      } else {
        addMessage({ role: 'ai', content: `⚠ Error: ${json.error || 'Failed to process'}`, status: 'read' })
      }
    } catch {
      addMessage({ role: 'ai', content: '⚠ Network error. Please try again.', status: 'read' })
    }

    setSending(false)
    inputRef.current?.focus()
  }

  const clearChat = async () => {
    setMessages([])
    try {
      await fetch('/api/super-chat?sessionId=super-admin-chat', { method: 'DELETE' })
    } catch { /* ignore */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending': return <Loader2 className="w-3 h-3 text-[#94A3B8] animate-spin" />
      case 'sent': return <Check className="w-3 h-3 text-[#94A3B8]" />
      case 'delivered': return <CheckCheck className="w-3 h-3 text-[#0077FF]" />
      case 'read': return <CheckCheck className="w-3 h-3 text-[#16A34A]" />
      default: return null
    }
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b border-[#E2E8F0] bg-white">
          <Skeleton className="h-6 w-48 bg-[#F1F5F9]" />
        </div>
        <div className="flex-1 p-4 space-y-3 bg-[#F8FAFC]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-16 rounded-2xl bg-[#F1F5F9] ${i % 2 === 0 ? 'ml-auto w-3/4' : 'w-2/3'}`} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex-shrink-0 border-b border-[#E2E8F0] bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF6A00]/20 to-[#003ABC]/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-[#FF6A00]" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#22C55E] rounded-full border-2 border-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1E293B]">Super Commanding Center</h2>
              <div className="flex items-center gap-1.5">
                <span className="status-dot status-dot-active alo-pulse" style={{ width: 6, height: 6 }} />
                <span className="text-[11px] text-[#94A3B8]">2000 agents online · 5 CRMs connected</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Target selector */}
            <Select value={targetCompany} onValueChange={setTargetCompany}>
              <SelectTrigger className="w-[150px] h-7 text-[11px] bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                <Building2 className="w-3 h-3 mr-1 text-[#94A3B8]" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                <SelectItem value="__all__" className="text-[#1E293B] text-xs">All Companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.slug} value={c.slug} className="text-xs text-[#1E293B]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.crmConnected ? 'bg-[#22C55E]' : 'bg-[#CBD5E1]'}`} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Broadcast toggle */}
            <Button
              variant={broadcast ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-[11px] gap-1 rounded-lg ${broadcast ? 'bg-[#FF6A00] text-white border-[#FF6A00]' : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]'}`}
              onClick={() => setBroadcast(!broadcast)}
            >
              <Radio className="w-3 h-3" />
              <span className="hidden sm:inline">Broadcast</span>
            </Button>

            {/* Clear */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#94A3B8] hover:text-[#EF4444] rounded-lg"
              onClick={clearChat}
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6A00]/10 to-[#003ABC]/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-[#003ABC]" />
            </div>
            <h3 className="text-lg font-bold text-[#1E293B] mb-1">Command Your AI Workforce</h3>
            <p className="text-sm text-[#64748B] max-w-md">
              Send SMS-style commands to your 2000 AI agents. They will respond with real-time status updates and work results.
            </p>
            <div className="flex items-center gap-4 mt-4 text-xs text-[#94A3B8]">
              <span className="flex items-center gap-1"><Bot className="w-3.5 h-3.5 text-[#FF6A00]" /> 2000 Agents</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-[#003ABC]" /> 63 Workflows</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-[#22C55E]" /> Protected</span>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user'
          const isAgent = msg.role === 'agent'
          const colorIdx = idx % AGENT_COLORS.length

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2 max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
              {/* Agent avatar */}
              {!isUser && (
                <Avatar className="w-8 h-8 flex-shrink-0 mt-1 border border-[#E2E8F0]">
                  <AvatarFallback className={`text-[10px] font-bold rounded-lg ${isAgent ? `${AGENT_BG_COLORS[colorIdx]} ${AGENT_COLORS[colorIdx]}` : 'bg-[#003ABC]/10 text-[#003ABC]'}`}>
                    {isAgent ? (msg.agentId || 'AG').slice(-3) : 'HUB'}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Agent name */}
                {isAgent && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold text-[#003ABC]">{msg.agentName}</span>
                    <span className="text-[9px] text-[#94A3B8]">{msg.agentDept}</span>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed max-w-full ${
                    isUser
                      ? 'bg-[#FF6A00] text-white rounded-br-md'
                      : isAgent
                        ? 'bg-[#F1F5F9] text-[#1E293B] rounded-bl-md border border-[#E2E8F0]'
                        : 'bg-[#003ABC]/5 text-[#1E293B] rounded-bl-md border border-[#003ABC]/15'
                  }`}
                >
                  {/* AI response with markdown-like rendering */}
                  {!isUser && !isAgent && msg.content.includes('#') ? (
                    <div className="space-y-2">
                      {msg.content.split('\n').map((line, i) => {
                        if (line.startsWith('## ')) return <h4 key={i} className="text-sm font-bold text-[#003ABC]">{line.slice(3)}</h4>
                        if (line.startsWith('# ')) return <h3 key={i} className="text-base font-bold text-[#003ABC]">{line.slice(2)}</h3>
                        if (line.startsWith('- ')) return <p key={i} className="text-xs text-[#64748B] ml-2">• {line.slice(2)}</p>
                        if (line.trim() === '') return <div key={i} className="h-1" />
                        return <p key={i} className="text-xs text-[#1E293B]">{line}</p>
                      })}
                    </div>
                  ) : (
                    <p className={`text-[13px] whitespace-pre-wrap break-words ${isUser ? 'text-white' : 'text-[#1E293B]'}`}>{msg.content}</p>
                  )}
                </div>

                {/* Timestamp + Status */}
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  <span className="text-[10px] text-[#94A3B8]">{msg.timestamp}</span>
                  {isUser && getStatusIcon(msg.status)}
                  {isAgent && (
                    <Badge className="text-[8px] py-0 px-1 bg-[#003ABC]/10 text-[#003ABC] border-0 rounded">{msg.agentId}</Badge>
                  )}
                </div>
              </div>

              {/* User avatar */}
              {isUser && (
                <Avatar className="w-8 h-8 flex-shrink-0 mt-1 border-2 border-[#E2E8F0]">
                  <AvatarFallback className="bg-[#FF6A00] text-white text-[10px] font-bold rounded-lg">SA</AvatarFallback>
                </Avatar>
              )}
            </div>
          )
        })}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start gap-2 max-w-[85%]">
            <Avatar className="w-8 h-8 flex-shrink-0 border border-[#E2E8F0]">
              <AvatarFallback className="text-[10px] font-bold bg-[#003ABC]/10 text-[#003ABC] rounded-lg">HUB</AvatarFallback>
            </Avatar>
            <div className="bg-[#F1F5F9] px-4 py-3 rounded-2xl rounded-bl-md border border-[#E2E8F0]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF6A00] animate-pulse" />
                <span className="text-xs text-[#64748B]">2000 agents processing...</span>
                <Loader2 className="w-3 h-3 text-[#FF6A00] animate-spin" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Messages */}
      {showQuickMsgs && messages.length === 0 && (
        <div className="flex-shrink-0 border-t border-[#E2E8F0] px-4 py-2 bg-white">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {QUICK_MESSAGES.map((qm) => {
              const Icon = qm.icon
              return (
                <Button
                  key={qm.label}
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 h-8 text-[11px] gap-1.5 border-[#E2E8F0] text-[#64748B] hover:text-[#FF6A00] hover:bg-[#FF6A00]/5 hover:border-[#FF6A00]/30 whitespace-nowrap rounded-lg"
                  onClick={() => sendMessage(qm.msg)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {qm.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-[#E2E8F0] bg-white p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={broadcast ? "Broadcast to all 2000 agents..." : "Command your agents..."}
              disabled={sending}
              className="w-full h-11 bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] text-sm rounded-xl pl-4 pr-12 placeholder:text-[#94A3B8] focus:border-[#FF6A00]/40 focus:ring-[#FF6A00]/10"
            />
            {broadcast && (
              <Badge className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#FF6A00]/10 text-[#FF6A00] text-[9px] py-0 border-0 rounded">
                <Radio className="w-2.5 h-2.5 mr-0.5" /> BROADCAST
              </Badge>
            )}
          </div>
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            className="h-11 w-11 rounded-xl bg-[#FF6A00] text-white hover:bg-[#E5600A] border-0 flex-shrink-0"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-[#94A3B8]">
            {broadcast ? '📢 Broadcasting to all 2000 agents' : `🎯 Target: ${targetCompany === '__all__' ? 'All Companies' : companies.find(c => c.slug === targetCompany)?.name || 'All'}`}
          </span>
          <span className="text-[10px] text-[#94A3B8]">
            Press Enter to send
          </span>
        </div>
      </div>
    </div>
  )
}