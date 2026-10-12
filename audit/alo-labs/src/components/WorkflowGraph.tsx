import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Cpu,
  Zap,
  Activity,
  Maximize,
  Minimize2,
  Info,
  ChevronRight,
  Settings,
  Link,
  PlusCircle,
  HelpCircle,
  Terminal,
  Clock,
  RefreshCw,
  X,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Agent, WorkflowPipeline } from "../data";

interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  agent: string;
  action: string;
  timeout: number;
  retries: number;
  status: "idle" | "running" | "success" | "failed";
  desc: string;
  dependencies: string[];
}

interface WorkflowGraphProps {
  selectedWorkflow: WorkflowPipeline;
  agents: Agent[];
  onLogMessage: (msg: string, type?: "success" | "warning" | "info" | "error") => void;
  onUpdateWorkflowSteps: (wfId: string, steps: string[]) => void;
}

// Preset DAG datasets mapping to the workflows
const PRESET_DAGS: Record<string, GraphNode[]> = {
  wf_01: [
    { id: "node_1", name: "Web Hook Ingestion", x: 60, y: 150, agent: "Master Boss Agent V3", action: "Trigger", timeout: 15, retries: 0, status: "idle", desc: "Ingests client leads from web forms and schedules routing checks.", dependencies: [] },
    { id: "node_2", name: "Calculate Lead Score", x: 300, y: 150, agent: "Vite Builder Agent", action: "Evaluation", timeout: 30, retries: 2, status: "idle", desc: "Analyzes lead profile, academy ranking, and financial details to score visa success probability.", dependencies: ["node_1"] },
    { id: "node_3", name: "Notify Counselor on Slack", x: 560, y: 50, agent: "Jailbreak Watchdog Agent", action: "Notification", timeout: 10, retries: 1, status: "idle", desc: "Pings assigned study abroad agent with score report and direct lead link.", dependencies: ["node_2"] },
    { id: "node_4", name: "Send WhatsApp Welcome", x: 560, y: 250, agent: "Bilingual Script Creator", action: "Messaging", timeout: 45, retries: 3, status: "idle", desc: "Drafts a personalized bilingual welcoming message and dispatches via Twilio API.", dependencies: ["node_2"] },
    { id: "node_5", name: "CRM Sync Ledger", x: 820, y: 150, agent: "Commission Reconciler", action: "Database", timeout: 20, retries: 1, status: "idle", desc: "Synchronizes the newly scored lead and assigned counselor details with CRM server.", dependencies: ["node_3", "node_4"] }
  ],
  wf_02: [
    { id: "node_1", name: "Weekly Scheduler", x: 60, y: 150, agent: "Master Boss Agent V3", action: "Scheduler", timeout: 10, retries: 0, status: "idle", desc: "Daily/weekly cron check triggers to search current trending topics for study abroad reels.", dependencies: [] },
    { id: "node_2", name: "Check Topic Backlog", x: 280, y: 150, agent: "Bilingual Script Creator", action: "RAG Query", timeout: 20, retries: 1, status: "idle", desc: "Queries RAG database for active university guideline updates or student pain points.", dependencies: ["node_1"] },
    { id: "node_3", name: "Generate Script (Gemini)", x: 500, y: 150, agent: "Bilingual Script Creator", action: "AI Generation", timeout: 60, retries: 2, status: "idle", desc: "Leverages Gemini-2.5-Pro to draft an engaging 60-second talking-head video script with hooks.", dependencies: ["node_2"] },
    { id: "node_4", name: "Voice Render (Audio)", x: 740, y: 50, agent: "Bilingual Script Creator", action: "Synthesis", timeout: 30, retries: 1, status: "idle", desc: "Renders text script into natural Bangla/English speech using Edge TTS synthesis engine.", dependencies: ["node_3"] },
    { id: "node_5", name: "Image Generation", x: 740, y: 250, agent: "Vite Builder Agent", action: "Graphics", timeout: 40, retries: 2, status: "idle", desc: "Generates high-contrast matching illustration frames for short-form video overlays.", dependencies: ["node_3"] },
    { id: "node_6", name: "Assemble Video Package", x: 980, y: 150, agent: "Vite Builder Agent", action: "Rendering", timeout: 120, retries: 1, status: "idle", desc: "Combines audio track, visual overlays, and subtitle frames into final video file.", dependencies: ["node_4", "node_5"] },
    { id: "node_7", name: "Upload to Approval Queue", x: 1200, y: 150, agent: "Jailbreak Watchdog Agent", action: "Approval Queue", timeout: 15, retries: 0, status: "idle", desc: "Submits video draft and safety payload checklist to Super Admin approval board.", dependencies: ["node_6"] }
  ],
  wf_03: [
    { id: "node_1", name: "Cron Daily Trigger", x: 60, y: 150, agent: "Master Boss Agent V3", action: "Scheduler", timeout: 10, retries: 0, status: "idle", desc: "Triggers daily automated main ledger security and files audit tasks at midnight.", dependencies: [] },
    { id: "node_2", name: "Gzip Audit Logs", x: 300, y: 50, agent: "Jailbreak Watchdog Agent", action: "Log Rotation", timeout: 30, retries: 2, status: "idle", desc: "Aggregates and compresses daily access and interception logs into encrypted security packages.", dependencies: ["node_1"] },
    { id: "node_3", name: "Database Gzip Export", x: 300, y: 150, agent: "Commission Reconciler", action: "Database Backup", timeout: 45, retries: 1, status: "idle", desc: "Generates compressed PostgreSQL schemas and transactions log backups to secure cold store.", dependencies: ["node_1"] },
    { id: "node_4", name: "Flush Temp Video Cache", x: 300, y: 250, agent: "Vite Builder Agent", action: "Cleanup", timeout: 20, retries: 1, status: "idle", desc: "Identifies and deletes transient video compilation frames older than 24 hours to clear space.", dependencies: ["node_1"] },
    { id: "node_5", name: "Bundle Backup Archive", x: 560, y: 150, agent: "Vite Builder Agent", action: "Compression", timeout: 60, retries: 2, status: "idle", desc: "Amalgamates database export, safety logs, and configuration state files into single container.", dependencies: ["node_2", "node_3", "node_4"] },
    { id: "node_6", name: "Send Slack Confirmation", x: 820, y: 150, agent: "Jailbreak Watchdog Agent", action: "Notification", timeout: 15, retries: 1, status: "idle", desc: "Pings server status channel on Slack with MD5 checksum verification of the backup bundle.", dependencies: ["node_5"] }
  ]
};

