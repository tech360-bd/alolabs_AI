import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Activity, Clock, Sliders } from "lucide-react";

interface HeatmapDataPoint {
  department: string;
  hour: number;
  intensity: number;
}

export default function D3Heatmap() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{ dept: string; hour: number; val: number } | null>(null);

  // Departments
  const departments = [
    "Executive Swarm",
    "Visa & Advisory",
    "Marketing & Audio",
    "Financial Audit",
    "Memory & Data",
    "Builders & Design"
  ];

  // Hours (0 to 23)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Generate 24 hours * 6 depts operational data
  const generateData = (): HeatmapDataPoint[] => {
    const data: HeatmapDataPoint[] = [];
    departments.forEach((dept) => {
      hours.forEach((hour) => {
        // Create an organic wave of activity based on department and time
        let base = 10;
        
        // Executive active during working hours (9 AM to 5 PM)
        if (dept === "Executive Swarm") {
          base = (hour >= 9 && hour <= 17) ? 85 : 15;
        }
        // Memory sweeps at night (12 AM to 4 AM)
        else if (dept === "Memory & Data") {
          base = (hour >= 0 && hour <= 4) ? 95 : 30;
        }
        // Marketing runs post-work and evenings (3 PM to 10 PM)
        else if (dept === "Marketing & Audio") {
          base = (hour >= 15 && hour <= 22) ? 75 : 20;
        }
        // General distribution
        else {
          base = (hour >= 8 && hour <= 18) ? 60 : 25;
        }

        // Add some noise
        const noise = Math.floor(Math.sin(hour * 0.8) * 10) + Math.floor(Math.cos(departments.indexOf(dept)) * 5);
        const intensity = Math.max(5, Math.min(100, base + noise));
        
        data.push({ department: dept, hour, intensity });
      });
    });
    return data;
  };

  const data = generateData();

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous SVG contents
    d3.select(svgRef.current).selectAll("*").remove();

    // Get parent dimensions for responsiveness
    const containerWidth = containerRef.current.clientWidth || 600;
    const margin = { top: 30, right: 25, bottom: 45, left: 120 };
    const width = containerWidth - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Build X scales and axis:
    const x = d3
      .scaleBand()
      .range([0, width])
      .domain(hours.map(String))
      .padding(0.05);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(
        d3.axisBottom(x).tickFormat((h) => {
          const hr = parseInt(h);
          if (hr === 0) return "12 AM";
          if (hr === 12) return "12 PM";
          if (hr % 4 === 0) {
            return hr > 12 ? `${hr - 12} PM` : `${hr} AM`;
          }
          return "";
        })
      )
      .selectAll("text")
      .style("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-family", "JetBrains Mono, monospace")
      .style("fill", "#003A8C");

    // Build Y scales and axis:
    const y = d3
      .scaleBand()
      .range([height, 0])
      .domain(departments)
      .padding(0.08);

    svg
      .append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .select(".domain")
      .remove();

    svg.selectAll("g.tick text")
      .style("font-size", "10px")
      .style("font-family", "Inter, sans-serif")
      .style("font-weight", "bold")
      .style("fill", "#003A8C");

    // Build color scale
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, 50, 100])
      .range(["#F1F5F9", "#69C0FF", "#003A8C"]); // Soft gray -> Premium Blue -> Primary Blue

    // Add the blocks
    svg
      .selectAll()
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (d) => x(String(d.hour)) || 0)
      .attr("y", (d) => y(d.department) || 0)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .style("fill", (d) => colorScale(d.intensity))
      .style("stroke-width", 1)
      .style("stroke", "none")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .style("stroke", "#FF6A00")
          .style("stroke-width", 2);
        setHoveredBlock({ dept: d.department, hour: d.hour, val: d.intensity });
      })
      .on("mouseleave", function () {
        d3.select(this)
          .style("stroke", "none")
          .style("stroke-width", 1);
        setHoveredBlock(null);
      })
      .on("click", (event, d) => {
        setSelectedDept(d.department === selectedDept ? null : d.department);
      });

  }, [selectedDept, data]);

  return (
    <div className="bg-white border-2 border-[#003A8C]/20 rounded-[24px] p-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#003A8C]" />
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#003A8C]/15 pb-4 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#FF6A00]" />
          <div>
            <h3 className="font-display font-bold text-[#003A8C] text-lg">Agent Operational Intensity</h3>
            <p className="text-[10px] font-semibold text-slate-500 font-mono">D3-Engine Hourly Swarm Frequency Index</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#003A8C]/80">
          <span>Low</span>
          <div className="w-2.5 h-2.5 rounded bg-[#F1F5F9]" />
          <div className="w-2.5 h-2.5 rounded bg-[#69C0FF]" />
          <div className="w-2.5 h-2.5 rounded bg-[#003A8C]" />
          <span>High</span>
        </div>
      </div>

      {/* Heatmap Area */}
      <div ref={containerRef} className="w-full overflow-x-auto select-none py-1">
        <svg ref={svgRef} className="mx-auto block" />
      </div>

      {/* Interactive Tooltip & Department Filter readout */}
      <div className="mt-4 pt-3 border-t border-[#003A8C]/10 flex flex-wrap justify-between items-center text-xs font-semibold gap-3 min-h-[30px]">
        {hoveredBlock ? (
          <div className="flex items-center gap-2 text-[#003A8C] font-mono">
            <Clock className="w-4 h-4 text-[#FF6A00]" />
            <span>
              Dept: <strong className="text-[#FF6A00]">{hoveredBlock.dept}</strong> @{" "}
              <strong>
                {hoveredBlock.hour === 0
                  ? "12 AM"
                  : hoveredBlock.hour === 12
                  ? "12 PM"
                  : hoveredBlock.hour > 12
                  ? `${hoveredBlock.hour - 12} PM`
                  : `${hoveredBlock.hour} AM`}
              </strong>{" "}
              → Intensity: <strong className="text-white bg-[#003A8C] px-1.5 py-0.5 rounded text-[10px]">{hoveredBlock.val}%</strong>
            </span>
          </div>
        ) : selectedDept ? (
          <div className="text-[#003A8C] font-mono flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>
              Filtering details for: <strong className="text-[#FF6A00]">{selectedDept}</strong>
            </span>
            <button
              onClick={() => setSelectedDept(null)}
              className="text-[9px] bg-red-100 hover:bg-red-200 text-red-600 px-1.5 py-0.5 rounded transition-colors uppercase font-black"
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-slate-400 font-medium italic">Hover over blocks for micro-intensity telemetry, or click to toggle selection.</p>
        )}

        <div className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
          GPU Grid: Active
        </div>
      </div>
    </div>
  );
}
