'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Shield, TrendingUp, Award, Zap, BarChart3,
  AlertTriangle, CheckCircle2, Target, Layers, Activity,
  ChevronRight, Eye, EyeOff, RefreshCw, Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────
interface DashboardData {
  global: {
    totalAgents: number;
    totalEvolved: number;
    avgMaturity: number;
    avgModelReadiness: number;
    avgConfidence: number;
    avgProtectiveScore: number;
    totalKnowledge: number;
    totalSessions: number;
    totalCorrections: number;
    recentSessions24h: number;
    highLevelAgents: number;
    modelReadyAgents: number;
    levelDistribution: { level: number; count: number; name: string }[];
    pathDistribution: { path: string; count: number }[];
  };
  topAgents: Array<{
    agentId: string; name: string; department: string; role: string;
    level: number; levelName: string; maturityScore: number;
    modelReadiness: number; totalKnowledge: number;
    avgConfidence: number; evolutionPath: string;
    achievements: string[];
  }>;
  recentSessions: Array<{
    id: string; agentId: string; agentName: string; department: string;
    triggerType: string; knowledgeGained: number; insights: string[];
    corrections: string[]; durationMs: number; status: string;
    createdAt: string;
  }>;
  knowledgeByCategory: Array<{ category: string; count: number; avgConfidence: number }>;
  dailyLearningRate: Array<{ date: string; sessions: number }>;
  levelDetails: Array<{ level: number; name: string; count: number; minMaturity: number; minKnowledge: number }>;
}

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-500', 2: 'bg-slate-500', 3: 'bg-blue-500', 4: 'bg-cyan-500',
  5: 'bg-green-500', 6: 'bg-emerald-500', 7: 'bg-yellow-500', 8: 'bg-orange-500',
  9: 'bg-red-500', 10: 'bg-purple-500',
};

const LEVEL_BG: Record<number, string> = {
  1: 'bg-gray-100 text-gray-700', 2: 'bg-slate-100 text-slate-700',
  3: 'bg-blue-50 text-blue-700', 4: 'bg-cyan-50 text-cyan-700',
  5: 'bg-green-50 text-green-700', 6: 'bg-emerald-50 text-emerald-700',
  7: 'bg-yellow-50 text-yellow-700', 8: 'bg-orange-50 text-orange-700',
  9: 'bg-red-50 text-red-700', 10: 'bg-purple-50 text-purple-700',
};

