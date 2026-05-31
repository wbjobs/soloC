import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

interface LevelMeterProps {
  leftLevel: number;
  rightLevel: number;
}

const LevelMeter: React.FC<LevelMeterProps> = ({ leftLevel, rightLevel }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = 150;

    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleBand()
      .domain(["左声道", "右声道"])
      .range([0, innerWidth])
      .padding(0.4);

    const yScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0])
      .nice();

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${(d as number) * 100}%`);

    g.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .selectAll("text")
      .attr("fill", "#a0a0a0")
      .attr("font-size", "11");

    g.selectAll(".domain, .tick line")
      .attr("stroke", "#555");

    const levels = [
      { label: "左声道", value: leftLevel },
      { label: "右声道", value: rightLevel },
    ];

    g.append("g")
      .selectAll("rect")
      .data(levels)
      .join("rect")
      .attr("x", (d) => xScale(d.label) || 0)
      .attr("y", (d) => yScale(d.value))
      .attr("width", xScale.bandwidth())
      .attr("height", (d) => innerHeight - yScale(d.value))
      .attr("fill", (_, i) =>
        i === 0 ? "url(#leftGradient)" : "url(#rightGradient)"
      )
      .attr("rx", 4);

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("fill", "#a0a0a0")
      .attr("font-size", "12");

    g.selectAll(".x-axis .domain, .x-axis .tick line")
      .attr("stroke", "#555");

    const defs = svg.append("defs");

    defs
      .append("linearGradient")
      .attr("id", "leftGradient")
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "100%")
      .attr("y2", "0%")
      .selectAll("stop")
      .data([
        { offset: "0%", color: "#1a1a2e" },
        { offset: "30%", color: "#28a745" },
        { offset: "70%", color: "#ffc107" },
        { offset: "100%", color: "#dc3545" },
      ])
      .join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    defs
      .append("linearGradient")
      .attr("id", "rightGradient")
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "100%")
      .attr("y2", "0%")
      .selectAll("stop")
      .data([
        { offset: "0%", color: "#1a1a2e" },
        { offset: "30%", color: "#28a745" },
        { offset: "70%", color: "#ffc107" },
        { offset: "100%", color: "#dc3545" },
      ])
      .join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    levels.forEach((level, i) => {
      const x = (xScale(level.label) || 0) + xScale.bandwidth() / 2;
      g.append("text")
        .attr("x", x)
        .attr("y", yScale(level.value) - 8)
        .attr("text-anchor", "middle")
        .attr("fill", i === 0 ? "#4ade80" : "#e94560")
        .attr("font-size", "12")
        .attr("font-weight", "bold")
        .text(`${(level.value * 100).toFixed(1)}%`);
    });
  }, [leftLevel, rightLevel]);

  return (
    <div className="meter-container">
      <div className="meter-row">
        <span className="meter-label">L</span>
        <div className="meter-bar">
          <div
            className="meter-fill"
            style={{
              width: `${leftLevel * 100}%`,
              background: "linear-gradient(90deg, #28a745, #ffc107, #dc3545)",
            }}
          />
        </div>
        <span className="meter-value">
          {leftLevel >= 0.9
            ? "🔴"
            : leftLevel >= 0.7
            ? "🟡"
            : leftLevel > 0
            ? "🟢"
            : "⚫"}
          {(leftLevel * 100).toFixed(0)}%
        </span>
      </div>

      <div className="meter-row">
        <span className="meter-label">R</span>
        <div className="meter-bar">
          <div
            className="meter-fill"
            style={{
              width: `${rightLevel * 100}%`,
              background: "linear-gradient(90deg, #28a745, #ffc107, #dc3545)",
            }}
          />
        </div>
        <span className="meter-value">
          {rightLevel >= 0.9
            ? "🔴"
            : rightLevel >= 0.7
            ? "🟡"
            : rightLevel > 0
            ? "🟢"
            : "⚫"}
          {(rightLevel * 100).toFixed(0)}%
        </span>
      </div>

      <div style={{ marginTop: "1rem", width: "100%" }}>
        <svg ref={svgRef} style={{ width: "100%" }} />
      </div>
    </div>
  );
};

export default LevelMeter;
