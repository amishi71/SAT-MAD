import { useState, useMemo } from "react";
import { useMission } from "../hooks/useMission";
import { ChannelRows, Panel } from "../components/DashboardComponents";
import { InteractiveTelemetryChart } from "../components/InteractiveTelemetryChart";

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

function calculateDuration(startStr, endStr) {
  if (!startStr || !endStr) return "--";
  try {
    const ms = Math.abs(Date.parse(endStr) - Date.parse(startStr));
    if (isNaN(ms)) return "--";
    const hours = Math.round(ms / 3600000);
    if (hours < 24) return `${hours} hrs`;
    return `${(ms / (3600000 * 24)).toFixed(1)} days`;
  } catch {
    return "--";
  }
}

export default function TelemetryPage() {
  const { channels, mission } = useMission();
  const [selectedId, setSelectedId] = useState(channels[0]?.id || "");
  const [subsystemFilter, setSubsystemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'anomalous' | 'nominal'
  const [searchQuery, setSearchQuery] = useState("");
  const [compareId, setCompareId] = useState("");

  const selected = useMemo(() => {
    return channels.find((c) => c.id === selectedId) || channels[0];
  }, [channels, selectedId]);

  const compareChannel = useMemo(() => {
    if (!compareId) return null;
    return channels.find((c) => c.id === compareId) || null;
  }, [channels, compareId]);

  const subsystems = useMemo(() => {
    return [...new Set(channels.map((c) => c.subsystem).filter(Boolean))];
  }, [channels]);

  // Sibling channels in same subsystem for comparison dropdown
  const siblingChannels = useMemo(() => {
    if (!selected) return [];
    return channels.filter(
      (c) => c.subsystem === selected.subsystem && c.id !== selected.id,
    );
  }, [channels, selected]);

  // Filtered channel catalog
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      if (subsystemFilter !== "all" && c.subsystem !== subsystemFilter) {
        return false;
      }
      if (statusFilter === "anomalous" && (!c.anomalies || c.anomalies.length === 0)) {
        return false;
      }
      if (statusFilter === "nominal" && c.anomalies && c.anomalies.length > 0) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.id.toLowerCase().includes(q) ||
          c.displayName?.toLowerCase().includes(q) ||
          c.subsystemName?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [channels, subsystemFilter, statusFilter, searchQuery]);

  const selectedAnomalies = selected?.anomalies || [];

  return (
    <>
      {/* Telemetry Control Bar */}
      <div className="telemetry-toolbar">
        <label className="toolbar-item">
          <span>CHANNEL:</span>
          <select
            value={selected?.id || ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setCompareId(""); // Reset comparison when switching channels
            }}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.displayName} ({channel.id}) — {channel.subsystemName || channel.subsystem}
              </option>
            ))}
          </select>
        </label>

        {siblingChannels.length > 0 && (
          <label className="toolbar-item">
            <span>OVERLAY COMPARE:</span>
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
            >
              <option value="">None (Single Channel)</option>
              {siblingChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.id})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="telemetry-source-badge">
          <span className="status-dot green" />
          <span>INDEXED: {mission.source.toUpperCase()}</span>
        </div>
      </div>

      {/* Main Interactive Chart Section */}
      <section className="telemetry-chart-section">
        <Panel
          title={`${selected.displayName} / ${selected.id}`}
          action={
            <span className="channel-action-badge">
              {selected.subsystemName || selected.subsystem} •{" "}
              {selected.sampleCount?.toLocaleString()} SAMPLES
            </span>
          }
        >
          <InteractiveTelemetryChart
            channel={selected}
            compareChannel={compareChannel}
            height={300}
          />
        </Panel>
      </section>

      {/* Telemetry Diagnostics & Stats Grid */}
      <section className="telemetry-details-grid">
        {/* Labeled Error Intervals for Selected Channel */}
        <Panel
          title={`Data Error Intervals (${selectedAnomalies.length})`}
          action={
            selectedAnomalies.length ? (
              <span className="status-pill warning">{selectedAnomalies.length} Flagged</span>
            ) : (
              <span className="status-pill nominal">Clean Nominal</span>
            )
          }
        >
          {selectedAnomalies.length === 0 ? (
            <div className="empty-panel-state">
              <span className="check-icon">✓</span>
              <p>No ground truth anomaly intervals flagged for this channel.</p>
              <small>All telemetry samples conform to nominal operational baseline.</small>
            </div>
          ) : (
            <div className="channel-anomalies-list">
              {selectedAnomalies.map((anom, idx) => (
                <div className="channel-anomaly-item" key={anom.id || idx}>
                  <div className="item-header">
                    <span className="status-pill warning">
                      {anom.category || "Anomaly"}
                    </span>
                    <strong className="mono">{anom.id}</strong>
                    <span className="item-duration mono">
                      {calculateDuration(anom.startTime, anom.endTime)}
                    </span>
                  </div>
                  <div className="item-times">
                    <div>
                      <small>START (UTC)</small>
                      <span className="mono">{formatTimestamp(anom.startTime)}</span>
                    </div>
                    <div>
                      <small>END (UTC)</small>
                      <span className="mono">{formatTimestamp(anom.endTime)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Detailed Statistics List */}
        <Panel title="Sensor Operational Statistics">
          <dl className="stats-list">
            <dt>Subsystem</dt>
            <dd>{selected.subsystemName || selected.subsystem}</dd>
            <dt>Physical Unit</dt>
            <dd>{selected.unitName || selected.unit || "Raw Counts"}</dd>
            <dt>Minimum Observed</dt>
            <dd className="mono">{selected.minimum}</dd>
            <dt>Maximum Observed</dt>
            <dd className="mono">{selected.maximum}</dd>
            <dt>Mean Value (μ)</dt>
            <dd className="mono">{selected.mean}</dd>
            <dt>Current Sample</dt>
            <dd className="mono violet-text">
              {selected.currentLabel || selected.current} {selected.unitName || ""}
            </dd>
            <dt>Sample Count</dt>
            <dd className="mono">{selected.sampleCount?.toLocaleString()}</dd>
            <dt>Interval Start</dt>
            <dd className="mono">{formatTimestamp(selected.startTime)}</dd>
            <dt>Interval End</dt>
            <dd className="mono">{formatTimestamp(selected.endTime)}</dd>
          </dl>
        </Panel>
      </section>

      {/* Filterable Channel Catalog */}
      <Panel
        title={`${mission.source} Channel Catalog (${filteredChannels.length} of ${channels.length})`}
        action={
          <span className="catalog-status">
            {channels.filter((c) => c.anomalies?.length).length} channels with anomalies
          </span>
        }
      >
        <div className="catalog-filters">
          <div className="filter-group">
            <span>FILTER BY SUBSYSTEM:</span>
            <button
              type="button"
              className={`filter-chip ${subsystemFilter === "all" ? "active" : ""}`}
              onClick={() => setSubsystemFilter("all")}
            >
              All ({channels.length})
            </button>
            {subsystems.map((sub) => {
              const count = channels.filter((c) => c.subsystem === sub).length;
              return (
                <button
                  type="button"
                  key={sub}
                  className={`filter-chip ${subsystemFilter === sub ? "active" : ""}`}
                  onClick={() => setSubsystemFilter(sub)}
                >
                  {sub} ({count})
                </button>
              );
            })}
          </div>

          <div className="filter-group right">
            <div className="status-chips">
              <button
                type="button"
                className={`filter-chip ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-chip warning ${statusFilter === "anomalous" ? "active" : ""}`}
                onClick={() => setStatusFilter("anomalous")}
              >
                Errors Only ({channels.filter((c) => c.anomalies?.length > 0).length})
              </button>
              <button
                type="button"
                className={`filter-chip nominal ${statusFilter === "nominal" ? "active" : ""}`}
                onClick={() => setStatusFilter("nominal")}
              >
                Nominal
              </button>
            </div>

            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-catalog"
            />
          </div>
        </div>

        <ChannelRows
          channels={filteredChannels}
          onSelect={(c) => setSelectedId(c.id)}
          selected={selected}
        />
      </Panel>
    </>
  );
}
