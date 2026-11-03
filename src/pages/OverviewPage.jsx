import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMission } from "../hooks/useMission";
import {
  AnomalyRows,
  HealthBars,
  Metric,
  Panel,
} from "../components/DashboardComponents";
import { InteractiveTelemetryChart } from "../components/InteractiveTelemetryChart";

export default function OverviewPage() {
  const { channels, mission, detection } = useMission();

  // Find a high-interest channel to spotlight (prefer one with labeled anomalies)
  const spotlightChannel = useMemo(() => {
    return channels.find((c) => c.anomalies && c.anomalies.length > 0) || channels[0];
  }, [channels]);

  const [activeSpotlightId, setActiveSpotlightId] = useState(spotlightChannel?.id || "");

  const activeChannel = useMemo(() => {
    return channels.find((c) => c.id === activeSpotlightId) || spotlightChannel || channels[0];
  }, [channels, activeSpotlightId, spotlightChannel]);

  const channelsWithAnomalies = useMemo(() => {
    return channels.filter((c) => c.anomalies && c.anomalies.length > 0);
  }, [channels]);

  const totalSamples = useMemo(() => {
    return channels
      .reduce((sum, channel) => sum + (channel.sampleCount || 0), 0)
      .toLocaleString();
  }, [channels]);

  return (
    <>
      {/* Top Metric Grid */}
      <section className="metric-grid">
        <Metric
          label="Mission Channels"
          value={mission.channelCount}
          note={mission.source}
          accent="violet"
        />
        <Metric
          label="Total Samples"
          value={totalSamples}
          note="Indexed from MongoDB"
        />
        <Metric
          label="Labeled Anomalies"
          value={mission.anomalyCount}
          note="Ground truth intervals"
          accent={mission.anomalyCount ? "green" : ""}
        />
        <Metric
          label="PCA Alarms"
          value={detection.anomalySamples}
          note={`Threshold: ${detection.threshold ? detection.threshold.toFixed(1) : "--"}`}
          accent={detection.anomalySamples ? "critical" : "green"}
        />
      </section>

      {/* Active System Health Alert Banner */}
      {detection.anomalySamples > 0 && (
        <section className="overview-alert-banner">
          <div className="alert-content">
            <span className="alert-badge">⚠️ ACTIVE DETECTION ALERT</span>
            <strong>
              {detection.anomalySamples} samples exceed calibrated multivariate threshold τ = {detection.threshold?.toFixed(2)}
            </strong>
            <p>
              Multivariate PCA anomaly detection on {detection.subsystem || "subsystem_1"} identified elevated reconstruction errors.
            </p>
          </div>
          <div className="alert-actions">
            <Link to="/anomalies" className="primary-button">
              Investigate PCA Alarms →
            </Link>
          </div>
        </section>
      )}

      {/* Interactive Telemetry Spotlight */}
      {activeChannel && (
        <Panel
          title={`Telemetry Spotlight: ${activeChannel.displayName} (${activeChannel.id})`}
          action={
            <div className="spotlight-actions">
              <select
                value={activeChannel.id}
                onChange={(e) => setActiveSpotlightId(e.target.value)}
                className="spotlight-select"
              >
                {channelsWithAnomalies.length > 0 && (
                  <optgroup label="Channels with Anomalies">
                    {channelsWithAnomalies.map((c) => (
                      <option key={c.id} value={c.id}>
                        ⚠️ {c.displayName} ({c.anomalies.length} labels)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All Channels">
                  {channels.slice(0, 15).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.id})
                    </option>
                  ))}
                </optgroup>
              </select>
              <Link to="/telemetry" className="action-link-pill">
                Full Telemetry Console →
              </Link>
            </div>
          }
        >
          <InteractiveTelemetryChart
            channel={activeChannel}
            height={260}
          />
        </Panel>
      )}

      {/* Overview Grid: Health & Coverage */}
      <section className="overview-grid">
        <Panel
          title="Mission Subsystem Health"
          action={`${mission.source.toUpperCase()} INDEX`}
        >
          <HealthBars
            channels={channels}
            subsystemHealth={detection.subsystems}
          />
        </Panel>

        <Panel title="Dataset Ingestion Coverage">
          <dl className="stats-list">
            <dt>First Sample Timestamp</dt>
            <dd className="mono">{channels[0]?.startTime?.slice(0, 19) || "--"}</dd>
            <dt>Last Sample Timestamp</dt>
            <dd className="mono">{channels[0]?.endTime?.slice(0, 19) || "--"}</dd>
            <dt>Channels Indexed</dt>
            <dd className="mono">{mission.channelCount}</dd>
            <dt>Channels with Anomalies</dt>
            <dd className="mono amber-text">
              {channelsWithAnomalies.length} of {channels.length}
            </dd>
            <dt>Source Ground Truth</dt>
            <dd className="mono">{mission.anomalyCount} intervals</dd>
            <dt>Runtime Database</dt>
            <dd className="mono green-text">MongoDB Connected</dd>
          </dl>
        </Panel>
      </section>

      {/* Lower Grid: Recent Labeled Intervals & Quick Navigation */}
      <section className="overview-grid lower-grid">
        <Panel
          title="Recent Ground Truth Labeled Intervals"
          action={
            <Link to="/anomalies" className="action-link-pill">
              View All Labels →
            </Link>
          }
        >
          <AnomalyRows channels={channels} maxCount={6} />
        </Panel>

        <Panel title="Operations Console Shortcuts">
          <div className="operations-shortcuts">
            <Link className="quick-shortcut-card" to="/telemetry">
              <div>
                <strong>Telemetry Console</strong>
                <span>Interactive scrubbing, crosshair inspect, multi-channel compare</span>
              </div>
              <span className="arrow">→</span>
            </Link>
            <Link className="quick-shortcut-card" to="/anomalies">
              <div>
                <strong>Anomaly Analysis</strong>
                <span>PCA reconstruction errors, threshold exceedance, gap inspector</span>
              </div>
              <span className="arrow">→</span>
            </Link>
            <Link className="quick-shortcut-card" to="/subsystems">
              <div>
                <strong>Subsystem Health</strong>
                <span>Per-subsystem completeness, anomaly density, drilldown matrix</span>
              </div>
              <span className="arrow">→</span>
            </Link>
            <Link className="quick-shortcut-card" to="/runs">
              <div>
                <strong>Detection Runs</strong>
                <span>Chronological data splits, Monte Carlo calibration, held-out FAR</span>
              </div>
              <span className="arrow">→</span>
            </Link>
          </div>
        </Panel>
      </section>
    </>
  );
}
