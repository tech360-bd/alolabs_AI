'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Send, Bot, Brain, Activity, MessageSquare, Clock, Zap, Users,
  ChevronRight, RotateCcw, Trash2, Sparkles, Target, ArrowRight,
  Loader2, AlertCircle, CheckCircle2, Server, Hash, PlusCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrchestratorStats {
  totalAgents: number
  activeAgents: number
  totalConversations: number
  totalMessages: number
  totalExecutions: number
}

interface RecentRun {
  id: string
  agentName: string
  model: string
  tokensUsed: number
  latencyMs: number
  confidence: number
  contextSources: string
  createdAt: string
}

interface RoutingSelected {
  agentId: string
  agentName: string
  departmentName: string
  role: string
  score: number
}

interface RoutingAlternative {
  agentId: string
  agentName: string
  departmentName: string
  score: number
}

interface RoutingInfo {
  selectedAgent: RoutingSelected
  alternatives: RoutingAlternative[]
  reasoning: string
  routingTimeMs: number
  task?: string
  totalCandidates?: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'orchestrator' | 'system'
  content: string
  agentName?: string
  model?: string
  confidence?: number
  latencyMs?: number
  contextSources?: string
  tokensUsed?: number
  routing?: RoutingInfo
  createdAt?: string
}

interface ConversationItem {
  id: string
  title: string
  agentId?: string
  agentName?: string
  status?: string
  createdAt: string
  updatedAt: string
  lastMessage?: { role: string; content: string } | null
  messageCount?: number
}

interface ExecuteResponse {
  content: string
  confidence: number
  model: string
  latencyMs: number
  contextTokens: number
  contextSources: string
  routing: RoutingInfo
  conversationId: string
  messageId: string
  memoryStored: boolean
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-emerald-600 dark:text-emerald-400'
  if (confidence >= 0.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
  if (confidence >= 0.5) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
  return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
}

// ─── Loading Skeletons ─────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityFeedSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stats Bar ───────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: OrchestratorStats | null }) {
  const items = stats
    ? [
        { icon: Users, label: 'Total Agents', value: stats.totalAgents, color: 'bg-[#003ABC]' },
        { icon: MessageSquare, label: 'Active Conversations', value: stats.totalConversations, color: 'bg-[#FF6A00]' },
        { icon: Zap, label: 'Total Executions', value: stats.totalExecutions, color: 'bg-emerald-600' },
        { icon: MessageSquare, label: 'Messages', value: stats.totalMessages, color: 'bg-purple-600' },
      ]
    : []

  if (!stats) return <StatsSkeleton />

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <TooltipProvider key={item.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3 transition-colors hover:border-slate-300 dark:hover:border-slate-600">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                      {item.value.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.label}</p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{item.label}: {item.value.toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
    </div>
  )
}

// ─── Routing Card ────────────────────────────────────────────────────────────

