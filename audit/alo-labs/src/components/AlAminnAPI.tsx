import React, { useState } from "react";
import {
  Code,
  Globe,
  Database,
  Terminal,
  Play,
  Copy,
  CheckCircle,
  Cpu,
  Info,
  Server,
  CornerDownRight
} from "lucide-react";

export default function AlAminnAPI() {
  const [selectedMethod, setSelectedMethod] = useState<"GET_LEADS" | "POST_LEAD" | "GET_APPTS" | "GET_LOGS">("GET_LEADS");
  const [responseCode, setResponseCode] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // New Lead Post Form state
  const [postName, setPostName] = useState("Abeer Rahman");
  const [postEmail, setPostEmail] = useState("abeer@domain.com");
  const [postService, setPostService] = useState("AI Agent Development");
  const [postMessage, setPostMessage] = useState("Let's build a multi-agent RAG workflow!");

  const apiEndpoints = [
    {
      id: "GET_LEADS",
      method: "GET",
      url: "/api/alaminn/leads",
      desc: "Retrieve Al Aminn's complete private pipeline leads directory.",
      params: []
    },
    {
      id: "POST_LEAD",
      method: "POST",
      url: "/api/alaminn/leads",
      desc: "Insert a new inquiry lead record into the database.",
      params: ["name", "email", "phone", "service", "message"]
    },
    {
      id: "GET_APPTS",
      method: "GET",
      url: "/api/alaminn/appointments",
      desc: "Fetch all active strategy appointments and consultation times.",
      params: []
    },
    {
      id: "GET_LOGS",
      method: "GET",
      url: "/api/alaminn/logs",
      desc: "Retrieve historical communication logs (Email/WhatsApp summaries).",
      params: []
    }
  ];

  const handleExecute = async () => {
    setIsLoading(true);
    setResponseCode(null);
    setResponseJson(null);

    try {
      let url = "";
      let options: any = { method: "GET" };

      if (selectedMethod === "GET_LEADS") {
        url = "/api/alaminn/leads";
      } else if (selectedMethod === "GET_APPTS") {
        url = "/api/alaminn/appointments";
      } else if (selectedMethod === "GET_LOGS") {
        url = "/api/alaminn/logs";
      } else if (selectedMethod === "POST_LEAD") {
        url = "/api/alaminn/leads";
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: postName,
            email: postEmail,
            phone: "+8801555555555",
            service: postService,
            message: postMessage
          })
        };
      }

      const res = await fetch(url, options);
      setResponseCode(res.status);
      const data = await res.json();
      setResponseJson(data);
    } catch (err) {
      setResponseCode(500);
      setResponseJson({ error: "Failed to connect to API server node.", details: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!responseJson) return;
    navigator.clipboard.writeText(JSON.stringify(responseJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#003A8C] font-sans flex flex-col justify-between">
      {/* API HEADER */}
      <header className="sticky top-0 z-30 bg-white border-b-2 border-[#003A8C]/10 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003A8C] flex items-center justify-center font-bold text-white text-lg border-2 border-[#FF6A00]">
            API
          </div>
          <div>
            <h1 className="font-display font-extrabold text-[#003A8C] tracking-tight leading-none flex items-center gap-2">
              Al Aminn CRM REST API Gateway
              <span className="bg-[#FF6A00] text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-widest">
                LIVE
              </span>
            </h1>
            <p className="text-[#FF6A00] font-bold text-[10px] tracking-widest uppercase mt-0.5 font-mono">
              api.alaminn.info
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#003A8C]/60 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          <Server className="w-3.5 h-3.5 text-[#FF6A00]" />
          <span>Status: ACTIVE (NODE_OK)</span>
        </div>
      </header>

      {/* API MAIN HUB */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-8 grid md:grid-cols-12 gap-8">
        
        {/* Left Column: API Directory Selector */}
        <div className="md:col-span-5 space-y-6">
          <div className="bg-white border-2 border-[#003A8C]/15 rounded-3xl p-6 space-y-4 shadow-sm">
            <h3 className="font-bold text-lg text-[#003A8C] flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#FF6A00]" />
              API Directory Documentation
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Al Aminn's Web CRM exposes granular RESTful endpoints using ESM module specifications. Choose an endpoint to test live connections on our active development partition.
            </p>

            <div className="space-y-3">
              {apiEndpoints.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedMethod(e.id as any); setResponseJson(null); setResponseCode(null); }}
                  className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex flex-col space-y-2 ${
                    selectedMethod === e.id
                      ? "bg-[#FFF3E8] border-[#FF6A00] text-[#003A8C]"
                      : "bg-white border-slate-100 hover:border-[#003A8C]/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded ${
                      e.method === "GET" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {e.method}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#003A8C]">{e.url}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">{e.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Executer & Code JSON Viewer */}
        <div className="md:col-span-7 space-y-6">
          <div className="bg-white border-2 border-[#003A8C]/15 rounded-3xl p-6 shadow-sm space-y-6 flex flex-col justify-between min-h-[450px]">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-[#003A8C] flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#FF6A00]" />
                  API Command sandbox
                </h3>
                <span className="font-mono text-[10px] text-slate-400 font-bold uppercase">Sandbox Node V19</span>
              </div>

              {/* POST Parameter Configurator if selected POST */}
              {selectedMethod === "POST_LEAD" && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs font-semibold">
                  <p className="font-mono text-[9px] uppercase text-[#FF6A00] font-bold">Configure Payload parameters</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase">Client Name</label>
                      <input
                        type="text"
                        value={postName}
                        onChange={(e) => setPostName(e.target.value)}
                        className="w-full border border-slate-200 bg-white rounded p-2 text-xs font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase">Client Email</label>
                      <input
                        type="email"
                        value={postEmail}
                        onChange={(e) => setPostEmail(e.target.value)}
                        className="w-full border border-slate-200 bg-white rounded p-2 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase">Requested Service</label>
                      <select
                        value={postService}
                        onChange={(e) => setPostService(e.target.value)}
                        className="w-full border border-slate-200 bg-white rounded p-2 text-xs font-semibold"
                      >
                        <option>AI Agent Development</option>
                        <option>Custom CRM & Lead Pipelines</option>
                        <option>Automation Workflows</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase">Inquiry message</label>
                      <input
                        type="text"
                        value={postMessage}
                        onChange={(e) => setPostMessage(e.target.value)}
                        className="w-full border border-slate-200 bg-white rounded p-2 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleExecute}
                disabled={isLoading}
                className="w-full bg-[#003A8C] hover:bg-[#003A8C]/95 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <Play className="w-4 h-4 text-[#FF6A00] fill-[#FF6A00]" />
                {isLoading ? "Executing HTTP Call..." : "Execute Request (Real HTTP Live Call)"}
              </button>
            </div>

            {/* LIVE RESPONSE WINDOW */}
            <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-[#0A192F] text-slate-100 flex-1 flex flex-col justify-between mt-4">
              <div className="bg-[#112240] p-3 border-b border-slate-800 flex justify-between items-center text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 font-bold">
                  <CornerDownRight className="w-3.5 h-3.5 text-[#FF6A00]" />
                  RESPONSE LOG
                </span>
                {responseCode && (
                  <span className={`font-bold ${responseCode < 300 ? "text-green-400" : "text-red-400"}`}>
                    HTTP {responseCode} {responseCode === 200 ? "OK" : responseCode === 201 ? "CREATED" : "ERROR"}
                  </span>
                )}
              </div>

              <div className="p-4 overflow-auto max-h-[250px] font-mono text-xs text-left leading-relaxed text-slate-300">
                {isLoading ? (
                  <p className="text-slate-400 animate-pulse font-bold">Awaiting server handshake... resolving database...</p>
                ) : responseJson ? (
                  <pre className="whitespace-pre-wrap">{JSON.stringify(responseJson, null, 2)}</pre>
                ) : (
                  <p className="text-slate-500 font-bold italic">No request executed yet. Click execute to make a real server API call.</p>
                )}
              </div>

              {responseJson && (
                <div className="bg-[#112240] p-2 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 bg-[#0a192f] hover:bg-[#003A8C]/20 text-slate-400 hover:text-white font-bold text-[10px] px-2.5 py-1.5 rounded transition-colors"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        Copied Payload
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        Copy Response JSON
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t-2 border-[#003A8C]/10 py-6 px-8 text-center text-xs font-semibold text-[#003A8C]/60 font-mono">
        <p>© 2026 Al Aminn (api.alaminn.info). Developer REST Gateway V1.</p>
      </footer>
    </div>
  );
}