// ── Component ─────────────────────────────────────────────────
export default function SelfLearningPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchAgent, setSearchAgent] = useState('');

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-learning/dashboard');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch {
      toast.error('Failed to load learning dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading || !data) {
    return (
      <div className="space-y-4 p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const { global, topAgents, recentSessions, knowledgeByCategory, dailyLearningRate, levelDetails } = data;
  const filteredAgents = topAgents.filter(a =>
    a.name.toLowerCase().includes(searchAgent.toLowerCase()) ||
    a.department.toLowerCase().includes(searchAgent.toLowerCase()),
  );

  const maxBarValue = Math.max(...(levelDetails.map(l => l.count)), 1);
  const maxDaily = Math.max(...(dailyLearningRate.map(d => d.sessions)), 1);

  return (
    <div className="space-y-4 p-1">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="text-xs"><Brain className="w-3 h-3 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="evolution" className="text-xs"><TrendingUp className="w-3 h-3 mr-1" />Evolution</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs"><Layers className="w-3 h-3 mr-1" />Knowledge</TabsTrigger>
          <TabsTrigger value="protection" className="text-xs"><Shield className="w-3 h-3 mr-1" />Protection</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs"><Activity className="w-3 h-3 mr-1" />Activity</TabsTrigger>
        </TabsList>

        {/* ═══════ OVERVIEW TAB ═══════ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Brain className="w-4 h-4" />} label="Total Knowledge" value={global.totalKnowledge.toLocaleString()} sub={`${global.recentSessions24h} sessions/24h`} color="text-blue-600" />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Avg Maturity" value={`${global.avgMaturity}%`} sub="across all agents" color="text-emerald-600" />
            <StatCard icon={<Target className="w-4 h-4" />} label="Model Ready" value={`${global.modelReadyAgents}`} sub={`of ${global.totalAgents} agents`} color="text-purple-600" />
            <StatCard icon={<Shield className="w-4 h-4" />} label="Safety Score" value={`${global.avgProtectiveScore}%`} sub="protective mode avg" color="text-orange-600" />
          </div>

          {/* Evolution Progress Chart */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Evolution Level Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {levelDetails.map(l => (
                  <div key={l.level} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-medium text-muted-foreground truncate">L{l.level} {l.name}</div>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${LEVEL_COLORS[l.level]}`}
                        style={{ width: `${(l.count / maxBarValue) * 100}%`, minWidth: l.count > 0 ? '12px' : '0' }}
                      />
                    </div>
                    <div className="w-12 text-xs text-right font-mono">{l.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top 5 Evolving Agents */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top Evolving Agents</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topAgents.slice(0, 5).map((a, i) => (
                  <div key={a.agentId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-primary/10 text-primary">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.department} · {a.role}</div>
                    </div>
                    <Badge variant="outline" className={LEVEL_BG[a.level]}>{a.levelName}</Badge>
                    <div className="text-right">
                      <div className="text-sm font-bold">{a.maturityScore.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">maturity</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ EVOLUTION TAB ═══════ */}
        <TabsContent value="evolution" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={<Zap className="w-4 h-4" />} label="High Level (6+)" value={global.highLevelAgents} sub="Expert and above" color="text-yellow-600" />
            <StatCard icon={<Award className="w-4 h-4" />} label="Model Ready (80%+)" value={global.modelReadyAgents} sub="ready for industrial use" color="text-purple-600" />
            <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Avg Confidence" value={`${global.avgConfidence}%`} sub="knowledge accuracy" color="text-cyan-600" />
          </div>

          {/* Evolution Paths */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Evolution Paths</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {global.pathDistribution.map(p => (
                  <div key={p.path} className="text-center p-3 rounded-lg border">
                    <div className="text-2xl font-bold">{p.count}</div>
                    <div className="text-xs text-muted-foreground capitalize">{p.path}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Agent Evolution Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Agent Evolution Details</CardTitle>
                <div className="relative w-48">
                  <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input className="pl-7 h-8 text-xs" placeholder="Search agents..." value={searchAgent} onChange={e => setSearchAgent(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredAgents.map(a => (
                  <div key={a.agentId} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className={`w-2 h-8 rounded-full ${LEVEL_COLORS[a.level]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.department} · {a.role} · {a.evolutionPath}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant="outline" className={`text-xs ${LEVEL_BG[a.level]}`}>L{a.level} {a.levelName}</Badge>
                      <div className="text-xs">{a.totalKnowledge} K · {a.achievements.length} <Award className="w-3 h-3 inline" /></div>
                    </div>
                    <div className="w-20 space-y-1">
                      <Progress value={a.maturityScore} className="h-2" />
                      <div className="text-xs text-right text-muted-foreground">{a.maturityScore.toFixed(0)}%</div>
                    </div>
                    <div className="w-20 space-y-1">
                      <Progress value={a.modelReadiness} className="h-2" />
                      <div className="text-xs text-right text-muted-foreground">{a.modelReadiness.toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ KNOWLEDGE TAB ═══════ */}
        <TabsContent value="knowledge" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Knowledge by Category</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {knowledgeByCategory.map(c => (
                  <div key={c.category} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize">{c.category.replace('_', ' ')}</span>
                      <span className="text-lg font-bold">{c.count}</span>
                    </div>
                    <Progress value={c.avgConfidence} className="h-1.5" />
                    <div className="text-xs text-muted-foreground mt-1">{c.avgConfidence}% avg confidence</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Daily Learning Rate */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Learning Activity (Last 7 Days)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {dailyLearningRate.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary/80 rounded-t transition-all duration-300" style={{ height: `${(d.sessions / maxDaily) * 100}%`, minHeight: d.sessions > 0 ? '4px' : '0' }} />
                    <div className="text-[10px] text-muted-foreground">{d.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ PROTECTION TAB ═══════ */}
        <TabsContent value="protection" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">Protective Mode Active</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  All {global.totalAgents} agents run with safety filtering. Harmful content, PII leaks, and injection
                  patterns are blocked before entering knowledge bases. Safety is enforced at 4 levels: minimal, standard, strict, maximum.
                </p>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-medium">Safety Score: {global.avgProtectiveScore}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Average protective score across all evolved agents. Score decreases with violations.
                  High-violation agents are automatically flagged for review.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Safety Features</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { icon: <EyeOff className="w-4 h-4" />, title: 'PII Protection', desc: 'Blocks passwords, API keys, tokens, credit cards, SSNs from knowledge' },
                  { icon: <Shield className="w-4 h-4" />, title: 'Toxic Content Filter', desc: 'Blocks harmful, violent, discriminatory, and self-harm content' },
                  { icon: <Target className="w-4 h-4" />, title: 'Scope Restriction', desc: 'Learning can be restricted to task domain, cross-domain, or open' },
                  { icon: <CheckCircle2 className="w-4 h-4" />, title: 'Daily Knowledge Limit', desc: 'Prevents knowledge overload with configurable daily caps (default: 50)' },
                  { icon: <Brain className="w-4 h-4" />, title: 'Confidence Capping', desc: 'Maximum confidence capped at 95% to prevent overconfidence bias' },
                  { icon: <RefreshCw className="w-4 h-4" />, title: 'Verification Required', desc: 'High-impact learnings require human verification before application' },
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="text-primary mt-0.5">{f.icon}</div>
                    <div>
                      <div className="text-sm font-medium">{f.title}</div>
                      <div className="text-xs text-muted-foreground">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ ACTIVITY TAB ═══════ */}
        <TabsContent value="activity" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Activity className="w-4 h-4" />} label="Total Sessions" value={global.totalSessions.toLocaleString()} sub="all-time" color="text-blue-600" />
            <StatCard icon={<Zap className="w-4 h-4" />} label="Last 24h" value={global.recentSessions24h.toString()} sub="sessions" color="text-green-600" />
            <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Corrections" value={global.totalCorrections.toLocaleString()} sub="learned from failures" color="text-orange-600" />
            <StatCard icon={<Brain className="w-4 h-4" />} label="Evolved Agents" value={`${global.totalEvolved}/${global.totalAgents}`} sub="have evolution data" color="text-purple-600" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Learning Sessions</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {recentSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No learning sessions yet. Trigger learning from agent tasks or use the manual trigger.</p>
                  </div>
                ) : (
                  recentSessions.map(s => (
                    <div key={s.id} className="flex items-start gap-3 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className={`mt-1 w-2 h-2 rounded-full ${s.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.agentName || 'Unknown Agent'}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.department} · <Badge variant="outline" className="text-[10px] px-1 py-0">{s.triggerType}</Badge>
                        </div>
                        {s.insights.length > 0 && (
                          <div className="text-xs mt-1 text-muted-foreground truncate">
                            {s.insights[0].substring(0, 80)}{s.insights[0].length > 80 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div>{s.knowledgeGained > 0 ? `+${s.knowledgeGained} K` : '0 K'}</div>
                        <div>{s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : '-'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <div className={color}>{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