function RoutingCard({ routing }: { routing: RoutingInfo }) {
  return (
    <div className="mb-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-3 transition-all duration-300">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-4 w-4 text-[#FF6A00]" />
        <span className="text-xs font-semibold text-[#FF6A00] uppercase tracking-wider">Orchestrator Routing</span>
        <Badge variant="secondary" className="ml-auto text-[10px] font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {routing.routingTimeMs}ms
        </Badge>
      </div>

      {/* Selected Agent */}
      <div className="flex items-center gap-3 mb-2.5">
        <Avatar className="h-9 w-9 border-2 border-[#FF6A00]/30">
          <AvatarFallback className="bg-[#FF6A00] text-white text-xs font-bold">
            {routing.selectedAgent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {routing.selectedAgent.agentName}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {routing.selectedAgent.departmentName} · {routing.selectedAgent.role}
          </p>
        </div>
        <Badge className="text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {(routing.selectedAgent.score * 100).toFixed(0)}% match
        </Badge>
      </div>

      {/* Alternatives */}
      {routing.alternatives.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Also considered:</span>
          {routing.alternatives.map((alt) => (
            <Badge key={alt.agentId} variant="outline" className="text-[10px] border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400">
              {alt.agentName}
              <span className="ml-1 text-slate-400 dark:text-slate-500">{(alt.score * 100).toFixed(0)}%</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
        &quot;{routing.reasoning}&quot;
      </p>
    </div>
  )
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-1.5">
          <Activity className="h-3 w-3 text-slate-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400">{message.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <Avatar className={`h-8 w-8 shrink-0 mt-0.5 ${isUser ? '' : 'border border-slate-200 dark:border-slate-700'}`}>
        <AvatarFallback className={
          isUser
            ? 'bg-[#003ABC] text-white text-xs font-bold'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold'
        }>
          {isUser ? 'U' : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className={`flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : ''}`}>
        {/* Name + timestamp */}
        <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {isUser ? 'You' : (message.agentName || 'AI Agent')}
          </span>
          {message.createdAt && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Message bubble */}
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#003ABC] text-white rounded-tr-sm'
            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm'
        }`}>
          {message.content.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>

        {/* Agent metadata */}
        {!isUser && message.model && (
          <div className={`flex items-center gap-2 flex-wrap ${isUser ? 'flex-row-reverse' : ''}`}>
            {message.model && (
              <Badge variant="outline" className="text-[10px] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <Hash className="h-2.5 w-2.5 mr-0.5" />
                {message.model}
              </Badge>
            )}
            {message.confidence !== undefined && (
              <Badge variant="outline" className={`text-[10px] ${confidenceBg(message.confidence)} border`}>
                {confidenceColor(message.confidence).replace('text-', '').includes('emerald') && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 text-emerald-500" />}
                {(message.confidence * 100).toFixed(0)}% conf
              </Badge>
            )}
            {message.latencyMs !== undefined && (
              <Badge variant="outline" className="text-[10px] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                {message.latencyMs}ms
              </Badge>
            )}
            {message.tokensUsed !== undefined && message.tokensUsed > 0 && (
              <Badge variant="outline" className="text-[10px] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                {message.tokensUsed.toLocaleString()} tokens
              </Badge>
            )}
            {message.contextSources && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-default">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                      {message.contextSources}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Context source: {message.contextSources}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700">
        <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-xs font-bold">
          <Brain className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Orchestrator</span>
        <div className="rounded-xl rounded-tl-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
            <span className="animate-pulse">Routing your task to the best AI employee...</span>
          </div>
          <div className="mt-2 flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#003ABC] animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-1.5 w-1.5 rounded-full bg-[#003ABC] animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-1.5 w-1.5 rounded-full bg-[#003ABC] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── System Pulse ─────────────────────────────────────────────────────────────

function SystemPulse() {
  const systems = [
    { name: 'Orchestrator', icon: Brain, status: 'active' as const },
    { name: 'Agent Runtime', icon: Bot, status: 'active' as const },
    { name: 'AI Router', icon: Zap, status: 'active' as const },
    { name: 'Memory System', icon: Server, status: 'active' as const },
  ]

  return (
    <div className="space-y-2 p-4">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
        <Activity className="h-3.5 w-3.5" />
        System Pulse
      </h3>
      <div className="space-y-1.5">
        {systems.map((sys) => {
          const Icon = sys.icon
          return (
            <div
              key={sys.name}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors bg-emerald-50/50 dark:bg-emerald-950/10"
            >
              <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-xs text-slate-600 dark:text-slate-400 flex-1">{sys.name}</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ runs, loading }: { runs: RecentRun[] | null; loading: boolean }) {
  if (loading) return <ActivityFeedSkeleton />
  if (!runs || runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <Activity className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Agent executions will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-4">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3 transition-colors hover:border-slate-300 dark:hover:border-slate-600"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#003ABC]/10 dark:bg-[#003ABC]/20">
            <Bot className="h-4 w-4 text-[#003ABC]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {run.agentName}
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shrink-0">
                {run.model}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {run.latencyMs}ms
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className={confidenceColor(run.confidence)}>
                {(run.confidence * 100).toFixed(0)}%
              </span>
              {run.tokensUsed > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{run.tokensUsed.toLocaleString()} tok</span>
                </>
              )}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">
            {timeAgo(run.createdAt)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Conversation List ────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
}: {
  conversations: ConversationItem[] | null
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
}) {
  if (loading) return <ConversationsSkeleton />
  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">No conversations yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Start a task to begin</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-2">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={`w-full flex items-start gap-2.5 rounded-lg p-3 text-left transition-all duration-150 ${
            activeId === conv.id
              ? 'bg-[#003ABC]/8 dark:bg-[#003ABC]/15 border border-[#003ABC]/20 dark:border-[#003ABC]/30'
              : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mt-0.5">
            <MessageSquare className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate leading-tight">
              {conv.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {conv.agentName && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{conv.agentName}</span>
              )}
              <span className="text-[10px] text-slate-400 dark:text-slate-500">·</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(conv.updatedAt)}</span>
            </div>
            {conv.lastMessage && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 leading-tight">
                {conv.lastMessage.role === 'user' ? 'You: ' : ''}{conv.lastMessage.content.slice(0, 60)}
              </p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0 mt-1" />
        </button>
      ))}
    </div>
  )
}

// ─── Error Display ───────────────────────────────────────────────────────────

function ErrorDisplay({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 my-2">
      <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/30">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry
        </Button>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface AgentCommandCenterProps {
  onNavigate?: (view: any) => void
}

export default function AgentCommandCenter({ onNavigate }: AgentCommandCenterProps) {
  // ── State ──
  const [stats, setStats] = useState<OrchestratorStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<RecentRun[] | null>(null)
  const [conversations, setConversations] = useState<ConversationItem[] | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Fetch initial data ──
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statsRes, convsRes] = await Promise.allSettled([
        fetchApi('/api/enterprise/orchestrator'),
        fetchApi('/api/enterprise/conversations'),
      ])

      // Stats + runs
      if (statsRes.status === 'fulfilled') {
        const statsJson = statsRes.value
        if (statsJson.success) {
          setStats(statsJson.data.stats)
          setRecentRuns(statsJson.data.recentRuns)
        }
      }

      // Conversations
      if (convsRes.status === 'fulfilled') {
        const convsJson = convsRes.value
        if (convsJson.success) {
          setConversations(convsJson.data)
        }
      }
    } catch (err) {
      console.error('[AgentCommandCenter] Failed to fetch initial data:', err)
      setError('Failed to load data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  // ── Refresh runs periodically ──
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const json = await fetchApi('/api/enterprise/orchestrator')
        if (json.success) {
          setStats(json.data.stats)
          setRecentRuns(json.data.recentRuns)
        }
      } catch {
        // silent fail for background refresh
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const task = inputValue.trim()
    if (!task || isSending) return

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: task,
      createdAt: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsSending(true)
    setError(null)

    try {
      const json = await fetchApi('/api/enterprise/orchestrator', {
        method: 'POST',
        body: JSON.stringify({
          task,
          conversationId: currentConversationId || undefined,
        }),
      })

      if (!json.success) {
        throw new Error(json.error || 'Unknown error')
      }

      const data: ExecuteResponse = json.data

      // Update conversation ID for multi-turn
      setCurrentConversationId(data.conversationId)

      // Build agent message
      const agentMessage: ChatMessage = {
        id: data.messageId || `agent_${Date.now()}`,
        role: 'agent',
        content: data.content,
        agentName: data.routing.selectedAgent.agentName,
        model: data.model,
        confidence: data.confidence,
        latencyMs: data.latencyMs,
        contextSources: data.contextSources || undefined,
        tokensUsed: data.contextTokens,
        routing: data.routing,
        createdAt: new Date().toISOString(),
      }

      setMessages(prev => [...prev, agentMessage])

      // Refresh conversations list
      try {
        const convsJson = await fetchApi('/api/enterprise/conversations')
        if (convsJson.success) {
          setConversations(convsJson.data)
        }
      } catch {
        // non-critical
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      // Remove the user message that was optimistically added, since it failed
      setMessages(prev => prev.filter(m => m.id !== userMessage.id))
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, isSending, currentConversationId])

  // ── Load conversation ──
  const handleLoadConversation = useCallback(async (convId: string) => {
    setError(null)
    try {
      const json = await fetchApi(`/api/enterprise/conversations?id=${encodeURIComponent(convId)}`)
      if (!json.success || !json.data) {
        throw new Error('Conversation not found')
      }

      const conv = json.data
      setCurrentConversationId(conv.id)

      const loadedMessages: ChatMessage[] = (conv.messages || []).map((msg: any) => ({
        id: msg.id || `loaded_${Date.now()}_${Math.random()}`,
        role: msg.role,
        content: msg.content,
        agentName: msg.agentName || undefined,
        model: msg.model || undefined,
        confidence: msg.confidence ?? undefined,
        latencyMs: msg.latencyMs ?? undefined,
        contextSources: msg.contextSources || undefined,
        tokensUsed: msg.tokensUsed ?? undefined,
        createdAt: msg.createdAt || undefined,
      }))

      setMessages(loadedMessages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation')
    }
  }, [])

  // ── New chat ──
  const handleNewChat = useCallback(() => {
    setCurrentConversationId(null)
    setMessages([])
    setError(null)
    setInputValue('')
    inputRef.current?.focus()
  }, [])

  // ── Keyboard handler ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Empty state ──
  const isEmpty = messages.length === 0 && !isSending

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003ABC] shadow-lg shadow-[#003ABC]/20">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">
                  Agent Command Center
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  ALO Labs Unified AI Workforce — 2,000 Specialized AI Employees
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleNewChat} className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">New Chat</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Start a new conversation</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <StatsBar stats={stats} />
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* ── LEFT SIDE: Task Chat Interface (60%) ── */}
          <div className="flex flex-col lg:w-[60%] border-r border-slate-200 dark:border-slate-700 min-h-0">
            {/* ── Input Area ── */}
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="What do you need? The Orchestrator will find the best AI employee for your task..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                    className="h-12 text-sm border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 focus:border-[#003ABC] focus:ring-[#003ABC]/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 pr-12"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!inputValue.trim() || isSending}
                      className="h-9 w-9 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white shadow-md shadow-[#003ABC]/20"
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              {currentConversationId && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] border-[#003ABC]/30 text-[#003ABC] dark:text-blue-400">
                    <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                    Multi-turn conversation active
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-6 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2">
                    <RotateCcw className="h-3 w-3 mr-0.5" />
                    Clear
                  </Button>
                </div>
              )}
            </div>

            {/* ── Error Display ── */}
            {error && (
              <div className="shrink-0 px-4 pt-3">
                <ErrorDisplay message={error} onRetry={handleSend} />
              </div>
            )}

            {/* ── Messages Area ── */}
            <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 dark:bg-slate-900/30" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              <div className="max-h-full overflow-y-auto custom-scrollbar p-4 space-y-4">
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center py-16 sm:py-24">
                    <div className="relative mb-6">
                      <div className="h-16 w-16 rounded-2xl bg-[#003ABC]/10 dark:bg-[#003ABC]/20 flex items-center justify-center">
                        <Brain className="h-8 w-8 text-[#003ABC]" />
                      </div>
                      <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#FF6A00] flex items-center justify-center">
                        <Sparkles className="h-3 w-3 text-white" />
                      </div>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                      Welcome to the Agent Command Center
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md leading-relaxed mb-6">
                      Describe any task and the Unified Orchestrator will intelligently route it to the best specialized AI employee from our 2,000-agent workforce.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                      {[
                        'Analyze Q4 marketing data',
                        'Generate a compliance report',
                        'Design a brand identity',
                        'Write technical documentation',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setInputValue(suggestion)}
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-600 dark:text-slate-400 hover:border-[#003ABC]/30 hover:text-[#003ABC] dark:hover:text-blue-400 transition-colors"
                        >
                          <ArrowRight className="h-3 w-3" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <React.Fragment key={msg.id}>
                        {msg.routing && <RoutingCard routing={msg.routing} />}
                        <MessageBubble message={msg} />
                      </React.Fragment>
                    ))}
                    {isSending && <TypingIndicator />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          {/* ── RIGHT SIDE: Activity & Intelligence Panel (40%) ── */}
          <div className="flex flex-col lg:w-[40%] overflow-hidden min-h-0 bg-white dark:bg-slate-900/60">
            <ScrollArea className="flex-1">
              {/* ── Live Activity Feed ── */}
              <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" />
                    Live Activity Feed
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchInitialData}
                    disabled={isLoading}
                    className="h-7 px-2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <RotateCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <ActivityFeed runs={recentRuns} loading={isLoading} />
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-700" />

              {/* ── Conversation History ── */}
              <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Conversation History
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {conversations ? conversations.length : 0}
                  </Badge>
                </div>
                <ConversationList
                  conversations={conversations}
                  activeId={currentConversationId}
                  loading={isLoading}
                  onSelect={handleLoadConversation}
                />
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-700" />

              {/* ── System Pulse ── */}
              <SystemPulse />
            </ScrollArea>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
