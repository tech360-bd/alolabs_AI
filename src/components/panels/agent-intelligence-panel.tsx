'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Bot, Building2, Search, MessageSquare, TrendingUp, Shield, Sparkles,
  ChevronRight, Filter, BarChart3, Zap, Target, Award, BookOpen, Clock,
  ArrowUpDown, Send, RefreshCw, Eye, Layers, Activity, AlertTriangle,
  CheckCircle2, Star, GraduationCap, Flame,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentBasic {
  id: string;
  agentId: string;
  name: string;
  slug: string;
  type: string;
  role: string;
  purpose: string;
  departmentId: string;
  departmentName: string;
  evolution: {
    level: number;
    levelName: string;
    maturityScore: number;
    modelReadiness: number;
    totalKnowledge: number;
    evolutionPath: string;
  } | null;
  protectiveMode: { enabled: boolean; safetyLevel: string } | null;
  knowledgeCount: number;
  sessionCount: number;
}

interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agentCount: number;
  totalKnowledge: number;
  avgMaturity: number;
  avgModelReadiness: number;
  levelDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  topAgents: {
    id: string;
    name: string;
    type: string;
    role: string;
    evolution: any;
    knowledgeCount: number;
  }[];
}

interface GlobalStats {
  totalDepartments: number;
  totalAgents: number;
  totalKnowledge: number;
  avgMaturity: number;
  avgModelReadiness: number;
}

interface KnowledgeEntry {
  id: string;
  category: string;
  content: string;
  source: string;
  confidence: number;
  useCount: number;
  successCount: number;
  temperature: string;
  isVerified: boolean;
  tags: string;
  createdAt: string;
}

interface AgentDetail {
  id: string;
  agentId: string;
  name: string;
  type: string;
  role: string;
  purpose: string;
  department: { name: string; slug: string };
  evolution: any;
  protectiveMode: any;
  knowledge: KnowledgeEntry[];
  learningSessions: any[];
  _count: { knowledge: number; learningSessions: number; tasks: number };
}

interface ChatResponse {
  response: string;
  agentName: string;
  contextUsed: number;
  confidence: number;
  timestamp: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-700',
  2: 'bg-slate-300 text-slate-800',
  3: 'bg-cyan-100 text-cyan-800',
  4: 'bg-cyan-200 text-cyan-900',
  5: 'bg-emerald-100 text-emerald-800',
  6: 'bg-emerald-200 text-emerald-900',
  7: 'bg-yellow-100 text-yellow-800',
  8: 'bg-orange-100 text-orange-800',
  9: 'bg-red-100 text-red-800',
  10: 'bg-purple-100 text-purple-800',
};

