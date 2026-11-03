import { useId, useMemo, useState, useCallback } from "react";

function formatTimestamp(isoString) {
  if (!isoString) return "--";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString).slice(0, 19);
    return d.toISOString().replace("T", " ").replace("Z", " UTC");
  } catch {
    return String(isoString).slice(0, 19);
  }
}

export function InteractiveTelemetryChart({
  channel,
  compareChannel = null,
  height = 280,
  showControls = true,
  onAnomalySelect = null,
}) {
  const [rangeMode, setRangeMode] = useState("all"); // 'all' | 'first_half' | 'second_half' | 'anomaly'
  const [showMean, setShowMean] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);

  const patternId = useId();

  const rawPoints = useMemo(() => {
    if (!channel?.points || !Array.isArray(channel.points)) return [];
    return channel.points
      .map((p, idx) => ({
        index: idx,
        time: p.time,
        timeMs: Date.parse(p.time) || idx,
        value: Number.isFinite(p.value) ? p.value : null,
      }))
      .filter((p) => p.value !== null);
  }, [channel]);

  const anomalies = useMemo(() => {
    if (!channel?.anomalies || !Array.isArray(channel.anomalies)) return [];
    return channel.anomalies.map((a) => ({
      id: a.id,
      category: a.category || "Anomaly",
      startMs: Date.parse(a.startTime) || 0,
      endMs: Date.parse(a.endTime) || 0,
      startTime: a.startTime,
      endTime: a.endTime,
    }));
  }, [channel]);

  // Filter points based on rangeMode
  const filteredPoints = useMemo(() => {
    if (!rawPoints.length) return [];
    if (rangeMode === "first_half") {
      return rawPoints.slice(0, Math.ceil(rawPoints.length / 2));
    }
    if (rangeMode === "second_half") {
      return rawPoints.slice(Math.floor(rawPoints.length / 2));
    }
    if (rangeMode === "anomaly" && anomalies.length > 0) {
      const firstAnom = anomalies[0];
      const span = Math.max(firstAnom.endMs - firstAnom.startMs, 3600000);
      const startZoom = firstAnom.startMs - span * 1.5;
      const endZoom = firstAnom.endMs + span * 1.5;
      const subset = rawPoints.filter(
        (p) => p.timeMs >= startZoom && p.timeMs <= endZoom,
      );
      return subset.length >= 2 ? subset : rawPoints;
    }
    return rawPoints;
  }, [rawPoints, rangeMode, anomalies]);

  // Chart dimensions & scales
  const chartWidth = 840;
  const padding = useMemo(() => ({ top: 24, right: 35, bottom: 36, left: 65 }), []);
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const {
    minValue,
    maxValue,
    minTime,
    maxTime,
    meanValue,
    stdDev,
  } = useMemo(() => {
    if (!filteredPoints.length) {
      return {
        minValue: 0,
        maxValue: 1,
        minTime: 0,
        maxTime: 1,
        meanValue: 0,
        stdDev: 0,
      };
    }

    let minV = Infinity;
    let maxV = -Infinity;
    let sum = 0;

    for (const p of filteredPoints) {
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
      sum += p.value;
    }

    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }

    // Add 5% breathing room
    const span = maxV - minV;
    const yMin = minV - span * 0.05;
    const yMax = maxV + span * 0.05;

    const mean = sum / filteredPoints.length;
    let varianceSum = 0;
    for (const p of filteredPoints) {
      varianceSum += (p.value - mean) ** 2;
    }
    const sd = Math.sqrt(varianceSum / filteredPoints.length);

    return {
      minValue: yMin,
      maxValue: yMax,
      minTime: filteredPoints[0].timeMs,
      maxTime: filteredPoints[filteredPoints.length - 1].timeMs,
      meanValue: mean,
      stdDev: sd,
    };
  }, [filteredPoints]);

  const timeSpan = Math.max(maxTime - minTime, 1);
  const valueSpan = Math.max(maxValue - minValue, 1e-6);

  const getX = useCallback(
    (timeMs) => padding.left + ((timeMs - minTime) / timeSpan) * innerWidth,
    [padding.left, minTime, timeSpan, innerWidth],
  );

  const getY = useCallback(
    (val) => padding.top + innerHeight - ((val - minValue) / valueSpan) * innerHeight,
    [padding.top, innerHeight, minValue, valueSpan],
  );

  // Path data for primary line
  const { pathD, areaD, pointCoordinates } = useMemo(() => {
    if (!filteredPoints.length) {
      return { pathD: "", areaD: "", pointCoordinates: [] };
    }

    const coords = filteredPoints.map((p) => ({
      x: getX(p.timeMs),
      y: getY(p.value),
      point: p,
    }));

    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
    const area = `${path} L ${coords[coords.length - 1].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`;

    return { pathD: path, areaD: area, pointCoordinates: coords };
  }, [filteredPoints, getX, getY, padding.top, innerHeight]);

  // Optional compare channel path
  const comparePathD = useMemo(() => {
    if (!compareChannel?.points || !Array.isArray(compareChannel.points) || !filteredPoints.length) {
      return "";
    }
    const cPoints = compareChannel.points
      .map((p, idx) => ({
        timeMs: Date.parse(p.time) || idx,
        value: Number.isFinite(p.value) ? p.value : null,
      }))
      .filter((p) => p.value !== null && p.timeMs >= minTime && p.timeMs <= maxTime);

    if (cPoints.length < 2) return "";

    const cMin = Math.min(...cPoints.map((p) => p.value));
    const cMax = Math.max(...cPoints.map((p) => p.value));
    const cSpan = Math.max(cMax - cMin, 1e-6);

    const coords = cPoints.map((p) => {
      const normalized = (p.value - cMin) / cSpan; // 0 to 1
      const y = padding.top + innerHeight - normalized * innerHeight;
      const x = getX(p.timeMs);
      return { x, y };
    });

    return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  }, [compareChannel, filteredPoints, minTime, maxTime, getX, padding.top, innerHeight]);

  // Anomaly highlighted regions
  const anomalyRegions = useMemo(() => {
    if (!showAnomalies || !anomalies.length || !filteredPoints.length) return [];
    return anomalies
      .map((a) => {
        const xStart = Math.max(padding.left, getX(a.startMs));
        const xEnd = Math.min(padding.left + innerWidth, getX(a.endMs));
        const isVisible = xEnd >= padding.left && xStart <= padding.left + innerWidth;
        return {
          ...a,
          xStart,
          xEnd,
          width: Math.max(xEnd - xStart, 8),
          isVisible,
        };
      })
      .filter((r) => r.isVisible);
  }, [showAnomalies, anomalies, filteredPoints, padding.left, innerWidth, getX]);

  // Hovered point selection
  const handleMouseMove = (e) => {
    if (!pointCoordinates.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * chartWidth;

    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < pointCoordinates.length; i++) {
      const dist = Math.abs(pointCoordinates[i].x - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeCoord = hoverIndex !== null && pointCoordinates[hoverIndex]
    ? pointCoordinates[hoverIndex]
    : pointCoordinates[pointCoordinates.length - 1];

  const activePoint = activeCoord?.point;

  // Check if active point is in an anomaly interval
  const activeAnomaly = useMemo(() => {
    if (!activePoint || !anomalies.length) return null;
    return anomalies.find(
      (a) => activePoint.timeMs >= a.startMs && activePoint.timeMs <= a.endMs,
    );
  }, [activePoint, anomalies]);

  // Y-axis grid lines (4 ticks)
  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 3; i++) {
      const val = minValue + (i / 3) * (maxValue - minValue);
      ticks.push({
        value: val,
        y: padding.top + innerHeight - (i / 3) * innerHeight,
      });
    }
    return ticks;
  }, [minValue, maxValue, innerHeight, padding.top]);

  // X-axis time ticks (5 ticks)
  const xTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const timeMs = minTime + (i / 4) * timeSpan;
      ticks.push({
        timeMs,
        x: padding.left + (i / 4) * innerWidth,
        label: formatTimestamp(new Date(timeMs).toISOString()).slice(0, 10),
      });
    }
    return ticks;
  }, [minTime, timeSpan, innerWidth, padding.left]);

  return (
    <div className="interactive-chart-container">
      {showControls && (
        <div className="chart-toolbar">
          <div className="chart-mode-group">
            <span className="toolbar-label">RANGE:</span>
            <button
              type="button"
              className={`chart-btn ${rangeMode === "all" ? "active" : ""}`}
              onClick={() => setRangeMode("all")}
            >
              Full Mission ({rawPoints.length})
            </button>
            <button
              type="button"
              className={`chart-btn ${rangeMode === "first_half" ? "active" : ""}`}
              onClick={() => setRangeMode("first_half")}
            >
              1st Half
            </button>
            <button
              type="button"
              className={`chart-btn ${rangeMode === "second_half" ? "active" : ""}`}
              onClick={() => setRangeMode("second_half")}
            >
              2nd Half
            </button>
            {anomalies.length > 0 && (
              <button
                type="button"
                className={`chart-btn highlight ${rangeMode === "anomaly" ? "active" : ""}`}
                onClick={() => setRangeMode("anomaly")}
              >
                Focus Anomaly ({anomalies.length})
              </button>
            )}
          </div>

          <div className="chart-toggle-group">
            <label className="chart-checkbox-label">
              <input
                type="checkbox"
                checked={showMean}
                onChange={(e) => setShowMean(e.target.checked)}
              />
              Mean Line
            </label>
            <label className="chart-checkbox-label">
              <input
                type="checkbox"
                checked={showEnvelope}
                onChange={(e) => setShowEnvelope(e.target.checked)}
              />
              Envelope (±2σ)
            </label>
            {anomalies.length > 0 && (
              <label className="chart-checkbox-label alert-label">
                <input
                  type="checkbox"
                  checked={showAnomalies}
                  onChange={(e) => setShowAnomalies(e.target.checked)}
                />
                Show Labels ({anomalies.length})
              </label>
            )}
          </div>
        </div>
      )}

      {/* Interactive Readout HUD */}
      <div className="chart-hud">
        <div className="hud-metric">
          <span className="hud-label">TIME (UTC)</span>
          <strong className="hud-value mono">
            {activePoint ? formatTimestamp(activePoint.time) : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">VALUE</span>
          <strong className="hud-value mono accent-purple">
            {activePoint
              ? `${activePoint.value.toFixed(4)} ${channel?.unitName || ""}`
              : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">DEV FROM MEAN</span>
          <strong className="hud-value mono">
            {activePoint && stdDev > 0
              ? `${((activePoint.value - meanValue) / stdDev).toFixed(2)} σ`
              : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">INTERVAL STATUS</span>
          {activeAnomaly ? (
            <span
              className="status-pill warning clickable"
              onClick={() => onAnomalySelect?.(activeAnomaly)}
              title="Click to inspect anomaly details"
            >
              ⚠️ {activeAnomaly.category} ({activeAnomaly.id})
            </span>
          ) : (
            <span className="status-pill nominal">✓ Nominal</span>
          )}
        </div>
        {compareChannel && (
          <div className="hud-metric">
            <span className="hud-label">COMPARING</span>
            <strong className="hud-value cyan">
              {compareChannel.displayName} (normalized)
            </strong>
          </div>
        )}
      </div>

      {/* SVG Chart */}
      <div className="svg-chart-wrapper">
        <svg
          className="interactive-svg-chart"
          viewBox={`0 0 ${chartWidth} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Subtle gradient under line */}
            <linearGradient id={`grad-${patternId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bc86ff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8d46ff" stopOpacity="0.0" />
            </linearGradient>

            {/* Anomaly hazard stripe pattern */}
            <pattern
              id={`hazard-${patternId}`}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="4" height="8" fill="#ed5c58" opacity="0.18" />
              <rect x="4" width="4" height="8" fill="#1b1226" opacity="0.2" />
            </pattern>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + innerWidth}
                y2={tick.y}
                stroke="#252044"
                strokeDasharray="2 3"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 3}
                fill="#777891"
                fontSize="8"
                fontFamily="DM Mono"
                textAnchor="end"
              >
                {tick.value.toFixed(3)}
              </text>
            </g>
          ))}

          {/* X-axis ticks */}
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={padding.top + innerHeight}
                x2={tick.x}
                y2={padding.top + innerHeight + 4}
                stroke="#3e2873"
              />
              <text
                x={tick.x}
                y={padding.top + innerHeight + 14}
                fill="#777891"
                fontSize="8"
                fontFamily="DM Mono"
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Envelope (Mean ± 2 sigma) */}
          {showEnvelope && stdDev > 0 && (
            <rect
              x={padding.left}
              y={Math.max(padding.top, getY(meanValue + 2 * stdDev))}
              width={innerWidth}
              height={Math.min(
                innerHeight,
                getY(meanValue - 2 * stdDev) - getY(meanValue + 2 * stdDev),
              )}
              fill="#8d46ff"
              opacity="0.07"
            />
          )}

          {/* Anomaly Intervals */}
          {anomalyRegions.map((region, i) => (
            <g key={`anom-region-${i}`}>
              <rect
                x={region.xStart}
                y={padding.top}
                width={region.width}
                height={innerHeight}
                fill={`url(#hazard-${patternId})`}
                stroke="#ed5c58"
                strokeWidth="1"
                strokeDasharray="4 2"
                className="anomaly-rect"
                onClick={() => onAnomalySelect?.(region)}
              />
              <line
                x1={region.xStart}
                y1={padding.top}
                x2={region.xStart}
                y2={padding.top + innerHeight}
                stroke="#ed5c58"
                strokeWidth="1.5"
              />
              {/* Category flag at top */}
              <rect
                x={region.xStart}
                y={padding.top}
                width={Math.min(region.width, 60)}
                height="10"
                fill="#ed5c58"
                rx="2"
              />
              <text
                x={region.xStart + 3}
                y={padding.top + 8}
                fill="#ffffff"
                fontSize="6"
                fontWeight="bold"
                fontFamily="Space Grotesk"
              >
                {region.category.slice(0, 10).toUpperCase()}
              </text>
            </g>
          ))}

          {/* Mean Guide Line */}
          {showMean && (
            <g>
              <line
                x1={padding.left}
                y1={getY(meanValue)}
                x2={padding.left + innerWidth}
                y2={getY(meanValue)}
                stroke="#bc86ff"
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.8"
              />
              <text
                x={padding.left + innerWidth + 4}
                y={getY(meanValue) + 3}
                fill="#bc86ff"
                fontSize="7"
                fontFamily="DM Mono"
              >
                μ
              </text>
            </g>
          )}

          {/* Area under curve */}
          {areaD && (
            <path
              d={areaD}
              fill={`url(#grad-${patternId})`}
              pointerEvents="none"
            />
          )}

          {/* Optional Compare Channel Line */}
          {comparePathD && (
            <path
              d={comparePathD}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              opacity="0.85"
            />
          )}

          {/* Primary Telemetry Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#bc86ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Hover Crosshair and Dot */}
          {activeCoord && (
            <g pointerEvents="none">
              <line
                x1={activeCoord.x}
                y1={padding.top}
                x2={activeCoord.x}
                y2={padding.top + innerHeight}
                stroke="#8d46ff"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={padding.left}
                y1={activeCoord.y}
                x2={padding.left + innerWidth}
                y2={activeCoord.y}
                stroke="#8d46ff"
                strokeWidth="0.8"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r="6"
                fill={activeAnomaly ? "#ed5c58" : "#5ed47a"}
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r="10"
                fill="none"
                stroke={activeAnomaly ? "#ed5c58" : "#5ed47a"}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Channel Stats Footer Bar */}
      <div className="chart-stats-footer">
        <div>
          <span>MINIMUM</span>
          <b>{channel?.minimum !== undefined ? channel.minimum : minValue.toFixed(3)}</b>
        </div>
        <div>
          <span>MAXIMUM</span>
          <b>{channel?.maximum !== undefined ? channel.maximum : maxValue.toFixed(3)}</b>
        </div>
        <div>
          <span>MEAN</span>
          <b>{channel?.mean !== undefined ? channel.mean : meanValue.toFixed(3)}</b>
        </div>
        <div>
          <span>STD DEV (σ)</span>
          <b>{stdDev.toFixed(4)}</b>
        </div>
        <div>
          <span>TOTAL SAMPLES</span>
          <b>{channel?.sampleCount?.toLocaleString() || rawPoints.length}</b>
        </div>
        <div>
          <span>LABELED ANOMALIES</span>
          <b className={anomalies.length ? "amber-text" : "green-text"}>
            {anomalies.length ? `${anomalies.length} intervals` : "0 (nominal)"}
          </b>
        </div>
      </div>
    </div>
  );
}
