export function Sparkline({ points }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values),
    max = Math.max(...values);
  const path = points
    .map(
      (point, index) =>
        ` ${index ? "L" : "M"} ${(index / Math.max(points.length - 1, 1)) * 440} ${140 - ((point.value - min) / Math.max(max - min, 1)) * 120 - 10}`,
    )
    .join("");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 440 140"
      preserveAspectRatio="none"
      aria-label="ESA telemetry trend"
    >
      <path className="sparkline-grid" d="M0 35H440 M0 70H440 M0 105H440" />
      <path className="sparkline-path" d={path} />
    </svg>
  );
}

export function Panel({ title, action, children }) {
  return (
    <section className="panel">
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

export function HealthBars({ channels }) {
  const groups = [...new Set(channels.map((channel) => channel.subsystem))];
  return (
    <div className="health-bars">
      {groups.map((group) => {
        const members = channels.filter(
          (channel) => channel.subsystem === group,
        );
        const labeled = members.reduce(
          (sum, channel) => sum + channel.anomalies.length,
          0,
        );
        const score = Math.max(
          0,
          Math.round(100 - (labeled / Math.max(members.length, 1)) * 10),
        );
        const tone = score < 95 ? "amber" : "green";
        return (
          <div className="health-bar" key={group}>
            <div>
              <span>{group}</span>
              <b className={tone}>{score}%</b>
            </div>
            <i>
              <em className={tone} style={{ width: `${score}%` }} />
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
      {channels.map((channel) => (
        <button
          className={`channel-row ${selected?.id === channel.id ? "selected" : ""}`}
          key={channel.id}
          onClick={() => onSelect(channel)}
        >
          <span>
            {channel.displayName} <small>({channel.id})</small>
          </span>
          <span>{channel.sampleCount.toLocaleString()} samples</span>
          <span>{channel.subsystemName}</span>
          <span>{channel.currentLabel || channel.current} {channel.unitName}</span>
          <span
            className={`status-pill ${channel.anomalies.length ? "warning" : "nominal"}`}
          >
            {channel.anomalies.length
              ? `${channel.anomalies.length} labels`
              : "nominal"}
          </span>
        </button>
      ))}
    </div>
  );
}
export function AnomalyRows({ channels }) {
  const anomalies = channels
    .flatMap((channel) =>
      channel.anomalies.map((anomaly) => ({ channel, anomaly })),
    )
    .slice(0, 8);
  return (
    <div className="anomaly-table">
      {anomalies.map(({ channel, anomaly }) => (
        <div className="table-row" key={`${channel.id}-${anomaly.id}`}>
          <span>{anomaly.startTime.slice(0, 10)}</span>
          <span>{channel.id}</span>
          <span>{channel.subsystem}</span>
          <span>{anomaly.id}</span>
          <span className="status-pill warning">{anomaly.category}</span>
        </div>
      ))}
    </div>
  );
}