const TYPE_COLORS: Record<string, string> = {
  conversational: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  autonomous: 'bg-violet-100 text-violet-700 border-violet-200',
  workflow: 'bg-orange-100 text-orange-700 border-orange-200',
  specialized: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const ROLE_ICONS: Record<string, string> = {
  manager: '👔',
  planner: '📋',
  execution: '⚡',
  qa: '✅',
  report: '📊',
  automation: '🤖',
  safety: '🛡️',
  memory: '🧠',
  productivity: '📈',
  specialist: '⭐',
};

const CATEGORY_COLORS: Record<string, string> = {
  domain: 'bg-emerald-500',
  pattern: 'bg-cyan-500',
  correction: 'bg-orange-500',
  strategy: 'bg-violet-500',
  tool_usage: 'bg-pink-500',
  communication: 'bg-yellow-500',
};

const LEVEL_NAMES: Record<number, string> = {
  1: 'Novice',
  2: 'Beginner',
  3: 'Learner',
  4: 'Apprentice',
  5: 'Intermediate',
  6: 'Skilled',
  7: 'Advanced',
  8: 'Expert',
  9: 'Master',
  10: 'Transcendent',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentIntelligencePanel() {
  // Data state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<AgentBasic[]>([]);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'maturity' | 'knowledge' | 'readiness'>('maturity');
  const [activeTab, setActiveTab] = useState('chat');

  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent'; content: string }[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Fetch departments & global stats ─────────────────────────────────────

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agent-intelligence/departments');
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data.departments || []);
      setGlobalStats(data.globalStats || null);
    } catch (err) {
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // ─── Fetch agents for selected department ─────────────────────────────────

  const fetchAgents = useCallback(async (deptId: string) => {
    try {
      setAgentsLoading(true);
      const res = await fetch(`/api/agent-intelligence/agents?departmentId=${deptId}`);
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      toast.error('Failed to load agents');
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const handleSelectDepartment = useCallback(
    (deptId: string) => {
      setSelectedDeptId(deptId);
      setSelectedAgentId(null);
      setAgentDetail(null);
      setChatResponse(null);
      setChatHistory([]);
      fetchAgents(deptId);
    },
    [fetchAgents],
  );

  // ─── Fetch agent detail ───────────────────────────────────────────────────

  const fetchAgentDetail = useCallback(async (agentId: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/agent-intelligence/agent-detail?id=${agentId}`);
      if (!res.ok) throw new Error('Failed to fetch agent detail');
      const data = await res.json();
      setAgentDetail(data.agent || null);
      setSelectedAgentId(agentId);
      setChatResponse(null);
      setChatHistory([]);
      setActiveTab('chat');
    } catch {
      toast.error('Failed to load agent details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ─── Chat ─────────────────────────────────────────────────────────────────

  const handleSendChat = useCallback(async () => {
    if (!chatMessage.trim() || !selectedAgentId || chatLoading) return;

    const userMsg = chatMessage.trim();
    setChatMessage('');
    setChatHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/agent-intelligence/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, message: userMsg }),
      });
      if (!res.ok) throw new Error('Chat request failed');
      const data = await res.json();
      setChatResponse(data);
      setChatHistory((prev) => [...prev, { role: 'agent', content: data.response }]);
    } catch {
      toast.error('Failed to get response from agent');
      setChatHistory((prev) => [...prev, { role: 'agent', content: 'Sorry, I encountered an error processing your request.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatMessage, selectedAgentId, chatLoading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  // ─── Filtering & sorting ──────────────────────────────────────────────────

  const filteredDepartments = departments.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredAgents = agents
    .filter((a) => a.name.toLowerCase().includes(agentSearchQuery.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'maturity':
          return (b.evolution?.maturityScore ?? 0) - (a.evolution?.maturityScore ?? 0);
        case 'knowledge':
          return b.knowledgeCount - a.knowledgeCount;
        case 'readiness':
          return (b.evolution?.modelReadiness ?? 0) - (a.evolution?.modelReadiness ?? 0);
        default:
          return a.name.localeCompare(b.name);
      }
    });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getLevelBadge = (level: number | null | undefined) => {
    if (!level) return <Badge variant="outline" className="text-xs">L0 — None</Badge>;
    const cls = LEVEL_COLORS[level] || 'bg-gray-200 text-gray-700';
    return (
      <Badge className={`text-xs ${cls}`}>
        L{level} — {LEVEL_NAMES[level] || 'Unknown'}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const cls = TYPE_COLORS[type] || 'bg-slate-100 text-slate-700 border-slate-200';
    return (
      <Badge variant="outline" className={`text-xs ${cls}`}>
        {type}
      </Badge>
    );
  };

  const getRoleIcon = (role: string) => ROLE_ICONS[role] || '🔧';

  const selectedDepartment = departments.find((d) => d.id === selectedDeptId);

  const topDeptsByKnowledge = [...departments]
    .sort((a, b) => b.totalKnowledge - a.totalKnowledge)
    .slice(0, 5);

  // Aggregate level distribution
  const globalLevelDistribution: Record<string, number> = {};
  departments.forEach((d) => {
    Object.entries(d.levelDistribution || {}).forEach(([lvl, cnt]) => {
      globalLevelDistribution[lvl] = (globalLevelDistribution[lvl] || 0) + cnt;
    });
  });

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  // Department list skeleton
  const renderDeptSkeleton = () => (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  // Agent grid skeleton
  const renderAgentSkeleton = () => (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-2 w-3/4 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── Department Sidebar ──────────────────────────────────────────────────

  const renderDepartmentList = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search departments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {filteredDepartments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No departments found</p>
          </div>
        ) : (
          filteredDepartments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => handleSelectDepartment(dept.id)}
              className={`w-full text-left px-3 py-3 border-b transition-colors hover:bg-accent/50 ${
                selectedDeptId === dept.id ? 'bg-accent border-l-2 border-l-emerald-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{dept.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      <Bot className="h-2.5 w-2.5 mr-1" />
                      {dept.agentCount}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      <BookOpen className="h-2.5 w-2.5 inline mr-0.5" />
                      {dept.totalKnowledge} knowledge
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={dept.avgMaturity} className="h-1.5 flex-1" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {dept.avgMaturity.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 mt-1 transition-transform ${
                    selectedDeptId === dept.id ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}
                />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ─── Agent Grid ───────────────────────────────────────────────────────────

  const renderAgentGrid = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-semibold truncate">{selectedDepartment?.name}</h2>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {filteredAgents.length} agents
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 text-xs lg:hidden"
            onClick={() => {
              setSelectedDeptId(null);
              setSelectedAgentId(null);
              setAgentDetail(null);
              setAgents([]);
            }}
          >
            ← Back
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="maturity">Maturity ↓</SelectItem>
              <SelectItem value="knowledge">Knowledge ↓</SelectItem>
              <SelectItem value="readiness">Readiness ↓</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No agents found in this department</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {filteredAgents.map((agent) => (
              <Card
                key={agent.id}
                className="cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all p-4"
                onClick={() => fetchAgentDetail(agent.id)}
              >
                <div className="space-y-3">
                  {/* Name & Role */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{getRoleIcon(agent.role)}</span>
                        <span className="text-sm font-semibold truncate">{agent.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {agent.role}
                      </p>
                    </div>
                    {agent.protectiveMode?.enabled && (
                      <Shield className="h-4 w-4 text-emerald-600 shrink-0" role="img" aria-label="Protective mode on" />
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getTypeBadge(agent.type)}
                    {getLevelBadge(agent.evolution?.level)}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <BookOpen className="h-3 w-3" />
                        <span>{agent.knowledgeCount}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Knowledge</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Flame className="h-3 w-3" />
                        <span>{agent.sessionCount}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Sessions</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium">
                        {agent.evolution?.maturityScore
                          ? `${agent.evolution.maturityScore.toFixed(0)}%`
                          : '—'}
                      </span>
                      <p className="text-[10px] text-muted-foreground">Maturity</p>
                    </div>
                  </div>

                  {/* Progress bars */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Maturity</span>
                      <span>{agent.evolution?.maturityScore?.toFixed(1) ?? '0'}%</span>
                    </div>
                    <Progress value={agent.evolution?.maturityScore ?? 0} className="h-1.5" />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Model Readiness</span>
                      <span>{agent.evolution?.modelReadiness?.toFixed(1) ?? '0'}%</span>
                    </div>
                    <Progress value={agent.evolution?.modelReadiness ?? 0} className="h-1.5" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Agent Detail View ────────────────────────────────────────────────────

  const renderAgentDetail = () => {
    if (detailLoading) {
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
          <div className="p-4 space-y-4 flex-1">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      );
    }

    if (!agentDetail) return null;

    const evo = agentDetail.evolution;
    const groupedKnowledge = agentDetail.knowledge.reduce(
      (acc, k) => {
        const cat = k.category || 'uncategorized';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(k);
        return acc;
      },
      {} as Record<string, KnowledgeEntry[]>,
    );

    return (
      <div className="flex flex-col h-full">
        {/* Agent Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-lg shrink-0">
                {getRoleIcon(agentDetail.role)}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold truncate">{agentDetail.name}</h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {getTypeBadge(agentDetail.type)}
                  <Badge variant="outline" className="text-[10px]">
                    {getRoleIcon(agentDetail.role)} {agentDetail.role}
                  </Badge>
                  {getLevelBadge(evo?.level)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <Building2 className="h-3 w-3 inline mr-1" />
                  {agentDetail.department.name}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 text-xs"
              onClick={() => {
                setSelectedAgentId(null);
                setAgentDetail(null);
                setChatResponse(null);
                setChatHistory([]);
              }}
            >
              ← Back
            </Button>
          </div>

          {/* Purpose */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {agentDetail.purpose || 'No purpose defined.'}
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 rounded-lg bg-accent/50">
              <div className="text-sm font-bold text-emerald-600">
                {evo?.maturityScore?.toFixed(0) ?? '0'}%
              </div>
              <p className="text-[10px] text-muted-foreground">Maturity</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-accent/50">
              <div className="text-sm font-bold text-cyan-600">
                {evo?.modelReadiness?.toFixed(0) ?? '0'}%
              </div>
              <p className="text-[10px] text-muted-foreground">Readiness</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-accent/50">
              <div className="text-sm font-bold text-violet-600">
                {agentDetail._count.knowledge}
              </div>
              <p className="text-[10px] text-muted-foreground">Knowledge</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-accent/50">
              <div className="text-sm font-bold text-orange-600">
                {agentDetail._count.learningSessions}
              </div>
              <p className="text-[10px] text-muted-foreground">Sessions</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-4 mt-2 w-fit">
            <TabsTrigger value="chat" className="text-xs gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="text-xs gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Knowledge ({agentDetail._count.knowledge})
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0 px-4 pb-4">
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background p-4 space-y-4">
              {chatHistory.length === 0 && !chatLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="h-10 w-10 text-emerald-400 mb-3" />
                  <p className="text-sm font-medium">Chat with {agentDetail.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Ask this agent a question. It will respond using its knowledge base and evolution context.
                  </p>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-accent text-foreground rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-accent rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {chatResponse && (
              <div className="flex items-center gap-3 mt-2 px-2">
                <Badge variant="outline" className="text-[10px]">
                  <Target className="h-2.5 w-2.5 mr-1" />
                  Confidence: {chatResponse.confidence?.toFixed(1) ?? '—'}%
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Layers className="h-2.5 w-2.5 mr-1" />
                  {chatResponse.contextUsed ?? 0} context items
                </Badge>
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Input
                placeholder={`Ask ${agentDetail.name} something...`}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                className="flex-1"
                disabled={chatLoading}
              />
              <Button
                size="icon"
                onClick={handleSendChat}
                disabled={chatLoading || !chatMessage.trim()}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
              >
                {chatLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </TabsContent>

          {/* Knowledge Tab */}
          <TabsContent value="knowledge" className="flex-1 min-h-0 mt-0 px-4 pb-4 overflow-auto">
            {agentDetail.knowledge.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No knowledge entries yet</p>
              </div>
            ) : (
              <div className="space-y-6 py-3">
                {Object.entries(groupedKnowledge).map(([category, entries]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          CATEGORY_COLORS[category] || 'bg-slate-400'
                        }`}
                      />
                      <h3 className="text-sm font-semibold capitalize">{category.replace(/_/g, ' ')}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {entries.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 ml-5">
                      {entries.map((k) => (
                        <div
                          key={k.id}
                          className="rounded-lg border p-3 hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs leading-relaxed flex-1">{k.content}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {k.isVerified && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1 flex-1">
                              <Target className="h-3 w-3 text-muted-foreground" />
                              <Progress value={k.confidence} className="h-1 flex-1" />
                              <span className="text-[10px] text-muted-foreground">
                                {k.confidence}%
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              Used {k.useCount}x
                            </span>
                            {k.tags && (
                              <span className="text-[10px] text-violet-600 truncate max-w-[120px]">
                                {k.tags}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="flex-1 min-h-0 mt-0 px-4 pb-4 overflow-auto">
            {agentDetail.learningSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <GraduationCap className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No learning sessions recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2 py-3">
                {agentDetail.learningSessions.map((session: any, idx: number) => (
                  <div key={session.id || idx} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center">
                          <GraduationCap className="h-4 w-4 text-violet-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {session.type || 'Learning Session'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {session.source || 'System'} • {session.knowledgeGained ?? 0} items gained
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3 inline mr-0.5" />
                        {session.createdAt
                          ? new Date(session.createdAt).toLocaleDateString()
                          : '—'}
                      </span>
                    </div>
                    {session.summary && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {session.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  // ─── Global Stats Sidebar ─────────────────────────────────────────────────

  const renderGlobalStats = () => {
    if (!globalStats) {
      return (
        <div className="p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      );
    }

    const modelReadyCount = departments.reduce(
      (acc, d) => acc + Math.round((d.avgModelReadiness / 100) * d.agentCount),
      0,
    );

    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Global Intelligence
        </h3>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Bot className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground">Total Agents</span>
            </div>
            <p className="text-lg font-bold text-emerald-700">
              {globalStats.totalAgents.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">
              in {globalStats.totalDepartments} departments
            </p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <BookOpen className="h-3.5 w-3.5 text-cyan-600" />
              <span className="text-[10px] text-muted-foreground">Total Knowledge</span>
            </div>
            <p className="text-lg font-bold text-cyan-700">
              {globalStats.totalKnowledge.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">entries across all agents</p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-[10px] text-muted-foreground">Avg Maturity</span>
            </div>
            <p className="text-lg font-bold text-violet-700">
              {globalStats.avgMaturity.toFixed(1)}%
            </p>
            <Progress value={globalStats.avgMaturity} className="h-1.5 mt-1.5" />
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-[10px] text-muted-foreground">Model Ready</span>
            </div>
            <p className="text-lg font-bold text-orange-700">
              ~{modelReadyCount.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">
              avg {globalStats.avgModelReadiness.toFixed(1)}% readiness
            </p>
          </Card>
        </div>

        <Separator />

        {/* Top departments by knowledge */}
        <div>
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-orange-500" />
            Top 5 by Knowledge
          </h4>
          <div className="space-y-1.5">
            {topDeptsByKnowledge.map((dept, idx) => (
              <div
                key={dept.id}
                className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-accent/50 rounded px-1.5 transition-colors"
                onClick={() => handleSelectDepartment(dept.id)}
              >
                <span className="w-4 text-center font-bold text-muted-foreground text-[10px]">
                  {idx + 1}
                </span>
                <span className="flex-1 truncate">{dept.name}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {dept.totalKnowledge}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Evolution Level Distribution */}
        <div>
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            Level Distribution
          </h4>
          <div className="space-y-1.5">
            {Object.entries(globalLevelDistribution)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([level, count]) => {
                const total = globalStats.totalAgents || 1;
                const pct = ((count / total) * 100).toFixed(0);
                const lvl = Number(level);
                const cls = LEVEL_COLORS[lvl] || 'bg-gray-200 text-gray-700';
                return (
                  <div key={level} className="flex items-center gap-2 text-xs">
                    <Badge className={`text-[10px] ${cls} shrink-0 w-16 justify-center`}>
                      L{level}
                    </Badge>
                    <Progress value={Number(pct)} className="h-2 flex-1" />
                    <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                      {count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        <Separator />

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            fetchDepartments();
            toast.success('Data refreshed');
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh Data
        </Button>
      </div>
    );
  };

  // ─── Mobile Department Selector ───────────────────────────────────────────

  const renderMobileDeptSelector = () => (
    <div className="lg:hidden p-3 border-b">
      <Select
        value={selectedDeptId || ''}
        onValueChange={(v) => v && handleSelectDepartment(v)}
      >
        <SelectTrigger className="w-full">
          <Building2 className="h-4 w-4 mr-2 text-emerald-600" />
          <SelectValue placeholder="Select a department..." />
        </SelectTrigger>
        <SelectContent>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              <span className="flex items-center gap-2">
                {d.name}
                <Badge variant="secondary" className="text-[10px] ml-2">
                  {d.agentCount} agents
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page Title */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold">Agent Intelligence Panel</h1>
              <p className="text-[10px] text-muted-foreground">
                Monitor, explore, and interact with all 100 departments & 2,000 agents
              </p>
            </div>
          </div>
          {globalStats && (
            <div className="hidden sm:flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1">
                <Bot className="h-3.5 w-3.5 text-emerald-600" />
                <strong>{globalStats.totalAgents}</strong> agents
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-cyan-600" />
                <strong>{globalStats.totalKnowledge}</strong> knowledge
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile department selector */}
      {renderMobileDeptSelector()}

      {/* 3-Column Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar: Departments — hidden on mobile (uses selector above) */}
        <div className="hidden lg:flex w-72 xl:w-80 shrink-0 border-r flex-col">
          {loading ? renderDeptSkeleton() : renderDepartmentList()}
        </div>

        {/* Middle Panel */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {!selectedDeptId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Select a Department</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Choose a department from the sidebar to explore its agents, knowledge bases, and intelligence metrics.
              </p>
              <div className="flex items-center gap-6 mt-6">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                    <Building2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-xs font-medium">100</p>
                  <p className="text-[10px] text-muted-foreground">Departments</p>
                </div>
                <div className="text-center">
                  <div className="h-12 w-12 rounded-xl bg-cyan-100 flex items-center justify-center mx-auto mb-2">
                    <Bot className="h-6 w-6 text-cyan-600" />
                  </div>
                  <p className="text-xs font-medium">2,000</p>
                  <p className="text-[10px] text-muted-foreground">Agents</p>
                </div>
                <div className="text-center">
                  <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center mx-auto mb-2">
                    <BookOpen className="h-6 w-6 text-violet-600" />
                  </div>
                  <p className="text-xs font-medium">∞</p>
                  <p className="text-[10px] text-muted-foreground">Knowledge</p>
                </div>
              </div>
            </div>
          ) : agentsLoading && agents.length === 0 ? (
            renderAgentSkeleton()
          ) : selectedAgentId ? (
            renderAgentDetail()
          ) : (
            renderAgentGrid()
          )}
        </div>

        {/* Right Sidebar: Global Stats — hidden on small screens */}
        <div className="hidden xl:flex w-72 2xl:w-80 shrink-0 border-l flex-col overflow-auto">
          {renderGlobalStats()}
        </div>
      </div>
    </div>
  );
}
