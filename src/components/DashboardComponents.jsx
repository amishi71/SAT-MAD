export function Sparkline({ points, color = "purple", height = 140 }) {
  if (!points || !Array.isArray(points) || points.length === 0) {
    return (
      <div className="sparkline-empty">
        <span>No telemetry data</span>
      </div>
    );
  }

  const values = points
    .map((point) => point?.value)
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) {
    return (
      <div className="sparkline-empty">
        <span>Invalid telemetry points</span>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-6);

  const path = points
    .map((point, index) => {
      const v = Number.isFinite(point?.value) ? point.value : min;
      const x = (index / Math.max(points.length - 1, 1)) * 440;
      const y = height - ((v - min) / span) * (height - 20) - 10;
      return ` ${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join("");

  return (
    <svg
      className={`sparkline ${color}`}
      viewBox={`0 0 440 ${height}`}
      preserveAspectRatio="none"
      aria-label="ESA telemetry trend"
    >
      <path className="sparkline-grid" d="M0 35H440 M0 70H440 M0 105H440" />
      <path className={`sparkline-path ${color}`} d={path} />
    </svg>
  );
}

export function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, note, accent = "" }) {
  return (
    <article className="metric">
      <p>{label}</p>
      <strong className={accent}>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

export function HealthBars({ channels, subsystemHealth = [] }) {
  const metrics = subsystemHealth.length
    ? subsystemHealth
    : [...new Set(channels.map((channel) => channel.subsystem))].map(
        (subsystem) => ({ name: subsystem, healthScore: null }),
      );

  return (
    <div className="health-bars">
      {metrics.map((metric) => {
        const isScored = metric.healthScore !== null && metric.healthScore !== undefined;
        const score = isScored ? metric.healthScore : 100;
        const tone = !isScored
          ? "violet"
          : score < 70
            ? "amber"
            : "green";

        const labelText = isScored ? `${score}%` : "Catalog Nominal";

        return (
          <div className="health-bar" key={metric.name}>
            <div>
              <span>
                <strong>{metric.name}</strong>
                {metric.detectionRun && <small className="run-tag"> (PCA Active)</small>}
              </span>
              <b className={tone}>{labelText}</b>
            </div>
            <i>
              <em
                className={tone}
                style={{ width: `${score}%` }}
              />
            </i>
          </div>
        );
      })}
    </div>
  );
}

export function ChannelRows({ channels, onSelect, selected }) {
  return (
    <div className="channel-list">
      {channels.map((channel) => {
        const anomalyCount = channel.anomalies?.length || 0;
        const isSelected = selected?.id === channel.id;

        return (
          <button
            type="button"
            className={`channel-row ${isSelected ? "selected" : ""}`}
            key={channel.id}
            onClick={() => onSelect(channel)}
          >
            <span>
              {channel.displayName} <small>({channel.id})</small>
            </span>
            <span>{channel.sampleCount?.toLocaleString() ?? 0} samples</span>
            <span>{channel.subsystemName || channel.subsystem}</span>
            <span>
              {channel.currentLabel || (channel.current ?? "--")}{" "}
              <small>{channel.unitName || ""}</small>
            </span>
            <span
              className={`status-pill ${anomalyCount > 0 ? "warning" : "nominal"}`}
            >
              {anomalyCount > 0 ? `${anomalyCount} labels` : "nominal"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AnomalyRows({ channels, maxCount = 8 }) {
  const anomalies = channels
    .flatMap((channel) =>
      (channel.anomalies || []).map((anomaly) => ({ channel, anomaly })),
    )
    .slice(0, maxCount);

  if (anomalies.length === 0) {
    return (
      <div className="empty-table-state">
        No labeled anomaly intervals in this dataset view.
      </div>
    );
  }

  return (
    <div className="anomaly-table">
      <div className="table-head">
        <span>DATE</span>
        <span>CHANNEL</span>
        <span>SUBSYSTEM</span>
        <span>EVENT ID</span>
        <span>CATEGORY</span>
      </div>
      {anomalies.map(({ channel, anomaly }) => (
        <div className="table-row" key={`${channel.id}-${anomaly.id}`}>
          <span className="mono">{anomaly.startTime?.slice(0, 10) || "--"}</span>
          <span>
            {channel.displayName} <small>({channel.id})</small>
          </span>
          <span>{channel.subsystem}</span>
          <span className="mono">{anomaly.id}</span>
          <span className="status-pill warning">{anomaly.category || "Anomaly"}</span>
        </div>
      ))}
    </div>
  );
}
