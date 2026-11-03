import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
    const days = (ms / (3600000 * 24)).toFixed(1);
    return `${days} days`;
  } catch {
    return "--";
  }
}

export function DataErrorInspector({ channels, detection, onSelectChannel = null }) {
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'pca_alarms' | 'labels' | 'gaps'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubsystem, setSelectedSubsystem] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Collect all labeled anomalies across channels
  const allLabeledAnomalies = useMemo(() => {
    return channels.flatMap((channel) =>
      (channel.anomalies || []).map((anomaly) => ({
        id: anomaly.id,
        category: anomaly.category || "Anomaly",
        startTime: anomaly.startTime,
        endTime: anomaly.endTime,
        duration: calculateDuration(anomaly.startTime, anomaly.endTime),
        channelId: channel.id,
        displayName: channel.displayName,
        subsystem: channel.subsystem,
        subsystemName: channel.subsystemName,
        type: "labeled_anomaly",
      })),
    );
  }, [channels]);

  // Collect all PCA detected alarms
  const allPcaAlarms = useMemo(() => {
    if (!detection?.alarms || !Array.isArray(detection.alarms)) return [];
    return detection.alarms.map((alarm, idx) => ({
      id: `PCA-ALARM-${idx + 1}`,
      category: "Multivariate Outlier",
      startTime: alarm.start,
      endTime: alarm.end,
      duration: `${alarm.n_rows} samples`,
      peakScore: alarm.peak_score,
      matchesLabel: alarm.matches_label,
      subsystem: detection.subsystem || "subsystem_1",
      channelsCount: detection.channelsUsed?.length || 0,
      type: "pca_alarm",
    }));
  }, [detection]);

  // Channel quality / missingness analysis
  const channelQualityMetrics = useMemo(() => {
    return channels.map((channel) => {
      let missingCount = 0;
      let totalPoints = channel.sampleCount || 0;
      let outOfBoundsCount = 0;

      if (Array.isArray(channel.points) && channel.points.length > 0) {
        totalPoints = channel.points.length;
        for (const p of channel.points) {
          if (p.value === null || !Number.isFinite(p.value)) {
            missingCount++;
          }
        }
      }

      const completeness = totalPoints > 0
        ? Math.round(((totalPoints - missingCount) / totalPoints) * 100)
        : 100;

      const anomalyCount = channel.anomalies?.length || 0;
      const hasErrors = anomalyCount > 0 || missingCount > 0 || outOfBoundsCount > 0;

      return {
        id: channel.id,
        displayName: channel.displayName,
        subsystem: channel.subsystem,
        subsystemName: channel.subsystemName,
        unitName: channel.unitName,
        totalPoints,
        missingCount,
        completeness,
        anomalyCount,
        hasErrors,
      };
    });
  }, [channels]);

  // Subsystem list for dropdown
  const subsystems = useMemo(() => {
    return [...new Set(channels.map((c) => c.subsystem).filter(Boolean))];
  }, [channels]);

  // Filtered anomalies table
  const filteredEvents = useMemo(() => {
    let events = [];
    if (activeTab === "all" || activeTab === "pca_alarms") {
      events = events.concat(allPcaAlarms);
    }
    if (activeTab === "all" || activeTab === "labels") {
      events = events.concat(allLabeledAnomalies);
    }

    if (selectedSubsystem !== "all") {
      events = events.filter((e) => e.subsystem === selectedSubsystem);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      events = events.filter(
        (e) =>
          e.id?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q) ||
          e.channelId?.toLowerCase().includes(q) ||
          e.displayName?.toLowerCase().includes(q),
      );
    }

    return events;
  }, [activeTab, allPcaAlarms, allLabeledAnomalies, selectedSubsystem, searchQuery]);

  // Channels with errors summary
  const errorChannels = useMemo(() => {
    return channelQualityMetrics.filter((c) => c.hasErrors);
  }, [channelQualityMetrics]);

  return (
    <div className="error-inspector-container">
      {/* Overview Stat Cards */}
      <div className="error-stat-cards">
        <div className="error-stat-card">
          <small>PCA DETECTED ALARMS</small>
          <strong className={allPcaAlarms.length ? "critical" : "green"}>
            {allPcaAlarms.length}
          </strong>
          <span>Multivariate threshold violations</span>
        </div>
        <div className="error-stat-card">
          <small>LABELED ANOMALY INTERVALS</small>
          <strong className={allLabeledAnomalies.length ? "amber" : "green"}>
            {allLabeledAnomalies.length}
          </strong>
          <span>Ground-truth intervals from source</span>
        </div>
        <div className="error-stat-card">
          <small>CHANNELS WITH ERROR FLAGS</small>
          <strong className={errorChannels.length ? "amber" : "green"}>
            {errorChannels.length} / {channels.length}
          </strong>
          <span>{((errorChannels.length / Math.max(channels.length, 1)) * 100).toFixed(0)}% of catalog</span>
        </div>
        <div className="error-stat-card">
          <small>SCORABLE COMPLETENESS</small>
          <strong className="green">
            {detection?.gaps?.scorable_fraction !== undefined
              ? `${(detection.gaps.scorable_fraction * 100).toFixed(0)}%`
              : "100%"}
          </strong>
          <span>Gap & dropout tolerance pass</span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="inspector-controls">
        <div className="tab-buttons">
          <button
            type="button"
            className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Events ({allPcaAlarms.length + allLabeledAnomalies.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "pca_alarms" ? "active" : ""}`}
            onClick={() => setActiveTab("pca_alarms")}
          >
            PCA Alarms ({allPcaAlarms.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "labels" ? "active" : ""}`}
            onClick={() => setActiveTab("labels")}
          >
            Ground Truth Labels ({allLabeledAnomalies.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "gaps" ? "active" : ""}`}
            onClick={() => setActiveTab("gaps")}
          >
            Channel Missingness & Completeness
          </button>
        </div>

        <div className="filter-inputs">
          <select
            value={selectedSubsystem}
            onChange={(e) => setSelectedSubsystem(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Subsystems</option>
            {subsystems.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search anomaly ID, channel, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "gaps" ? (
        <div className="gaps-table-view">
          <div className="table-header-row">
            <span>CHANNEL</span>
            <span>SUBSYSTEM</span>
            <span>TOTAL SAMPLES</span>
            <span>MISSING</span>
            <span>COMPLETENESS</span>
            <span>LABELS</span>
            <span>ACTION</span>
          </div>
          <div className="gaps-list">
            {channelQualityMetrics
              .filter(
                (c) =>
                  (selectedSubsystem === "all" || c.subsystem === selectedSubsystem) &&
                  (!searchQuery.trim() ||
                    c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.displayName.toLowerCase().includes(searchQuery.toLowerCase())),
              )
              .map((c) => (
                <div className="gap-row" key={c.id}>
                  <span className="channel-name">
                    <strong>{c.displayName}</strong> <small>({c.id})</small>
                  </span>
                  <span>{c.subsystemName || c.subsystem}</span>
                  <span className="mono">{c.totalPoints.toLocaleString()}</span>
                  <span className={`mono ${c.missingCount ? "amber-text" : "muted"}`}>
                    {c.missingCount}
                  </span>
                  <span className="completeness-cell">
                    <div className="progress-track">
                      <div
                        className={`progress-fill ${c.completeness < 90 ? "amber" : "green"}`}
                        style={{ width: `${c.completeness}%` }}
                      />
                    </div>
                    <small>{c.completeness}%</small>
                  </span>
                  <span>
                    {c.anomalyCount > 0 ? (
                      <span className="status-pill warning">{c.anomalyCount} labeled</span>
                    ) : (
                      <span className="status-pill nominal">Nominal</span>
                    )}
                  </span>
                  <span>
                    <Link
                      to={`/telemetry`}
                      onClick={() => onSelectChannel?.(c.id)}
                      className="inspect-link"
                    >
                      Graph ↗
                    </Link>
                  </span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="events-table-view">
          <div className="events-grid-header">
            <span>TYPE</span>
            <span>START TIME (UTC)</span>
            <span>DURATION</span>
            <span>IDENTIFIER / SOURCE</span>
            <span>SUBSYSTEM</span>
            <span>CATEGORY / STATUS</span>
            <span>ACTION</span>
          </div>

          <div className="events-list">
            {filteredEvents.length === 0 ? (
              <div className="empty-events-state">
                No error events matching the selected filters.
              </div>
            ) : (
              filteredEvents.slice(0, 30).map((event, idx) => (
                <div
                  className={`event-row ${selectedEvent?.id === event.id ? "selected" : ""}`}
                  key={`${event.type}-${event.id}-${idx}`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <span>
                    {event.type === "pca_alarm" ? (
                      <span className="status-pill critical">🚨 PCA Alarm</span>
                    ) : (
                      <span className="status-pill warning">🏷️ Source Label</span>
                    )}
                  </span>
                  <span className="mono">{formatTimestamp(event.startTime)}</span>
                  <span className="mono">{event.duration}</span>
                  <span>
                    <strong>{event.id}</strong>
                    {event.channelId && <small> ({event.channelId})</small>}
                  </span>
                  <span>{event.subsystem}</span>
                  <span>
                    {event.type === "pca_alarm" ? (
                      <span className="status-pill critical">
                        Peak: {event.peakScore?.toFixed(2)}
                      </span>
                    ) : (
                      <span className="status-pill warning">{event.category}</span>
                    )}
                  </span>
                  <span>
                    {event.channelId ? (
                      <Link
                        to="/telemetry"
                        onClick={() => onSelectChannel?.(event.channelId)}
                        className="inspect-link"
                      >
                        Inspect ↗
                      </Link>
                    ) : (
                      <Link to="/anomalies" className="inspect-link">
                        Inspect PCA ↗
                      </Link>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
          {filteredEvents.length > 30 && (
            <div className="table-pagination-note">
              Showing 30 of {filteredEvents.length} events matching filters.
            </div>
          )}
        </div>
      )}

      {/* Selected Event Detail Modal / Drawer */}
      {selectedEvent && (
        <div className="event-detail-drawer">
          <div className="drawer-header">
            <h4>
              EVENT DETAILS: {selectedEvent.id}
            </h4>
            <button
              type="button"
              className="drawer-close"
              onClick={() => setSelectedEvent(null)}
            >
              ✕
            </button>
          </div>
          <div className="drawer-content">
            <dl className="stats-list">
              <dt>Event Type</dt>
              <dd>
                {selectedEvent.type === "pca_alarm"
                  ? "Multivariate PCA Outlier Episode"
                  : "Ground Truth Labeled Interval"}
              </dd>
              <dt>Start Time</dt>
              <dd className="mono">{formatTimestamp(selectedEvent.startTime)}</dd>
              <dt>End Time</dt>
              <dd className="mono">{formatTimestamp(selectedEvent.endTime)}</dd>
              <dt>Duration</dt>
              <dd className="mono">{selectedEvent.duration}</dd>
              <dt>Category</dt>
              <dd>{selectedEvent.category}</dd>
              {selectedEvent.peakScore !== undefined && (
                <>
                  <dt>Peak Score</dt>
                  <dd className="mono critical-text">
                    {selectedEvent.peakScore.toFixed(4)}
                  </dd>
                </>
              )}
              {selectedEvent.channelId && (
                <>
                  <dt>Target Channel</dt>
                  <dd>{selectedEvent.displayName} ({selectedEvent.channelId})</dd>
                </>
              )}
              <dt>Subsystem</dt>
              <dd>{selectedEvent.subsystem}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
