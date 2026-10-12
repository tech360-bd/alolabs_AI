import React, { useState, useEffect } from "react";
import {
  Users,
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Calendar,
  Sparkles,
  Phone,
  Mail,
  User,
  Star,
  RefreshCw,
  Plus,
  CheckCircle,
  FileText,
  Clock,
  Trash2,
  Lock,
  ChevronRight,
  LogOut,
  Send,
  Sliders,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AlAminnCRMProps {
  onLogout: () => void;
  leads: any[];
  appointments: any[];
  tasks: any[];
  logs: any[];
  onRefreshAll: () => void;
}

export default function AlAminnCRM({
  onLogout,
  leads,
  appointments,
  tasks,
  logs,
  onRefreshAll
}: AlAminnCRMProps) {
  const [crmTab, setCrmTab] = useState<"dashboard" | "pipeline" | "clients" | "appointments" | "logs" | "tasks">("dashboard");

  // Lead Details/AI draft Modal states
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [aiDraftType, setAiDraftType] = useState<"WhatsApp" | "Email">("WhatsApp");
  const [aiCustomGoal, setAiCustomGoal] = useState("");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<{ subject?: string; draft?: string } | null>(null);

  // New Task Form
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Stats Counters
  const totalLeads = leads.length;
  const newLeadsCount = leads.filter((l) => l.status === "new").length;
  const qualifiedCount = leads.filter((l) => l.status === "qualified" || l.status === "converted").length;
  const pendingAppointments = appointments.filter((a) => a.status === "pending").length;
  const activeTasks = tasks.filter((t) => !t.completed).length;

  // Update Lead Status
  const handleUpdateLeadStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/alaminn/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        onRefreshAll();
        if (selectedLead && selectedLead.id === id) {
          setSelectedLead({ ...selectedLead, status });
        }
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  // Update Lead Rating
  const handleUpdateLeadRating = async (id: string, rating: number) => {
    try {
      const res = await fetch(`/api/alaminn/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating })
      });
      if (res.ok) {
        onRefreshAll();
        if (selectedLead && selectedLead.id === id) {
          setSelectedLead({ ...selectedLead, rating });
        }
      }
    } catch (err) {
      console.error("Failed to update rating", err);
    }
  };

  // Generate AI Reply Draft
  const handleGenerateAIDraft = async () => {
    if (!selectedLead) return;
    setIsGeneratingDraft(true);
    setGeneratedDraft(null);

    try {
      const res = await fetch("/api/alaminn/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: selectedLead.name,
          service: selectedLead.service,
          clientMessage: selectedLead.message,
          type: aiDraftType,
          customGoal: aiCustomGoal
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedDraft(data);
      }
    } catch (err) {
      console.error("Failed to draft AI response", err);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Simulate Sending Outreach message & Log interaction
  const handleSimulateSend = async () => {
    if (!selectedLead || !generatedDraft) return;

    try {
      const res = await fetch("/api/alaminn/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          type: aiDraftType,
          sender: "Al Aminn",
          recipient: selectedLead.name,
          message: generatedDraft.draft || ""
        })
      });

      if (res.ok) {
        // Automatically switch lead status to "contacted"
        await handleUpdateLeadStatus(selectedLead.id, "contacted");
        alert(`Interaction logged successfully! Simulating ${aiDraftType} outreach dispatch to ${selectedLead.name} (${selectedLead.email || selectedLead.phone}).`);
        setGeneratedDraft(null);
        setAiCustomGoal("");
        setSelectedLead(null);
        onRefreshAll();
      }
    } catch (err) {
      console.error("Failed to write interaction log", err);
    }
  };

  // Update Appointment status
  const handleUpdateApptStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/alaminn/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        onRefreshAll();
      }
    } catch (err) {
      console.error("Failed to update appointment", err);
    }
  };

  // Add a Task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle) return;

    setIsSubmittingTask(true);
    try {
      const res = await fetch("/api/alaminn/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          dueDate: newTaskDueDate || new Date().toISOString().split("T")[0],
          priority: newTaskPriority,
          completed: false
        })
      });

      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskDueDate("");
        onRefreshAll();
      }
    } catch (err) {
      console.error("Failed to add task", err);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Toggle Task Completed
  const handleToggleTask = async (id: string, currentCompleted: boolean) => {
    try {
      const res = await fetch(`/api/alaminn/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !currentCompleted })
      });
      if (res.ok) {
        onRefreshAll();
      }
    } catch (err) {
      console.error("Failed to toggle task", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#003A8C] font-sans flex flex-col justify-between">
      {/* CRM HEADER */}
      <header className="sticky top-0 z-30 bg-[#003A8C] border-b-2 border-[#FF6A00]/25 px-8 py-4 flex justify-between items-center text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center font-bold text-[#003A8C] text-lg border-2 border-[#FF6A00]">
            AA
          </div>
          <div>
            <h1 className="font-display font-extrabold text-white tracking-tight leading-none flex items-center gap-2">
              Al Aminn Personal CRM
              <span className="bg-[#FF6A00] text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-widest">
                PRIVATE
              </span>
            </h1>
            <p className="text-[#FF6A00]/90 font-mono text-[10px] tracking-widest uppercase mt-1 font-bold">
              crm.alaminn.info
            </p>
          </div>
        </div>

        {/* CRM NAVBAR */}
        <nav className="hidden lg:flex items-center gap-5">
          <button
            onClick={() => setCrmTab("dashboard")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "dashboard" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Metrics Panel
          </button>
          <button
            onClick={() => setCrmTab("pipeline")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "pipeline" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
            AI Lead Pipeline
          </button>
          <button
            onClick={() => setCrmTab("clients")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "clients" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Client Registry
          </button>
          <button
            onClick={() => setCrmTab("appointments")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "appointments" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Schedules
            {pendingAppointments > 0 && (
              <span className="bg-[#FF6A00] text-white text-[9px] px-1 rounded-full font-mono font-bold animate-bounce">
                {pendingAppointments}
              </span>
            )}
          </button>
          <button
            onClick={() => setCrmTab("logs")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "logs" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Outreach Logs
          </button>
          <button
            onClick={() => setCrmTab("tasks")}
            className={`text-xs font-extrabold flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
              crmTab === "tasks" ? "bg-white text-[#003A8C]" : "text-white/80 hover:bg-white/10"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Follow-Up Tasks
            {activeTasks > 0 && (
              <span className="bg-[#FF6A00] text-white text-[9px] px-1 rounded-full font-mono font-bold">
                {activeTasks}
              </span>
            )}
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefreshAll}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Refresh database state"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </div>
      </header>

      {/* CORE CONTENT */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-8 space-y-8">
        
        {/* STATS OVERVIEW ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-[10px] font-mono text-[#003A8C]/60 uppercase font-black tracking-wider block">Total Pipeline Leads</span>
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-black text-[#003A8C]">{totalLeads}</span>
              {newLeadsCount > 0 && (
                <span className="bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-[#FF6A00]/25">
                  {newLeadsCount} New
                </span>
              )}
            </div>
          </div>

          <div className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-[10px] font-mono text-[#003A8C]/60 uppercase font-black tracking-wider block">Qualified Accounts</span>
            <span className="text-3xl font-black text-[#003A8C]">{qualifiedCount}</span>
          </div>

          <div className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-[10px] font-mono text-[#003A8C]/60 uppercase font-black tracking-wider block">Pending Appointments</span>
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-black text-[#003A8C]">{appointments.length}</span>
              {pendingAppointments > 0 && (
                <span className="bg-[#FF6A00]/15 text-[#FF6A00] text-[10px] font-black px-2 py-0.5 rounded-full font-mono animate-pulse">
                  {pendingAppointments} Review
                </span>
              )}
            </div>
          </div>

          <div className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-[10px] font-mono text-[#003A8C]/60 uppercase font-black tracking-wider block">Active Tasks Due</span>
            <span className="text-3xl font-black text-[#003A8C]">{activeTasks}</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* DASHBOARD SUMMARY PANEL */}
          {crmTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid md:grid-cols-12 gap-8"
            >
              {/* Recent leads table overview */}
              <div className="md:col-span-8 bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg text-[#003A8C]">Recent Pipeline Activity</h3>
                  <button onClick={() => setCrmTab("pipeline")} className="text-xs text-[#FF6A00] font-bold hover:underline flex items-center gap-1">
                    Manage Lead Swarms <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FFF3E8]/30 border-b border-[#003A8C]/10 text-[#003A8C]/80 font-mono font-bold uppercase">
                        <th className="p-3">Client Name</th>
                        <th className="p-3">Core Service</th>
                        <th className="p-3">Pipeline Status</th>
                        <th className="p-3">Lead Temp</th>
                        <th className="p-3 text-right">Inquired At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {leads.slice(0, 5).map((l) => (
                        <tr key={l.id} className="hover:bg-[#FFF3E8]/10">
                          <td className="p-3 font-bold text-[#003A8C]">{l.name}</td>
                          <td className="p-3">{l.service}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              l.status === "new" ? "bg-orange-100 text-orange-700" :
                              l.status === "contacted" ? "bg-blue-100 text-blue-700" :
                              l.status === "qualified" ? "bg-green-100 text-green-700" :
                              "bg-slate-100 text-slate-700"
                            }`}>
                              {l.status}
                            </span>
                          </td>
                          <td className="p-3 flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className={`w-3 h-3 ${s <= (l.rating || 3) ? "text-[#FF6A00] fill-[#FF6A00]" : "text-slate-200"}`} />
                            ))}
                          </td>
                          <td className="p-3 text-right font-mono text-[10px] text-slate-500">
                            {new Date(l.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tasks Quicklist */}
              <div className="md:col-span-4 bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg text-[#003A8C]">Urgent Tasks</h3>
                  <button onClick={() => setCrmTab("tasks")} className="text-xs text-[#FF6A00] font-bold hover:underline">
                    View All
                  </button>
                </div>

                <div className="space-y-2">
                  {tasks.filter((t) => !t.completed).slice(0, 4).map((t) => (
                    <div key={t.id} className="p-3 border border-[#003A8C]/10 rounded-xl bg-[#FFF3E8]/10 flex justify-between items-center">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[#003A8C]">{t.title}</p>
                        <p className="text-[9px] font-mono text-slate-500">Due: {t.dueDate}</p>
                      </div>
                      <button
                        onClick={() => handleToggleTask(t.id, t.completed)}
                        className="w-5 h-5 rounded-md border-2 border-[#003A8C] hover:bg-[#003A8C]/10 flex items-center justify-center text-white"
                      >
                        <Check className="w-3.5 h-3.5 text-[#FF6A00]" />
                      </button>
                    </div>
                  ))}
                  {tasks.filter((t) => !t.completed).length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400 font-semibold">
                      All caught up! No pending tasks.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* AI LEAD PIPELINE */}
          {crmTab === "pipeline" && (
            <motion.div
              key="pipeline"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#003A8C] font-display">AI Swarm Lead Pipeline</h2>
                  <p className="text-xs text-slate-500 font-semibold">
                    Interact directly with lead cards, customize ratings, update statuses, or call the Gemini Copilot to write personalized messages.
                  </p>
                </div>
              </div>

              {/* GRID OF PIPELINE CARDS */}
              <div className="grid md:grid-cols-3 gap-6">
                {leads.map((l) => (
                  <div key={l.id} className="bg-white border-2 border-[#003A8C]/15 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-[#FF6A00]/40 transition-colors shadow-sm">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="bg-[#FFF3E8] border border-[#FF6A00]/15 text-[#003A8C] font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {l.id}
                        </span>
                        
                        <select
                          value={l.status}
                          onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value)}
                          className="bg-white border border-[#003A8C]/25 rounded text-[11px] font-bold text-[#003A8C] py-0.5 px-1 focus:outline-none"
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="qualified">Qualified</option>
                          <option value="converted">Converted</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <h4 className="font-bold text-[#003A8C] text-lg font-display">{l.name}</h4>
                        <p className="text-xs text-[#FF6A00] font-bold font-mono">{l.service}</p>
                      </div>

                      <div className="text-xs font-semibold text-slate-500 space-y-1 border-t border-slate-50 pt-2">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{l.email}</span>
                        </div>
                        {l.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{l.phone}</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-[#F8FAFC] border border-[#003A8C]/5 rounded-xl p-3 text-[11px] font-semibold text-slate-600 leading-relaxed italic">
                        "{l.message}"
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      {/* Rating updater */}
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} onClick={() => handleUpdateLeadRating(l.id, s)}>
                            <Star className={`w-3.5 h-3.5 ${s <= (l.rating || 3) ? "text-[#FF6A00] fill-[#FF6A00]" : "text-slate-200"}`} />
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setSelectedLead(l)}
                        className="bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-black text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
                        AI Outreach
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DETAILED AI OUTREACH DRAWER / COPILOT MODAL */}
              {selectedLead && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white border-2 border-[#003A8C] rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="bg-[#003A8C] text-white p-5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#FF6A00]" />
                        <h3 className="font-bold text-lg font-display">AI Outreach Copilot</h3>
                      </div>
                      <button onClick={() => { setSelectedLead(null); setGeneratedDraft(null); }} className="text-white/80 hover:text-white font-bold text-sm">
                        ✕ Close
                      </button>
                    </div>

                    <div className="p-6 space-y-4 overflow-y-auto max-h-[500px]">
                      <div className="bg-[#FFF3E8] border border-[#FF6A00]/20 rounded-2xl p-4 text-xs font-semibold text-[#003A8C]">
                        <p className="font-mono text-[10px] text-[#FF6A00] uppercase font-black mb-1">Target Account</p>
                        <p className="text-sm font-bold">{selectedLead.name} - {selectedLead.service}</p>
                        <p className="text-slate-600 mt-1 leading-relaxed">Original Query: "{selectedLead.message}"</p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Outreach Channel</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setAiDraftType("WhatsApp"); setGeneratedDraft(null); }}
                              className={`flex-1 text-xs font-bold py-2 rounded-lg border-2 text-center transition-all ${
                                aiDraftType === "WhatsApp" ? "bg-[#003A8C] text-white border-[#003A8C]" : "bg-white text-[#003A8C] border-[#003A8C]/20 hover:bg-[#FFF3E8]/30"
                              }`}
                            >
                              WhatsApp (Bilingual Friendly)
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAiDraftType("Email"); setGeneratedDraft(null); }}
                              className={`flex-1 text-xs font-bold py-2 rounded-lg border-2 text-center transition-all ${
                                aiDraftType === "Email" ? "bg-[#003A8C] text-white border-[#003A8C]" : "bg-white text-[#003A8C] border-[#003A8C]/20 hover:bg-[#FFF3E8]/30"
                              }`}
                            >
                              Professional Email
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Custom Conversation Objective</label>
                          <input
                            type="text"
                            placeholder="e.g. Schedule a 15-min call / Propose discount"
                            value={aiCustomGoal}
                            onChange={(e) => setAiCustomGoal(e.target.value)}
                            className="w-full border-2 border-[#003A8C]/15 focus:border-[#FF6A00] rounded-lg p-2 text-xs font-semibold focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateAIDraft}
                        disabled={isGeneratingDraft}
                        className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                        {isGeneratingDraft ? "Gemini is composing message..." : "Draft Custom Outreach Response with Gemini"}
                      </button>

                      {/* DISPLAY DRAFT RESPONSE */}
                      {generatedDraft && (
                        <div className="border-2 border-[#003A8C]/20 rounded-2xl overflow-hidden shadow-sm">
                          <div className="bg-[#FFF3E8] p-3 border-b border-[#003A8C]/10 text-xs font-bold text-[#003A8C] flex justify-between items-center">
                            <span>Draft Output</span>
                            <span className="font-mono text-[9px] uppercase text-[#FF6A00] font-black">Ready to send</span>
                          </div>
                          
                          <div className="p-4 space-y-3 bg-slate-50 text-xs text-slate-700 font-semibold leading-relaxed">
                            {generatedDraft.subject && (
                              <p className="border-b border-slate-200 pb-2">
                                <span className="font-bold text-[#003A8C] font-mono">Subject:</span> {generatedDraft.subject}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{generatedDraft.draft}</p>
                          </div>

                          <div className="p-3 bg-white border-t border-slate-100 flex justify-end gap-2">
                            <button
                              onClick={() => { setGeneratedDraft(null); }}
                              className="text-slate-500 hover:text-slate-700 font-bold text-xs px-3 py-1.5 rounded"
                            >
                              Discard
                            </button>
                            <button
                              onClick={handleSimulateSend}
                              className="bg-[#003A8C] text-white font-black text-xs px-4 py-1.5 rounded-lg flex items-center gap-1"
                            >
                              <Send className="w-3.5 h-3.5 text-[#FF6A00]" />
                              Log as Sent Outreach
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* CLIENT REGISTRY DIRECTORY */}
          {crmTab === "clients" && (
            <motion.div
              key="clients"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div>
                <h2 className="text-xl font-extrabold text-[#003A8C] font-display">Client Directory</h2>
                <p className="text-xs text-slate-500 font-semibold">
                  Comprehensive folder detailing all registered client records, including ratings, service categories, and join timestamps.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#FFF3E8]/30 border-b border-[#003A8C]/10 text-[#003A8C]/80 font-mono font-bold uppercase">
                      <th className="p-3">Client Name</th>
                      <th className="p-3">Email Address</th>
                      <th className="p-3">Phone Number</th>
                      <th className="p-3">Requested Solution</th>
                      <th className="p-3">Lead Priority</th>
                      <th className="p-3">Current Status</th>
                      <th className="p-3">Date Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {leads.map((c) => (
                      <tr key={c.id} className="hover:bg-[#FFF3E8]/5">
                        <td className="p-3 font-bold text-[#003A8C]">{c.name}</td>
                        <td className="p-3">{c.email}</td>
                        <td className="p-3 font-mono">{c.phone || "No phone record"}</td>
                        <td className="p-3 text-[#FF6A00] font-bold font-mono">{c.service}</td>
                        <td className="p-3">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className={`w-3.5 h-3.5 ${s <= (c.rating || 3) ? "text-[#FF6A00] fill-[#FF6A00]" : "text-slate-200"}`} />
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status === "new" ? "bg-orange-100 text-orange-700" :
                            c.status === "contacted" ? "bg-blue-100 text-blue-700" :
                            c.status === "qualified" ? "bg-green-100 text-green-700" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-500">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* APPOINTMENT SCHEDULES */}
          {crmTab === "appointments" && (
            <motion.div
              key="appointments"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div>
                <h2 className="text-xl font-extrabold text-[#003A8C] font-display">Client Consult Calendars</h2>
                <p className="text-xs text-slate-500 font-semibold">
                  Manage requested consultations. Sync status changes back to the server instantaneously.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#FFF3E8]/30 border-b border-[#003A8C]/10 text-[#003A8C]/80 font-mono font-bold uppercase">
                      <th className="p-3">Client</th>
                      <th className="p-3">Goal Service</th>
                      <th className="p-3">Requested Date</th>
                      <th className="p-3">Requested Time (GMT+6)</th>
                      <th className="p-3">Notes / Bottlenecks</th>
                      <th className="p-3">Schedule Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {appointments.map((a) => (
                      <tr key={a.id} className="hover:bg-[#FFF3E8]/5">
                        <td className="p-3 font-bold text-[#003A8C]">{a.clientName}</td>
                        <td className="p-3">{a.service}</td>
                        <td className="p-3 font-mono">{a.date}</td>
                        <td className="p-3 font-mono">{a.time}</td>
                        <td className="p-3 text-xs text-slate-500 max-w-xs truncate" title={a.notes}>
                          {a.notes || "No notes"}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            a.status === "approved" ? "bg-green-100 text-green-700" :
                            a.status === "cancelled" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="p-3 text-right flex justify-end gap-1.5">
                          {a.status !== "approved" && (
                            <button
                              onClick={() => handleUpdateApptStatus(a.id, "approved")}
                              className="bg-green-500 hover:bg-green-600 text-white font-bold text-[10px] px-2.5 py-1 rounded transition-colors"
                            >
                              Approve
                            </button>
                          )}
                          {a.status !== "cancelled" && (
                            <button
                              onClick={() => handleUpdateApptStatus(a.id, "cancelled")}
                              className="bg-red-100 hover:bg-red-200 text-red-600 font-bold text-[10px] px-2.5 py-1 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* OUTREACH LOGS */}
          {crmTab === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div>
                <h2 className="text-xl font-extrabold text-[#003A8C] font-display">Communication Log History</h2>
                <p className="text-xs text-slate-500 font-semibold">
                  Track and verify all simulated email and WhatsApp outreach logs dispatched via Al Aminn's AI Swarm pipelines.
                </p>
              </div>

              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="border border-[#003A8C]/10 rounded-2xl overflow-hidden">
                    <div className="bg-[#FFF3E8]/30 p-3 border-b border-[#003A8C]/10 flex justify-between items-center text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.type === "WhatsApp" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {log.type}
                        </span>
                        <p className="text-[#003A8C]">To: <span className="font-bold">{log.recipient}</span></p>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="p-4 text-xs text-slate-700 font-semibold leading-relaxed whitespace-pre-wrap">
                      {log.message}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* TASKS CHECKLIST FOLLOW-UP */}
          {crmTab === "tasks" && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid md:grid-cols-12 gap-8"
            >
              <div className="md:col-span-4 bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-lg text-[#003A8C]">Add Follow-up Task</h3>
                <form onSubmit={handleAddTask} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Task Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Schedule call / Send draft"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Due Date</label>
                    <input
                      type="date"
                      required
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Task Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="w-full border-2 border-[#003A8C]/10 bg-white rounded-lg p-2 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingTask}
                    className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-2 rounded-lg transition-colors"
                  >
                    {isSubmittingTask ? "Saving task..." : "Add Check Task"}
                  </button>
                </form>
              </div>

              <div className="md:col-span-8 bg-white border-2 border-[#003A8C]/10 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-lg text-[#003A8C]">Follow-up Tasks Checklist</h3>
                
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-4 border border-[#003A8C]/10 rounded-xl flex items-center justify-between hover:border-[#FF6A00]/20 transition-all">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleTask(task.id, task.completed)}
                          className={`w-6 h-6 rounded-md border-2 border-[#003A8C] flex items-center justify-center transition-all ${
                            task.completed ? "bg-[#003A8C] text-white" : "bg-white"
                          }`}
                        >
                          {task.completed && <Check className="w-4 h-4 text-[#FF6A00]" />}
                        </button>
                        
                        <div className="space-y-1">
                          <p className={`text-xs font-bold ${task.completed ? "line-through text-slate-400" : "text-[#003A8C]"}`}>
                            {task.title}
                          </p>
                          <div className="flex gap-2">
                            <span className="text-[9px] font-mono text-slate-400">Due: {task.dueDate}</span>
                            <span className={`text-[9px] font-bold font-mono px-1.5 rounded uppercase ${
                              task.priority === "high" ? "bg-red-50 text-red-600" :
                              task.priority === "medium" ? "bg-orange-50 text-orange-600" :
                              "bg-slate-50 text-slate-600"
                            }`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t-2 border-[#003A8C]/10 py-6 px-8 text-center text-xs font-semibold text-[#003A8C]/60 font-mono">
        <p>© 2026 Al Aminn (crm.alaminn.info). Secured administrative access only.</p>
      </footer>
    </div>
  );
}
