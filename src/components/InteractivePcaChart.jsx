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

export function InteractivePcaChart({ detection, height = 280, onAlarmSelect = null }) {
  const [viewFilter, setViewFilter] = useState("all"); // 'all' | 'alarms_only' | 'high_error'
  const [hoverIndex, setHoverIndex] = useState(null);

  const patternId = useId();

  const rawSeries = useMemo(() => {
    if (!detection?.series || !Array.isArray(detection.series)) return [];
    return detection.series.map((item, idx) => ({
      index: idx,
      time: item.time,
      timeMs: Date.parse(item.time) || idx,
      value: Number.isFinite(item.value) ? item.value : 0,
    }));
  }, [detection]);

  const threshold = useMemo(() => {
    return Number.isFinite(detection?.threshold) ? detection.threshold : 0;
  }, [detection]);

  const alarms = useMemo(() => {
    if (!detection?.alarms || !Array.isArray(detection.alarms)) return [];
    return detection.alarms.map((a, idx) => ({
      id: `alarm-${idx + 1}`,
      start: a.start,
      end: a.end,
      startMs: Date.parse(a.start) || 0,
      endMs: Date.parse(a.end) || 0,
      n_rows: a.n_rows,
      peak_score: a.peak_score,
      matches_label: a.matches_label,
    }));
  }, [detection]);

  // Filter series based on viewFilter
  const filteredSeries = useMemo(() => {
    if (!rawSeries.length) return [];
    if (viewFilter === "alarms_only" && alarms.length > 0) {
      const margin = 86400000 * 7; // 7 days
      return rawSeries.filter((p) =>
        alarms.some(
          (a) => p.timeMs >= a.startMs - margin && p.timeMs <= a.endMs + margin,
        ),
      );
    }
    if (viewFilter === "high_error" && threshold > 0) {
      const highPoints = rawSeries.filter((p) => p.value >= threshold * 0.5);
      return highPoints.length >= 2 ? highPoints : rawSeries;
    }
    return rawSeries;
  }, [rawSeries, viewFilter, alarms, threshold]);

  const chartWidth = 840;
  const padding = useMemo(() => ({ top: 24, right: 40, bottom: 36, left: 65 }), []);
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const {
    minValue,
    maxValue,
    minTime,
    maxTime,
  } = useMemo(() => {
    if (!filteredSeries.length) {
      return { minValue: 0, maxValue: 10, minTime: 0, maxTime: 1 };
    }
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of filteredSeries) {
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
    }
    if (threshold > maxV) maxV = threshold * 1.05;
    if (minV === maxV) {
      minV = 0;
      maxV = 1;
    }

    const span = maxV - minV;
    const yMin = Math.max(0, minV - span * 0.05);
    const yMax = maxV + span * 0.08;

    return {
      minValue: yMin,
      maxValue: yMax,
      minTime: filteredSeries[0].timeMs,
      maxTime: filteredSeries[filteredSeries.length - 1].timeMs,
    };
  }, [filteredSeries, threshold]);

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

  // Paths
  const { pathD, areaD, pointCoordinates } = useMemo(() => {
    if (!filteredSeries.length) {
      return { pathD: "", areaD: "", pointCoordinates: [] };
    }
    const coords = filteredSeries.map((p) => ({
      x: getX(p.timeMs),
      y: getY(p.value),
      point: p,
      isExceed: threshold > 0 && p.value > threshold,
    }));

    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
    const area = `${path} L ${coords[coords.length - 1].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`;

    return { pathD: path, areaD: area, pointCoordinates: coords };
  }, [filteredSeries, getX, getY, padding.top, innerHeight, threshold]);

  // Alarm regions
  const alarmRegions = useMemo(() => {
    if (!alarms.length || !filteredSeries.length) return [];
    return alarms
      .map((a) => {
        const xStart = Math.max(padding.left, getX(a.startMs));
        const xEnd = Math.min(padding.left + innerWidth, getX(a.endMs));
        const isVisible = xEnd >= padding.left && xStart <= padding.left + innerWidth;
        return {
          ...a,
          xStart,
          xEnd,
          width: Math.max(xEnd - xStart, 10),
          isVisible,
        };
      })
      .filter((r) => r.isVisible);
  }, [alarms, filteredSeries, padding.left, innerWidth, getX]);

  // Hover
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
  const isAlarm = activePoint && threshold > 0 && activePoint.value > threshold;
  const exceedRatio = activePoint && threshold > 0 ? (activePoint.value / threshold) : 0;

  // Y-axis ticks
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

  // X-axis ticks
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

  const thresholdY = getY(threshold);

  return (
    <div className="interactive-chart-container pca-chart-container">
      {/* Toolbar */}
      <div className="chart-toolbar">
        <div className="chart-mode-group">
          <span className="toolbar-label">VIEW:</span>
          <button
            type="button"
            className={`chart-btn ${viewFilter === "all" ? "active" : ""}`}
            onClick={() => setViewFilter("all")}
          >
            All Samples ({rawSeries.length})
          </button>
          {alarms.length > 0 && (
            <button
              type="button"
              className={`chart-btn alert ${viewFilter === "alarms_only" ? "active" : ""}`}
              onClick={() => setViewFilter("alarms_only")}
            >
              Alarm Episodes ({alarms.length})
            </button>
          )}
          <button
            type="button"
            className={`chart-btn ${viewFilter === "high_error" ? "active" : ""}`}
            onClick={() => setViewFilter("high_error")}
          >
            Elevated Error ({">0.5τ"})
          </button>
        </div>

        <div className="chart-info-tag">
          <span className="status-dot green" />
          MONTE CARLO CALIBRATION: TARGET FAR {(detection?.calibration?.target_far ? detection.calibration.target_far * 100 : 1.0).toFixed(1)}%
        </div>
      </div>

      {/* Interactive HUD Readout */}
      <div className="chart-hud">
        <div className="hud-metric">
          <span className="hud-label">SAMPLE TIME (UTC)</span>
          <strong className="hud-value mono">
            {activePoint ? formatTimestamp(activePoint.time) : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">RECONSTRUCTION ERROR E(t)</span>
          <strong className={`hud-value mono ${isAlarm ? "critical" : "accent-purple"}`}>
            {activePoint ? activePoint.value.toFixed(4) : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">CALIBRATED THRESHOLD (τ)</span>
          <strong className="hud-value mono amber-text">
            {threshold.toFixed(4)}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">SEVERITY RATIO (E/τ)</span>
          <strong className={`hud-value mono ${isAlarm ? "critical" : ""}`}>
            {exceedRatio > 0 ? `${exceedRatio.toFixed(2)}x` : "--"}
          </strong>
        </div>
        <div className="hud-metric">
          <span className="hud-label">PCA STATE</span>
          {isAlarm ? (
            <span className="status-pill critical pulse">
              🚨 MULTIVARIATE ALARM
            </span>
          ) : (
            <span className="status-pill nominal">
              ✓ Subsystem Nominal
            </span>
          )}
        </div>
      </div>

      {/* SVG Container */}
      <div className="svg-chart-wrapper">
        <svg
          className="interactive-svg-chart"
          viewBox={`0 0 ${chartWidth} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`pca-grad-${patternId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ed5c58" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#bc86ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#8d46ff" stopOpacity="0.0" />
            </linearGradient>

            <pattern
              id={`alarm-pattern-${patternId}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="3" height="6" fill="#ed5c58" opacity="0.25" />
              <rect x="3" width="3" height="6" fill="#221124" opacity="0.3" />
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
                {tick.value.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X ticks */}
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

          {/* Alarm intervals overlay */}
          {alarmRegions.map((region, i) => (
            <g key={`alarm-reg-${i}`}>
              <rect
                x={region.xStart}
                y={padding.top}
                width={region.width}
                height={innerHeight}
                fill={`url(#alarm-pattern-${patternId})`}
                stroke="#ed5c58"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                className="alarm-rect clickable"
                onClick={() => onAlarmSelect?.(region)}
              />
              {/* Flag banner */}
              <rect
                x={region.xStart}
                y={padding.top}
                width={Math.min(region.width, 70)}
                height="12"
                fill="#ed5c58"
                rx="2"
              />
              <text
                x={region.xStart + 3}
                y={padding.top + 9}
                fill="#ffffff"
                fontSize="7"
                fontWeight="bold"
                fontFamily="Space Grotesk"
              >
                ALARM ({region.n_rows} rows)
              </text>
            </g>
          ))}

          {/* Calibrated Threshold Line */}
          {threshold > 0 && (
            <g>
              <line
                x1={padding.left}
                y1={thresholdY}
                x2={padding.left + innerWidth}
                y2={thresholdY}
                stroke="#eda93f"
                strokeWidth="1.8"
                strokeDasharray="5 3"
              />
              {/* Threshold badge */}
              <rect
                x={padding.left + innerWidth - 95}
                y={thresholdY - 14}
                width="95"
                height="13"
                fill="#2b1c0e"
                stroke="#eda93f"
                strokeWidth="1"
                rx="2"
              />
              <text
                x={padding.left + innerWidth - 48}
                y={thresholdY - 4}
                fill="#eda93f"
                fontSize="7"
                fontWeight="600"
                fontFamily="DM Mono"
                textAnchor="middle"
              >
                τ = {threshold.toFixed(2)}
              </text>
            </g>
          )}

          {/* Area under curve */}
          {areaD && (
            <path
              d={areaD}
              fill={`url(#pca-grad-${patternId})`}
              pointerEvents="none"
            />
          )}

          {/* Line path */}
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

          {/* Highlight alarm points */}
          {pointCoordinates
            .filter((c) => c.isExceed)
            .map((c, i) => (
              <circle
                key={`exceed-${i}`}
                cx={c.x}
                cy={c.y}
                r="3.5"
                fill="#ed5c58"
                stroke="#ffffff"
                strokeWidth="1"
              />
            ))}

          {/* Hover tracker */}
          {activeCoord && (
            <g pointerEvents="none">
              <line
                x1={activeCoord.x}
                y1={padding.top}
                x2={activeCoord.x}
                y2={padding.top + innerHeight}
                stroke={isAlarm ? "#ed5c58" : "#8d46ff"}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r="6"
                fill={isAlarm ? "#ed5c58" : "#5ed47a"}
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r="11"
                fill="none"
                stroke={isAlarm ? "#ed5c58" : "#5ed47a"}
                strokeWidth="1"
                opacity="0.4"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Footer stats */}
      <div className="chart-stats-footer">
        <div>
          <span>THRESHOLD (τ)</span>
          <b className="amber-text">{threshold.toFixed(3)}</b>
        </div>
        <div>
          <span>ALARM SAMPLES</span>
          <b className={detection?.anomalySamples ? "critical-text" : "green-text"}>
            {detection?.anomalySamples || 0} / {detection?.sampleCount || rawSeries.length}
          </b>
        </div>
        <div>
          <span>COMPONENTS (k)</span>
          <b>{detection?.components || 2}</b>
        </div>
        <div>
          <span>HELD-OUT FAR</span>
          <b>
            {detection?.heldOutFar?.far !== undefined
              ? `${(detection.heldOutFar.far * 100).toFixed(2)}% [${((detection.heldOutFar.ci_lower ?? 0) * 100).toFixed(1)}%, ${((detection.heldOutFar.ci_upper ?? 0) * 100).toFixed(1)}%]`
              : "Calibrated"}
          </b>
        </div>
        <div>
          <span>SCORED CHANNELS</span>
          <b>{detection?.channelsUsed?.length || detection?.featureCount || 0}</b>
        </div>
      </div>
    </div>
  );
}
