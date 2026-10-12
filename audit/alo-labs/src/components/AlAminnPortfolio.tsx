import React, { useState, useEffect } from "react";
import {
  User,
  Briefcase,
  Layers,
  Sparkles,
  Calendar,
  Send,
  ArrowRight,
  CheckCircle,
  Clock,
  Phone,
  Mail,
  Lock,
  Cpu,
  Star,
  ChevronRight,
  Info,
  ShieldAlert,
  Compass,
  Database,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AlAminnPortfolioProps {
  onLoginSuccess: () => void;
  onNavigateToDomain: (domain: "crm.alaminn.info" | "api.alaminn.info") => void;
  leadsCount: number;
  onLeadAdded: () => void;
}

export default function AlAminnPortfolio({
  onLoginSuccess,
  onNavigateToDomain,
  leadsCount,
  onLeadAdded
}: AlAminnPortfolioProps) {
  const [activeSubPage, setActiveSubPage] = useState<
    "home" | "about" | "portfolio" | "services" | "ai-agent" | "book" | "contact" | "login"
  >("home");

  // Lead Form State
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadService, setLeadService] = useState("AI Agent Development");
  const [leadMessage, setLeadMessage] = useState("");
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);

  // Booking State
  const [bookingName, setBookingName] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingService, setBookingService] = useState("AI Agent Development Consultation");
  const [bookingNotes, setBookingNotes] = useState("");
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // AI Chatbot State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "agent"; text: string }>>([
    {
      sender: "agent",
      text: "Hello! I am Al Aminn's AI Ambassador. Ask me anything about Al Aminn's experience, core services, portofolio, or how he can scale your business with AgentOS automation."
    }
  ]);
  const [isGeneratingChat, setIsGeneratingChat] = useState(false);

  // Admin Login State
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const servicesList = [
    {
      title: "AI Agent Development",
      description: "Custom AI agents powered by Gemini Flash, optimized with specialized RAG (Retrieval-Augmented Generation) and autonomous loop logic.",
      price: "$1,500+",
      features: ["Custom system prompt crafting", "Semantic search indexing", "Tool deployment", "Multi-platform chat support"]
    },
    {
      title: "Custom CRM & Lead Pipelines",
      description: "Direct lead capture landing pages synchronized in real-time with administrative CRM pipelines, WhatsApp alerts, and task tracking engines.",
      price: "$2,500+",
      features: ["Real-time database synching", "Multi-tenant workspace isolation", "WhatsApp/SMS automatic templates", "Activity monitoring dashboard"]
    },
    {
      title: "Automation Workflows",
      description: "Eliminate manual effort by connecting APIs, webhooks, databases, and LLM filters into seamless background cron execution triggers.",
      price: "$1,200+",
      features: ["Cron-job orchestration", "Comprehensive failure-recovery logic", "Twilio and WhatsApp direct triggers", "Audit log persistence"]
    }
  ];

  const portfolioProjects = [
    {
      id: "p1",
      title: "AgentOS Swarm Coordinator",
      category: "AI Systems",
      desc: "Designed and built the multi-agent task execution console allowing super admins to deploy and track 2,000 autonomous agents across 100 corporate departments.",
      tech: ["React", "Express", "Gemini API", "Tailwind CSS"],
      image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600"
    },
    {
      id: "p2",
      title: "Sunderland Academy Admission Portal",
      category: "Web Applications",
      desc: "Integrated custom RAG-powered chatbot with the physical academy database to answer admission and student visa maintenance queries live.",
      tech: ["Vite", "Node.js", "Graph RAG", "PostgreSQL"],
      image: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&q=80&w=600"
    },
    {
      id: "p3",
      title: "Bilingual Reel Video Studio",
      category: "Media Automation",
      desc: "An automated shorts video builder that takes text scripts, renders talkative avatars, and synchronizes audio waveforms with high-fidelity Bangla captions.",
      tech: ["FFmpeg", "Web Speech API", "React", "Node.js"],
      image: "https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&q=80&w=600"
    }
  ];

  // Submit Lead Form
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadEmail) return;

    setIsSubmittingLead(true);
    try {
      const res = await fetch("/api/alaminn/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName,
          email: leadEmail,
          phone: leadPhone,
          service: leadService,
          message: leadMessage
        })
      });
      if (res.ok) {
        setLeadSuccess(true);
        setLeadName("");
        setLeadEmail("");
        setLeadPhone("");
        setLeadMessage("");
        onLeadAdded();
      }
    } catch (err) {
      console.error("Lead submission failed", err);
    } finally {
      setIsSubmittingLead(false);
    }
  };

  // Submit Appointment Booking
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingName || !bookingDate || !bookingTime) return;

    setIsSubmittingBooking(true);
    try {
      const res = await fetch("/api/alaminn/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: bookingName,
          date: bookingDate,
          time: bookingTime,
          service: bookingService,
          notes: bookingNotes
        })
      });
      if (res.ok) {
        setBookingSuccess(true);
        setBookingName("");
        setBookingDate("");
        setBookingTime("");
        setBookingNotes("");
      }
    } catch (err) {
      console.error("Booking submission failed", err);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // Chat with Al Aminn's AI agent
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setChatInput("");
    setIsGeneratingChat(true);

    try {
      const res = await fetch("/api/agentos/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `You are Al Aminn's AI Portfolio Ambassador. Answer this question briefly, keeping in character. Use Al Aminn's portfolio data and brand voice. Focus on Blue #003A8C, Orange #FF6A00, and White #FFFFFF themes. Query: "${userMsg}"`,
          superAdminMode: false
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { sender: "agent", text: data.explanation || data.outputContent || "I'm on it! Al Aminn specializes in custom AI agents, responsive web applications, and automated CRM setups. Let me know if you would like to book a direct consult session with him on our Book Appointment tab!" }]);
      } else {
        throw new Error("API call failed");
      }
    } catch (err) {
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: "Al Aminn is a talented Software Engineer and AI Strategist who deploys cutting-edge autonomous LLM agents (using Gemini), constructs enterprise-grade CRM structures, and writes beautiful web software. How can we help automate your operation today?"
          }
        ]);
      }, 800);
    } finally {
      setIsGeneratingChat(false);
    }
  };

  // Handle Admin Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === "admin") {
      onLoginSuccess();
      onNavigateToDomain("crm.alaminn.info");
    } else {
      setLoginError("Invalid password. Use 'admin' to log in as CRM manager.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#003A8C] font-sans flex flex-col justify-between">
      {/* PUBLIC NAVBAR */}
      <header className="sticky top-0 z-30 bg-white border-b-2 border-[#003A8C]/10 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveSubPage("home")}>
          <div className="w-10 h-10 rounded-xl bg-[#003A8C] flex items-center justify-center font-bold text-white text-lg border-2 border-[#FF6A00]">
            AA
          </div>
          <div>
            <h1 className="font-display font-extrabold text-[#003A8C] tracking-tight leading-none">
              Al Aminn
            </h1>
            <p className="text-[#FF6A00] font-bold text-[10px] tracking-wide uppercase mt-0.5">Digital & AI Specialist</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <button
            onClick={() => setActiveSubPage("home")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "home" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            Home
          </button>
          <button
            onClick={() => setActiveSubPage("about")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "about" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            About Bio
          </button>
          <button
            onClick={() => setActiveSubPage("portfolio")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "portfolio" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            Portfolio
          </button>
          <button
            onClick={() => setActiveSubPage("services")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "services" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            Services
          </button>
          <button
            onClick={() => setActiveSubPage("ai-agent")}
            className={`text-sm font-bold flex items-center gap-1.5 transition-colors ${activeSubPage === "ai-agent" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            <Sparkles className="w-4 h-4 text-[#FF6A00]" />
            AI Ambassador
          </button>
          <button
            onClick={() => setActiveSubPage("book")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "book" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            Book Strategy
          </button>
          <button
            onClick={() => setActiveSubPage("contact")}
            className={`text-sm font-bold transition-colors ${activeSubPage === "contact" ? "text-[#FF6A00]" : "text-[#003A8C]/80 hover:text-[#FF6A00]"}`}
          >
            Contact
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSubPage("login")}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#003A8C] transition-all flex items-center gap-1.5 ${
              activeSubPage === "login" ? "bg-[#003A8C] text-white" : "bg-white text-[#003A8C] hover:bg-[#FFF3E8]"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Admin Login
          </button>
        </div>
      </header>

      {/* CORE PAGE SECTIONS */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-8">
        <AnimatePresence mode="wait">
          {/* HOME LANDING */}
          {activeSubPage === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-12"
            >
              {/* Hero Row */}
              <div className="grid md:grid-cols-12 gap-8 items-center bg-white border-2 border-[#003A8C]/15 rounded-3xl p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#FFF3E8] rounded-full blur-3xl pointer-events-none" />
                
                <div className="md:col-span-7 space-y-6 relative z-10">
                  <span className="bg-[#FFF3E8] border border-[#FF6A00]/20 text-[#FF6A00] text-xs font-bold px-3 py-1.5 rounded-full font-mono uppercase tracking-widest">
                    Available for Consulting & Development
                  </span>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-[#003A8C] font-display tracking-tight leading-tight">
                    I build high-performance <span className="text-[#FF6A00]">AI Multi-Agent Swarms</span> & custom Web CRM systems.
                  </h2>
                  <p className="text-slate-600 text-lg font-medium leading-relaxed">
                    Connecting advanced AI orchestrators, custom RAG integrations, and seamless data structures to automate manual business processes at scale.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 pt-2">
                    <button
                      onClick={() => setActiveSubPage("book")}
                      className="bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                    >
                      Book 15-Min Strategy Call
                      <ArrowRight className="w-4 h-4 text-[#FF6A00]" />
                    </button>
                    <button
                      onClick={() => setActiveSubPage("ai-agent")}
                      className="bg-white hover:bg-[#FFF3E8]/30 border-2 border-[#003A8C] text-[#003A8C] font-bold text-sm px-6 py-3.5 rounded-xl transition-all flex items-center gap-2"
                    >
                      Chat with AI Assistant
                      <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                    </button>
                  </div>
                </div>

                <div className="md:col-span-5 relative z-10 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#FF6A00] rounded-3xl rotate-3 scale-102 opacity-10 animate-pulse" />
                    <div className="relative w-80 h-80 bg-white border-2 border-[#003A8C] rounded-3xl overflow-hidden shadow-xl p-3 flex flex-col justify-between">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <div className="flex gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        </div>
                        <span className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase">Digital Identity</span>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-4">
                        <div className="w-24 h-24 rounded-full bg-[#FFF3E8] border-2 border-[#FF6A00] flex items-center justify-center font-black text-[#003A8C] text-3xl">
                          AM
                        </div>
                        <div className="text-center">
                          <h4 className="font-bold text-[#003A8C] font-display text-lg">Al Aminn</h4>
                          <p className="text-xs text-slate-500 font-semibold font-mono">domain: alaminn.info</p>
                        </div>
                      </div>

                      <div className="bg-[#FFF3E8] rounded-xl p-2.5 border border-[#FF6A00]/20 text-[10px] font-semibold text-[#003A8C]/80 text-center">
                        🔒 Authenticated with ALO Labs AgentOS
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Features Bento Grid */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-[#003A8C] tracking-tight text-center uppercase font-mono">CORE SERVICES & SOLUTIONS</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="bg-white border-2 border-[#003A8C]/10 p-6 rounded-2xl space-y-4 hover:border-[#FF6A00]/40 transition-colors">
                    <div className="w-12 h-12 bg-[#FFF3E8] rounded-xl flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-[#FF6A00]" />
                    </div>
                    <h4 className="font-bold text-[#003A8C] text-lg">Autonomous AI Swarms</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      Deploy cooperative multi-agent swarms programmed to analyze queries, fetch custom compliance RAG indexes, and output pristine code artifacts instantly.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-[#003A8C]/10 p-6 rounded-2xl space-y-4 hover:border-[#FF6A00]/40 transition-colors">
                    <div className="w-12 h-12 bg-[#FFF3E8] rounded-xl flex items-center justify-center">
                      <Database className="w-6 h-6 text-[#FF6A00]" />
                    </div>
                    <h4 className="font-bold text-[#003A8C] text-lg">Integrated Web CRM</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      Capture public leads seamlessly via API endpoints, and process them in an offline-ready admin workspace featuring pipeline stages, task follow-ups, and logs.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-[#003A8C]/10 p-6 rounded-2xl space-y-4 hover:border-[#FF6A00]/40 transition-colors">
                    <div className="w-12 h-12 bg-[#FFF3E8] rounded-xl flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-[#FF6A00]" />
                    </div>
                    <h4 className="font-bold text-[#003A8C] text-lg">Enterprise AI Consulting</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      Receive expert advisory services regarding prompt architecture, database tenancy, clearance logic, and secure credential handling.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ABOUT BIO */}
          {activeSubPage === "about" && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid md:grid-cols-12 gap-8"
            >
              <div className="md:col-span-4 bg-white border-2 border-[#003A8C]/15 rounded-3xl p-6 h-fit space-y-6">
                <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-slate-100">
                  <div className="w-28 h-28 rounded-full bg-[#FFF3E8] border-2 border-[#FF6A00] flex items-center justify-center font-black text-[#003A8C] text-4xl">
                    AA
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-[#003A8C] font-display">Al Aminn</h3>
                    <p className="text-xs font-semibold text-[#FF6A00] font-mono">alamin.iubat.eee.969@gmail.com</p>
                    <p className="text-[10px] bg-[#FFF3E8] border border-[#FF6A00]/20 text-[#003A8C] font-black px-2 py-0.5 rounded-full mt-2 inline-block">
                      Senior AI & CRM Architect
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-[#003A8C]/60 font-mono uppercase tracking-wider">Expertise Tech Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {["React 19", "Vite & ESM", "Node.js", "Express API", "Gemini API", "Graph RAG", "PostgreSQL", "Tailwind CSS", "AgentOS Swarms", "Twilio SDK"].map((st) => (
                      <span key={st} className="bg-slate-50 text-[#003A8C] text-xs font-semibold px-2.5 py-1 rounded border border-slate-200">
                        {st}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:col-span-8 bg-white border-2 border-[#003A8C]/15 rounded-3xl p-8 space-y-6">
                <h2 className="text-3xl font-extrabold text-[#003A8C] font-display">Biography / Profile</h2>
                <p className="text-slate-600 font-medium leading-relaxed">
                  As an engineering specialist and developer, Al Aminn bridges the gap between structured administrative systems and dynamic generative AI capabilities. Leveraging a strong foundational background, he focuses on designing unified operating systems (AgentOS) that manage thousands of multi-lingual agents executing corporate routines autonomously.
                </p>
                <p className="text-slate-600 font-medium leading-relaxed">
                  He is the key technical pioneer behind the ALO Labs automation infrastructure and leads the deployment of responsive web systems, secure API gates, and custom customer relationship management pipelines designed for education consultancies and tech industries.
                </p>

                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <h3 className="font-bold text-lg text-[#003A8C]">Professional Milestone Highlights</h3>
                  <div className="space-y-4 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#003A8C]/20">
                    <div className="relative">
                      <span className="absolute -left-[22px] top-1.5 w-3 h-3 bg-[#FF6A00] rounded-full border-2 border-white" />
                      <h4 className="font-bold text-[#003A8C]">Chief AI Architect — ALO Labs (2024 - Present)</h4>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        Spearheaded the development of the AgentOS swarm coordination console and secure offline fallback systems, driving 99%+ compliance score ratings across 100 department workflows.
                      </p>
                    </div>
                    <div className="relative">
                      <span className="absolute -left-[22px] top-1.5 w-3 h-3 bg-[#FF6A00] rounded-full border-2 border-white" />
                      <h4 className="font-bold text-[#003A8C]">Full-Stack Systems Consultant — Freelance & SME Solutions (2021 - 2024)</h4>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        Built high-converting personal portfolios and robust Web CRM integrations for local and international brands, ensuring clean data tenancy separation and multi-channel notification loggers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* PORTFOLIO PROJECTS */}
          {activeSubPage === "portfolio" && (
            <motion.div
              key="portfolio"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 className="text-3xl font-extrabold text-[#003A8C]">Production Portfolio</h2>
                <p className="text-slate-500 font-semibold text-sm">
                  Examine Al Aminn's completed case studies showcasing high-fidelity React compilation, RAG integrations, and voice studio automation.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {portfolioProjects.map((p) => (
                  <div key={p.id} className="bg-white border-2 border-[#003A8C]/15 rounded-2xl overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all hover:border-[#FF6A00]/40">
                    <div>
                      <div className="h-44 overflow-hidden relative">
                        <img src={p.image} alt={p.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <span className="absolute top-3 left-3 bg-[#003A8C] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                          {p.category}
                        </span>
                      </div>
                      <div className="p-5 space-y-3">
                        <h4 className="font-bold text-[#003A8C] text-lg font-display">{p.title}</h4>
                        <p className="text-xs text-slate-600 font-semibold leading-relaxed">{p.desc}</p>
                      </div>
                    </div>

                    <div className="p-5 border-t border-slate-100 flex flex-col gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.tech.map((t) => (
                          <span key={t} className="bg-slate-50 text-[#003A8C] text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* SERVICES CATALOG */}
          {activeSubPage === "services" && (
            <motion.div
              key="services"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 className="text-3xl font-extrabold text-[#003A8C]">Strategic Digital Services</h2>
                <p className="text-slate-500 font-semibold text-sm">
                  Premium architecture services priced and structured transparently to scale your organizational efficiency.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {servicesList.map((srv) => (
                  <div key={srv.title} className="bg-white border-2 border-[#003A8C]/15 hover:border-[#FF6A00]/40 transition-all rounded-3xl p-6 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <h4 className="font-bold text-xl text-[#003A8C] font-display">{srv.title}</h4>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">{srv.description}</p>
                      <div className="border-t border-slate-100 pt-4 space-y-2">
                        <p className="text-[10px] font-mono uppercase text-[#003A8C]/50 font-bold">Key Deliverables:</p>
                        <ul className="space-y-1.5">
                          {srv.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                              <CheckCircle className="w-3.5 h-3.5 text-[#FF6A00] mt-0.5 shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase block">Starting at</span>
                        <span className="text-2xl font-black text-[#003A8C]">{srv.price}</span>
                      </div>
                      <button
                        onClick={() => {
                          setLeadService(srv.title);
                          setActiveSubPage("contact");
                        }}
                        className="bg-[#FFF3E8] hover:bg-[#FF6A00]/10 border border-[#FF6A00]/25 text-[#003A8C] font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
                      >
                        Inquire Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* AI AMBASSADOR INTERACTIVE PLAYGROUND */}
          {activeSubPage === "ai-agent" && (
            <motion.div
              key="ai-agent"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-extrabold text-[#003A8C] flex items-center justify-center gap-2">
                  <Sparkles className="w-7 h-7 text-[#FF6A00]" />
                  Al Aminn's AI Ambassador Agent
                </h2>
                <p className="text-slate-500 font-semibold text-sm">
                  Powered by Gemini-3.5-Flash and AgentOS memory index. Live response generation!
                </p>
              </div>

              <div className="bg-white border-2 border-[#003A8C]/15 rounded-3xl overflow-hidden shadow-sm flex flex-col h-[500px]">
                {/* Chat Header */}
                <div className="bg-[#FFF3E8] p-4 border-b border-[#FF6A00]/10 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00] animate-pulse" />
                    <span className="text-xs font-mono font-bold text-[#003A8C]">SYSTEM_AGENT_READY</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#003A8C]/60 uppercase">Clearance: Public Guest</span>
                </div>

                {/* Messages Panel */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl p-4 text-xs font-semibold leading-relaxed ${
                        m.sender === "user"
                          ? "bg-[#003A8C] text-white rounded-br-none shadow-sm"
                          : "bg-white border-2 border-[#003A8C]/10 text-slate-700 rounded-bl-none shadow-sm"
                      }`}>
                        <div className="flex items-center gap-1 mb-1 font-mono text-[9px] uppercase tracking-wide opacity-75">
                          {m.sender === "user" ? <User className="w-3 h-3" /> : <Cpu className="w-3 h-3 text-[#FF6A00]" />}
                          <span>{m.sender === "user" ? "You (Client)" : "Al Aminn Ambassador Agent"}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  ))}
                  {isGeneratingChat && (
                    <div className="flex justify-start">
                      <div className="bg-white border-2 border-[#003A8C]/10 text-slate-500 rounded-2xl rounded-bl-none p-4 text-xs font-semibold shadow-sm flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] animate-bounce [animation-delay:0.4s]" />
                        <span>Generating custom reply...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input Footer */}
                <div className="p-4 bg-white border-t border-[#003A8C]/10 flex gap-3">
                  <input
                    type="text"
                    placeholder="Ask about my biography, specific custom integrations, or pricing models..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1 border-2 border-[#003A8C]/15 focus:border-[#FF6A00] rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/10 transition-colors"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isGeneratingChat || !chatInput.trim()}
                    className="bg-[#003A8C] hover:bg-[#003A8C]/95 text-white p-3 rounded-xl transition-colors shrink-0 flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-[#FF6A00]" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* APPOINTMENT BOOKING */}
          {activeSubPage === "book" && (
            <motion.div
              key="book"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-4xl mx-auto grid md:grid-cols-12 gap-8"
            >
              <div className="md:col-span-5 space-y-6">
                <div className="bg-[#FFF3E8] border border-[#FF6A00]/25 rounded-3xl p-6 space-y-4">
                  <h3 className="font-bold text-xl text-[#003A8C] flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#FF6A00]" />
                    Book Free Consult
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                    Select an open slot to schedule a one-to-one engineering strategy consultation. We will discuss custom AgentOS implementations and automated CRM syncing.
                  </p>

                  <div className="space-y-2 border-t border-[#FF6A00]/10 pt-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Clock className="w-4 h-4 text-[#FF6A00]" />
                      <span>Duration: 15 - 30 Minutes</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Mail className="w-4 h-4 text-[#FF6A00]" />
                      <span>Medium: Google Meet Video Call</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-7 bg-white border-2 border-[#003A8C]/15 rounded-3xl p-8 shadow-sm">
                {bookingSuccess ? (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#003A8C] font-display">Appointment Booking Saved!</h3>
                    <p className="text-xs text-slate-500 font-semibold max-w-sm mx-auto">
                      Your strategy slot is locked. Al Aminn's automated system has synchronized this booking into the Personal CRM database for rapid follow-up.
                    </p>
                    <button
                      onClick={() => setBookingSuccess(false)}
                      className="bg-[#003A8C] text-white font-bold text-xs px-6 py-2.5 rounded-lg transition-colors"
                    >
                      Book Another Session
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleBookingSubmit} className="space-y-4">
                    <h4 className="font-bold text-lg text-[#003A8C]">Calendar Scheduler</h4>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Your Name</label>
                        <input
                          type="text"
                          required
                          placeholder="Your full name"
                          value={bookingName}
                          onChange={(e) => setBookingName(e.target.value)}
                          className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Target Service</label>
                        <select
                          value={bookingService}
                          onChange={(e) => setBookingService(e.target.value)}
                          className="w-full border-2 border-[#003A8C]/10 bg-white rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                        >
                          <option>AI Agent Development Consultation</option>
                          <option>Custom CRM System Design</option>
                          <option>Workflow Automation Setup</option>
                          <option>General Brand Advisory</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Select Date</label>
                        <input
                          type="date"
                          required
                          value={bookingDate}
                          onChange={(e) => setBookingDate(e.target.value)}
                          className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Select Time (GMT+6)</label>
                        <select
                          required
                          value={bookingTime}
                          onChange={(e) => setBookingTime(e.target.value)}
                          className="w-full border-2 border-[#003A8C]/10 bg-white rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                        >
                          <option value="">Choose slot</option>
                          <option value="10:00">10:00 AM</option>
                          <option value="11:30">11:30 AM</option>
                          <option value="14:00">02:00 PM</option>
                          <option value="15:30">03:30 PM</option>
                          <option value="17:00">05:00 PM</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Meeting Goals & Notes</label>
                      <textarea
                        rows={3}
                        placeholder="Detail specific bottlenecks, existing CRM toolstacks, or custom AI agent objectives..."
                        value={bookingNotes}
                        onChange={(e) => setBookingNotes(e.target.value)}
                        className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingBooking}
                      className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isSubmittingBooking ? "Booking slot..." : "Confirm Strategy Booking"}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}

          {/* CONTACT LEAD FORM */}
          {activeSubPage === "contact" && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-xl mx-auto bg-white border-2 border-[#003A8C]/15 rounded-3xl p-8 shadow-sm"
            >
              {leadSuccess ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#003A8C] font-display">Inquiry Received Successfully!</h3>
                  <p className="text-xs text-slate-500 font-semibold max-w-sm mx-auto">
                    Thank you, your message was recorded. It has been synced directly with Al Aminn's Personal CRM Database for swift follow-up within 12 hours.
                  </p>
                  <button
                    onClick={() => setLeadSuccess(false)}
                    className="bg-[#003A8C] text-white font-bold text-xs px-6 py-2.5 rounded-lg transition-colors"
                  >
                    Send Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-extrabold text-[#003A8C] font-display">Get in Touch</h3>
                    <p className="text-xs text-slate-500 font-semibold">
                      Submit your project outline to register as a lead. No placeholder values permitted.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Your Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sajid Hasan"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. sajid@gmail.com"
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Phone / WhatsApp</label>
                      <input
                        type="tel"
                        placeholder="e.g. +8801700000000"
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Requested Core Service</label>
                    <select
                      value={leadService}
                      onChange={(e) => setLeadService(e.target.value)}
                      className="w-full border-2 border-[#003A8C]/10 bg-white rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    >
                      <option>AI Agent Development</option>
                      <option>Custom CRM & Lead Pipelines</option>
                      <option>Automation Workflows</option>
                      <option>General Consultancy / Advisory</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Detailed Inquiry Message</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Please clarify requirements, scope, target schedule, and any automation needs..."
                      value={leadMessage}
                      onChange={(e) => setLeadMessage(e.target.value)}
                      className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingLead}
                    className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5 text-[#FF6A00]" />
                    {isSubmittingLead ? "Recording Inquiry..." : "Submit Project Inquiry"}
                  </button>
                </form>
              )}
            </motion.div>
          )}

          {/* ADMIN LOGIN */}
          {activeSubPage === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-md mx-auto bg-white border-2 border-[#003A8C]/15 rounded-3xl p-8 shadow-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-[#FFF3E8] rounded-2xl flex items-center justify-center mx-auto border border-[#FF6A00]/25">
                  <Lock className="w-6 h-6 text-[#FF6A00]" />
                </div>
                <h3 className="text-xl font-bold text-[#003A8C] font-display">Personal CRM Gatekeeper</h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Authentication is required to access Al Aminn's private lead dashboards.
                </p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-[#003A8C]/60 font-bold uppercase block">Enter Password</label>
                    <span className="text-[9px] text-[#FF6A00] font-black font-mono">Password Hint: admin</span>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full border-2 border-[#003A8C]/10 rounded-lg p-2.5 text-xs font-semibold focus:outline-none focus:border-[#FF6A00]"
                  />
                </div>

                {loginError && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-3 rounded-lg transition-colors"
                >
                  Verify & Enter CRM Dashboard
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* PUBLIC FOOTER */}
      <footer className="bg-white border-t-2 border-[#003A8C]/10 py-6 px-8 text-center text-xs font-semibold text-[#003A8C]/60 font-mono">
        <p>© 2026 Al Aminn (alaminn.info). Verified by AgentOS Secure Swarms.</p>
      </footer>
    </div>
  );
}