export default function WorkflowGraph({ selectedWorkflow, agents, onLogMessage, onUpdateWorkflowSteps }: WorkflowGraphProps) {
  // Store separate nodes state for each workflow ID
  const [graphs, setGraphs] = useState<Record<string, GraphNode[]>>(PRESET_DAGS);
  
  // Active workflow nodes list
  const nodes = graphs[selectedWorkflow.id] || [];

  // Navigation / Canvas manipulation
  const [zoom, setZoom] = useState<number>(0.95);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 40 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Dragging individual nodes
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Execution simulation state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [simulationLogs, setSimulationLogs] = useState<Array<{ id: string; msg: string; type: "info" | "success" | "error" | "warn" }>>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Auto-align nodes on select workflow or manual trigger
  useEffect(() => {
    setSelectedNodeId(null);
    setSimulationLogs([]);
    setIsExecuting(false);
    resetSimulationState();
  }, [selectedWorkflow.id]);

  // Reset the "status" of all nodes back to idle
  const resetSimulationState = () => {
    setGraphs((prev) => {
      const updated = { ...prev };
      if (updated[selectedWorkflow.id]) {
        updated[selectedWorkflow.id] = updated[selectedWorkflow.id].map((node) => ({
          ...node,
          status: "idle"
        }));
      }
      return updated;
    });
    setSimulationLogs([]);
    setIsExecuting(false);
  };

  // Safe wrapper to update state for currently active workflow
  const updateActiveNodes = (updater: (nodes: GraphNode[]) => GraphNode[]) => {
    setGraphs((prev) => {
      const currentNodes = prev[selectedWorkflow.id] || [];
      const updatedNodes = updater(currentNodes);
      
      // Keep main App state up to date with the linear equivalents of steps
      const stepNames = updatedNodes.map(n => n.name);
      onUpdateWorkflowSteps(selectedWorkflow.id, stepNames);

      return {
        ...prev,
        [selectedWorkflow.id]: updatedNodes
      };
    });
  };

  // Add Log specifically inside our visual terminal
  const addSimLog = (msg: string, type: "info" | "success" | "error" | "warn" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setSimulationLogs((prev) => [...prev, { id: Math.random().toString(), msg: `[${timestamp}] ${msg}`, type }]);
  };

  // Drag Canvas background to PAN
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If we click inside an SVG node or panel, don't pan
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).classList.contains("grid-bg-overlay")) {
      return;
    }
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else if (draggingNodeId) {
      // Dragging a specific node
      const currentNodes = graphs[selectedWorkflow.id] || [];
      const node = currentNodes.find(n => n.id === draggingNodeId);
      if (node) {
        // Translate client position back through zoom and pan adjustments
        const containerRect = canvasRef.current?.getBoundingClientRect();
        if (containerRect) {
          const rawX = (e.clientX - containerRect.left - pan.x) / zoom;
          const rawY = (e.clientY - containerRect.top - pan.y) / zoom;
          
          updateActiveNodes(prev => prev.map(n => {
            if (n.id === draggingNodeId) {
              return {
                ...n,
                x: Math.round(rawX - nodeDragOffset.x),
                y: Math.round(rawY - nodeDragOffset.y)
              };
            }
            return n;
          }));
        }
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  };

  // Node Drag Trigger
  const handleNodeMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);

    // Calculate mouse click offset relative to node center/top-left to avoid jumping
    const containerRect = canvasRef.current?.getBoundingClientRect();
    if (containerRect) {
      const rawX = (e.clientX - containerRect.left - pan.x) / zoom;
      const rawY = (e.clientY - containerRect.top - pan.y) / zoom;
      setNodeDragOffset({
        x: rawX - node.x,
        y: rawY - node.y
      });
    }
  };

  // Node Editing Helpers
  const handleUpdateNodeField = (nodeId: string, field: keyof GraphNode, value: any) => {
    updateActiveNodes(prev => prev.map(n => n.id === nodeId ? { ...n, [field]: value } : n));
  };

  // Add dependency to selected node
  const handleAddDependency = (nodeId: string, targetDepId: string) => {
    if (nodeId === targetDepId) return; // Self dependency guard
    updateActiveNodes(prev => prev.map(n => {
      if (n.id === nodeId && !n.dependencies.includes(targetDepId)) {
        return {
          ...n,
          dependencies: [...n.dependencies, targetDepId]
        };
      }
      return n;
    }));
    addSimLog(`Linked dependency: ${nodes.find(n => n.id === targetDepId)?.name} ➔ ${nodes.find(n => n.id === nodeId)?.name}`, "info");
  };

  // Remove dependency from selected node
  const handleRemoveDependency = (nodeId: string, targetDepId: string) => {
    updateActiveNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          dependencies: n.dependencies.filter(id => id !== targetDepId)
        };
      }
      return n;
    }));
    addSimLog(`Removed link dependency between node steps`, "warn");
  };

  // Add New Step Node
  const handleAddNewNode = () => {
    const id = `node_custom_${Math.random().toString(36).substring(2, 6)}`;
    const x = 400 + (Math.random() * 100 - 50);
    const y = 200 + (Math.random() * 100 - 50);
    const newNode: GraphNode = {
      id,
      name: `Custom Automated Step ${nodes.length + 1}`,
      x,
      y,
      agent: agents[0]?.name || "Master Boss Agent V3",
      action: "Custom Lambda",
      timeout: 30,
      retries: 1,
      status: "idle",
      desc: "Autogenerated dynamic pipeline task. Configurable via side administrative console.",
      dependencies: []
    };

    updateActiveNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
    addSimLog(`Created new node step: "${newNode.name}"`, "success");
    onLogMessage(`Appended visual node task to ${selectedWorkflow.name} model`, "info");
  };

  // Delete Node
  const handleDeleteNode = (nodeId: string) => {
    updateActiveNodes(prev => {
      // Filter out node
      let filtered = prev.filter(n => n.id !== nodeId);
      // Clean up orphaned dependencies
      filtered = filtered.map(n => ({
        ...n,
        dependencies: n.dependencies.filter(depId => depId !== nodeId)
      }));
      return filtered;
    });

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    addSimLog(`Deleted node step: ID ${nodeId}`, "warn");
    onLogMessage(`Pruned node step from pipeline registry`, "warning");
  };

  // Execution algorithm: directed acyclic simulation
  const handleRunSimulation = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setSimulationLogs([]);
    onLogMessage(`Initiating live n8n pipeline orchestration trace: ${selectedWorkflow.name}`, "info");
    addSimLog(`System initializing workflow pipeline: "${selectedWorkflow.name}"`, "info");
    addSimLog(`Total pipeline tasks registered: ${nodes.length}`, "info");

    // Initialize all as "idle"
    let workingNodes = nodes.map(n => ({ ...n, status: "idle" as const }));
    setGraphs(prev => ({ ...prev, [selectedWorkflow.id]: workingNodes }));

    const maxLoops = 20; // Safety halt
    let loops = 0;

    while (workingNodes.some(n => n.status === "idle" || n.status === "running") && loops < maxLoops) {
      loops++;
      const currentRoundNodes = [...workingNodes];

      // Identify nodes that are ready to run:
      // Status is idle, and all dependencies are success
      const readyNodes = currentRoundNodes.filter(n => {
        if (n.status !== "idle") return false;
        if (n.dependencies.length === 0) return true;
        return n.dependencies.every(depId => {
          const depNode = currentRoundNodes.find(dn => dn.id === depId);
          return depNode && depNode.status === "success";
        });
      });

      if (readyNodes.length === 0) {
        // Check if there are still idle nodes but no nodes ready.
        // That means we have a cyclic dependency lock or disconnected node.
        const remainingIdle = currentRoundNodes.filter(n => n.status === "idle");
        if (remainingIdle.length > 0) {
          addSimLog(`Cyclic dependency or unresolvable lock detected! Unresolved tasks: ${remainingIdle.map(r => r.name).join(", ")}`, "error");
          // Mark unresolved as failed
          workingNodes = workingNodes.map(n => n.status === "idle" ? { ...n, status: "failed" } : n);
          setGraphs(prev => ({ ...prev, [selectedWorkflow.id]: workingNodes }));
        }
        break;
      }

      // Mark ready nodes as "running"
      readyNodes.forEach(node => {
        addSimLog(`Task [${node.action}] "${node.name}" triggered. Delegating control to Agent: ${node.agent}`, "info");
        workingNodes = workingNodes.map(n => n.id === node.id ? { ...n, status: "running" as const } : n);
      });
      setGraphs(prev => ({ ...prev, [selectedWorkflow.id]: workingNodes }));

      // Wait 1.5 seconds to simulate agent execution
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mark running nodes as "success"
      readyNodes.forEach(node => {
        addSimLog(`✓ Task "${node.name}" completed successfully. Performance: 100% trace approval. Timeout check: OK (${node.timeout}s).`, "success");
        workingNodes = workingNodes.map(n => n.id === node.id ? { ...n, status: "success" as const } : n);
      });
      setGraphs(prev => ({ ...prev, [selectedWorkflow.id]: workingNodes }));
    }

    setIsExecuting(false);
    
    const allSuccessful = workingNodes.every(n => n.status === "success");
    if (allSuccessful) {
      addSimLog(`🎉 All pipeline steps executed successfully with 100% telemetry logs reported.`, "success");
      onLogMessage(`Successfully executed workflow pipeline: ${selectedWorkflow.name}`, "success");
    } else {
      addSimLog(`❌ Pipeline finished with execution failures. Ensure node graph dependencies are properly linked.`, "error");
      onLogMessage(`Workflow pipeline halted due to unresolved node dependencies.`, "error");
    }
  };

  // Zoom controls
  const zoomIn = () => setZoom(z => Math.min(2, z + 0.15));
  const zoomOut = () => setZoom(z => Math.max(0.5, z - 0.15));
  const resetZoomPan = () => {
    setZoom(0.95);
    setPan({ x: 30, y: 40 });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6 flex flex-col h-[650px] shadow-2xl relative">
      <style>{`
        @keyframes flow-active {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -32;
          }
        }
        @keyframes flow-success {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -24;
          }
        }
        @keyframes flow-pending {
          0%, 100% {
            stroke-dashoffset: 0;
            stroke-opacity: 0.5;
          }
          50% {
            stroke-dashoffset: -12;
            stroke-opacity: 0.9;
          }
        }
        @keyframes glow-pulse-orange {
          0%, 100% {
            filter: drop-shadow(0 0 1px rgba(255, 106, 0, 0.4));
          }
          50% {
            filter: drop-shadow(0 0 5px rgba(255, 106, 0, 0.8));
          }
        }
        @keyframes glow-pulse-green {
          0%, 100% {
            filter: drop-shadow(0 0 1px rgba(16, 185, 129, 0.3));
          }
          50% {
            filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.7));
          }
        }
        @keyframes glow-pulse-blue {
          0%, 100% {
            filter: drop-shadow(0 0 1px rgba(0, 119, 255, 0.2));
          }
          50% {
            filter: drop-shadow(0 0 3px rgba(0, 119, 255, 0.5));
          }
        }
      `}</style>
      
      {/* Top Header bar with controllers */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-500 animate-pulse" />
          <div>
            <h3 className="text-sm font-semibold text-white font-display">Workflow Dependency Graph & Node Editor</h3>
            <p className="text-[11px] text-slate-400">Interactively configure tasks, drag elements, align branching logic, and run n8n simulation logs.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddNewNode}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-bold px-3 py-1.5 rounded transition"
          >
            <Plus className="w-3.5 h-3.5 text-orange-400" />
            Add Step Node
          </button>

          <button
            onClick={resetSimulationState}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold px-3 py-1.5 rounded transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset State
          </button>

          <button
            onClick={handleRunSimulation}
            disabled={isExecuting || nodes.length === 0}
            className={`flex items-center gap-1.5 text-slate-950 text-xs font-bold px-4 py-1.5 rounded transition ${
              isExecuting || nodes.length === 0
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md shadow-orange-500/10"
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${isExecuting ? "animate-ping" : ""}`} />
            {isExecuting ? "Executing Simulation..." : "Execute Live Pipeline"}
          </button>
        </div>
      </div>

      {/* Main Grid Canvas Body */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Visual Graph Canvas area */}
        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden h-full select-none"
          style={{
            backgroundImage: "radial-gradient(rgba(0, 58, 140, 0.15) 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px"
          }}
        >
          {/* Inner zoom/pan wrapper */}
          <div
            className="absolute origin-top-left w-[2000px] h-[1000px] pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
            {/* SVG Connecting Paths Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-auto">
              <defs>
                {/* Arrow Marker for links */}
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#003A8C" />
                </marker>
                
                {/* Glowing Active Arrow Marker */}
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#003A8C" />
                </marker>

                {/* Pending Arrow Marker */}
                <marker
                  id="arrow-pending"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#FF6A00" />
                </marker>

                {/* Success Arrow Marker */}
                <marker
                  id="arrow-success"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#003A8C" />
                </marker>

                {/* Failed Arrow Marker */}
                <marker
                  id="arrow-failed"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#FF6A00" />
                </marker>

                {/* Neon Glow Filters */}
                <filter id="neon-glow-orange" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-green" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Render Connection Curves */}
              {nodes.map(node => {
                return node.dependencies.map(depId => {
                  const parent = nodes.find(n => n.id === depId);
                  if (!parent) return null;

                  // Outgoing coordinates from parent (right middle edge)
                  const startX = parent.x + 220;
                  const startY = parent.y + 40;

                  // Incoming coordinates to node (left middle edge)
                  const endX = node.x;
                  const endY = node.y + 40;

                  // Control points for smooth bezier curves
                  const dx = Math.abs(endX - startX) * 0.5;
                  const cp1X = startX + dx;
                  const cp1Y = startY;
                  const cp2X = endX - dx;
                  const cp2Y = endY;

                  // Path d string
                  const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

                  // Determine connection state
                  let status: "active" | "pending" | "completed" | "failed" | "idle" = "idle";
                  if (parent.status === "success" && node.status === "success") {
                    status = "completed";
                  } else if (parent.status === "success" && node.status === "running") {
                    status = "active";
                  } else if (parent.status === "running") {
                    status = "active";
                  } else if (parent.status === "success" && node.status === "idle") {
                    status = "pending";
                  } else if (parent.status === "failed" || node.status === "failed") {
                    status = "failed";
                  }

                  // Config values based on status
                  let strokeColor = "#003A8C";
                  let strokeWidth = 2.2;
                  let marker = "url(#arrow)";
                  let strokeDasharray = undefined;
                  let style: React.CSSProperties = {};
                  let showPackets = false;
                  let packetColor = "#003A8C";

                  if (status === "active") {
                    strokeColor = "#003A8C";
                    strokeWidth = 3;
                    marker = "url(#arrow-active)";
                    strokeDasharray = "8, 4";
                    style = {
                      animation: "flow-active 0.8s linear infinite, glow-pulse-blue 1.5s ease-in-out infinite"
                    };
                    showPackets = true;
                    packetColor = "#003A8C";
                  } else if (status === "completed") {
                    strokeColor = "#003A8C";
                    strokeWidth = 2.5;
                    marker = "url(#arrow-success)";
                    strokeDasharray = "12, 6";
                    style = {
                      animation: "flow-success 2s linear infinite, glow-pulse-blue 2.5s ease-in-out infinite"
                    };
                    showPackets = true;
                    packetColor = "#003A8C";
                  } else if (status === "pending") {
                    strokeColor = "#FF6A00";
                    strokeWidth = 2;
                    marker = "url(#arrow-pending)";
                    strokeDasharray = "6, 6";
                    style = {
                      animation: "flow-pending 1.8s ease-in-out infinite, glow-pulse-orange 2s ease-in-out infinite"
                    };
                  } else if (status === "failed") {
                    strokeColor = "#FF6A00";
                    strokeWidth = 2;
                    marker = "url(#arrow-failed)";
                    strokeDasharray = "3, 5";
                  }

                  return (
                    <g key={`${depId}-${node.id}`}>
                      {/* Interactive background fat path to click and select/interact */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        className="cursor-pointer hover:stroke-slate-800/40 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          addSimLog(`Selected dependency link connecting "${parent.name}" ➔ "${node.name}" (Status: ${status.toUpperCase()})`, "info");
                        }}
                      />
                      
                      {/* Neon glow drop shadow underlay path */}
                      {(status === "active" || status === "completed" || status === "pending") && (
                        <path
                          d={pathData}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={strokeWidth * 2.2}
                          opacity={0.15}
                          style={{
                            filter: status === "active" ? "url(#neon-glow-orange)" : status === "completed" ? "url(#neon-glow-green)" : "url(#neon-glow-blue)"
                          }}
                        />
                      )}

                      {/* Visual Path Line */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        markerEnd={marker}
                        strokeDasharray={strokeDasharray}
                        style={style}
                        className="transition-all duration-300"
                      />

                      {/* Dynamic flying data packets showing direction of flow */}
                      {showPackets && (
                        <g>
                          {/* Packet 1 */}
                          <circle r="4.2" fill={packetColor} className="opacity-95">
                            <animateMotion
                              dur={status === "active" ? "1.6s" : "2.6s"}
                              repeatCount="indefinite"
                              path={pathData}
                              begin="0s"
                            />
                          </circle>

                          {/* Packet 2 */}
                          <circle r="3.2" fill={packetColor} opacity={0.7}>
                            <animateMotion
                              dur={status === "active" ? "1.6s" : "2.6s"}
                              repeatCount="indefinite"
                              path={pathData}
                              begin={status === "active" ? "0.55s" : "0.9s"}
                            />
                          </circle>

                          {/* Packet 3 */}
                          <circle r="2.2" fill={packetColor} opacity={0.4}>
                            <animateMotion
                              dur={status === "active" ? "1.6s" : "2.6s"}
                              repeatCount="indefinite"
                              path={pathData}
                              begin={status === "active" ? "1.1s" : "1.8s"}
                            />
                          </circle>
                        </g>
                      )}
                    </g>
                  );
                });
              })}
            </svg>

            {/* Floating Div-based Nodes */}
            <div className="absolute inset-0 pointer-events-none">
              {nodes.map(node => {
                const isSelected = node.id === selectedNodeId;
                
                // Style node based on state
                let borderColor = "border-slate-800";
                let glowColor = "";
                let badgeStyle = "bg-slate-900 border-slate-700 text-slate-400";
                let badgeText = "Idle";

                if (node.status === "running") {
                  borderColor = "border-orange-500";
                  glowColor = "shadow-lg shadow-orange-500/20";
                  badgeStyle = "bg-orange-500/10 border-orange-500/20 text-orange-400 animate-pulse";
                  badgeText = "Running";
                } else if (node.status === "success") {
                  borderColor = "border-emerald-500";
                  glowColor = "shadow-md shadow-emerald-500/10";
                  badgeStyle = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                  badgeText = "Success";
                } else if (node.status === "failed") {
                  borderColor = "border-rose-500";
                  glowColor = "shadow-md shadow-rose-500/25";
                  badgeStyle = "bg-rose-500/10 border-rose-500/20 text-rose-400";
                  badgeText = "Failed";
                } else if (isSelected) {
                  borderColor = "border-brand-blue-light";
                  glowColor = "shadow-md shadow-brand-blue-light/20";
                }

                return (
                  <div
                    key={node.id}
                    className={`absolute w-[220px] bg-white border-2 border-t-4 border-t-[#FF6A00] border-[#003A8C] rounded-xl p-3.5 pointer-events-auto transition-all text-[#003A8C] ${
                      isSelected ? "ring-2 ring-[#FF6A00]/40" : ""
                    }`}
                    style={{
                      left: `${node.x}px`,
                      top: `${node.y}px`
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                    }}
                  >
                    {/* Header Handle to drag node */}
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(e, node)}
                      className="cursor-grab active:cursor-grabbing border-b border-[#003A8C]/30 pb-2 mb-2 flex justify-between items-start"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[#003A8C]/70 truncate">{node.action}</span>
                        <h4 className="text-xs font-bold font-display text-[#003A8C] truncate pr-1">{node.name}</h4>
                      </div>
                      
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold shrink-0 border ${badgeStyle}`}>
                        {badgeText}
                      </span>
                    </div>

                    {/* Node Body Details */}
                    <div className="space-y-1.5 text-[10px] text-[#003A8C]">
                      <p className="line-clamp-2 leading-relaxed text-[#003A8C]/80 italic">"{node.desc}"</p>
                      <div className="flex justify-between text-[#003A8C]/80 font-mono mt-1 pt-1.5 border-t border-[#003A8C]/30">
                        <span>Agent:</span>
                        <span className="text-[#003A8C] font-semibold truncate max-w-[110px]">{node.agent}</span>
                      </div>
                    </div>

                    {/* Sockets - visual ports to connect lines */}
                    <div className="absolute top-[40px] -left-1.5 w-3 h-3 bg-white border border-[#003A8C] rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-[#003A8C] rounded-full" />
                    </div>
                    <div className="absolute top-[40px] -right-1.5 w-3 h-3 bg-white border border-[#003A8C] rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-[#003A8C] rounded-full" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Canvas Floating controls overlay (Bottom Left) */}
          <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-800 p-2 rounded-lg flex items-center gap-1 shadow-xl backdrop-blur-sm">
            <button
              onClick={zoomIn}
              title="Zoom In"
              className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-white transition"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={zoomOut}
              title="Zoom Out"
              className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-white transition"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetZoomPan}
              title="Reset View"
              className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-white transition font-mono text-[9px] font-bold px-2"
            >
              RESET
            </button>
            <span className="text-[10px] text-slate-500 font-mono pl-1.5 pr-1">{Math.round(zoom * 100)}%</span>
          </div>

          {/* Instruction Tooltip Overlay */}
          <div className="absolute top-4 left-4 bg-slate-900/80 border border-slate-800/80 p-2.5 rounded-lg text-[10.5px] text-slate-400 max-w-[240px] pointer-events-none space-y-1 backdrop-blur-sm">
            <div className="flex items-center gap-1 text-slate-300 font-semibold font-display">
              <Info className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>Canvas Controls</span>
            </div>
            <p>• Click & drag empty space to **Pan**</p>
            <p>• Grab any node header to **Drag & reposition**</p>
            <p>• Click a node to open **Property Console**</p>
          </div>
        </div>

        {/* Right Side Control Center & Config Panel */}
        <div className="w-[310px] bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto h-full shrink-0">
          
          <AnimatePresence mode="wait">
            {selectedNode ? (
              <motion.div
                key={selectedNode.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-5 space-y-5 flex-1 flex flex-col"
              >
                {/* Node details header */}
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[9px] uppercase font-mono bg-brand-blue/20 border border-brand-blue-light/20 text-brand-blue-light px-1.5 py-0.5 rounded font-bold">
                      Task Settings
                    </span>
                    <h3 className="text-sm font-semibold font-display text-white mt-1.5">{selectedNode.name}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form fields */}
                <div className="space-y-4 flex-1">
                  
                  {/* Node Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono uppercase block">Step / Task Name</label>
                    <input
                      type="text"
                      value={selectedNode.name}
                      onChange={(e) => handleUpdateNodeField(selectedNode.id, "name", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:outline-none focus:border-orange-500 transition font-sans"
                    />
                  </div>

                  {/* Assigned Agent */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono uppercase block">Assigned AI Agent</label>
                    <select
                      value={selectedNode.agent}
                      onChange={(e) => handleUpdateNodeField(selectedNode.id, "agent", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:outline-none focus:border-orange-500 transition font-mono"
                    >
                      {agents.map(ag => (
                        <option key={ag.agentId} value={ag.name}>{ag.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Action Group type */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono uppercase block">Execution Action Type</label>
                    <input
                      type="text"
                      value={selectedNode.action}
                      onChange={(e) => handleUpdateNodeField(selectedNode.id, "action", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:outline-none focus:border-orange-500 transition font-mono"
                    />
                  </div>

                  {/* Timeout / Retries */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-mono uppercase block flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" /> Timeout (s)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={selectedNode.timeout}
                        onChange={(e) => handleUpdateNodeField(selectedNode.id, "timeout", parseInt(e.target.value) || 30)}
                        className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:outline-none focus:border-orange-500 transition font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-mono uppercase block flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 text-slate-500" /> Max Retries
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={selectedNode.retries}
                        onChange={(e) => handleUpdateNodeField(selectedNode.id, "retries", parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:outline-none focus:border-orange-500 transition font-mono"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono uppercase block">Description / Payload details</label>
                    <textarea
                      rows={3}
                      value={selectedNode.desc}
                      onChange={(e) => handleUpdateNodeField(selectedNode.id, "desc", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded p-2 focus:outline-none focus:border-orange-500 transition resize-none leading-relaxed"
                    />
                  </div>

                  {/* Connection / Dependencies Manager */}
                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 font-display flex items-center gap-1.5">
                      <Link className="w-3.5 h-3.5 text-brand-blue-light" />
                      Manage Dependency Links
                    </h4>

                    {/* Current parent links */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">Depends On:</span>
                      {selectedNode.dependencies.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic">No dependency steps (Runs immediately at launch)</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNode.dependencies.map(depId => {
                            const depNode = nodes.find(n => n.id === depId);
                            return (
                              <div key={depId} className="flex items-center gap-1 bg-slate-950 text-slate-300 border border-slate-800 px-2 py-1 rounded text-[10px] font-mono">
                                <span className="truncate max-w-[120px]">{depNode?.name || depId}</span>
                                <button
                                  onClick={() => handleRemoveDependency(selectedNode.id, depId)}
                                  className="text-slate-500 hover:text-rose-400 font-bold transition ml-1"
                                  title="Unlink"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Add dependency trigger dropdown */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">Link New Dependency:</span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddDependency(selectedNode.id, e.target.value);
                            e.target.value = ""; // Reset dropdown
                          }
                        }}
                        defaultValue=""
                        className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-400 rounded p-1.5 focus:outline-none focus:border-orange-500 transition"
                      >
                        <option value="" disabled>-- Connect parent step --</option>
                        {nodes
                          .filter(n => n.id !== selectedNode.id && !selectedNode.dependencies.includes(n.id))
                          .map(n => (
                            <option key={n.id} value={n.id}>➔ {n.name}</option>
                          ))
                        }
                      </select>
                    </div>

                  </div>

                </div>

                {/* Delete Node action */}
                <button
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 text-xs font-bold py-2 rounded transition mt-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Step Node
                </button>

              </motion.div>
            ) : (
              <motion.div
                key="empty-console"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-5 flex flex-col justify-center items-center text-center h-full space-y-3"
              >
                <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center">
                  <Settings className="w-5 h-5 text-slate-600 animate-spin" style={{ animationDuration: "12s" }} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 font-display">Property Control Console</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                    Select any pipeline node on the canvas layout to configure detailed agent assignments, action headers, parameters, and flow connections.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Interactive Micro-Terminal output (Bottom Overlay) */}
      <div className="bg-slate-950 border-t border-slate-800 h-36 flex flex-col overflow-hidden shrink-0">
        <div className="bg-slate-900 px-4 py-1.5 border-b border-slate-800/60 flex justify-between items-center text-[10.5px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 font-bold text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-orange-500" />
            <span>n8n Orchestration Simulator logs</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded font-bold">
            Live Logger Mode
          </span>
        </div>

        <div className="flex-1 p-3 font-mono text-[10.5px] space-y-1.5 overflow-y-auto bg-black/40 text-slate-300">
          {simulationLogs.length === 0 ? (
            <p className="text-slate-500 italic">No logs recorded. Trigger "Execute Live Pipeline" to launch the trace.</p>
          ) : (
            simulationLogs.map((log) => {
              let color = "text-slate-300";
              if (log.type === "success") color = "text-emerald-400 font-semibold";
              if (log.type === "error") color = "text-rose-400 font-bold";
              if (log.type === "warn") color = "text-amber-400";
              return (
                <div key={log.id} className={`${color} leading-relaxed`}>
                  {log.msg}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
