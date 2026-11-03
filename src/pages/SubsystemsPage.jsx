import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMission } from "../hooks/useMission";
import { HealthBars, Panel, Sparkline } from "../components/DashboardComponents";

export default function SubsystemsPage() {
  const { channels, detection } = useMission();
  const [selectedSubsystemName, setSelectedSubsystemName] = useState(
    detection.subsystems[0]?.name || "subsystem_1",
  );

  const selectedSubsystem = useMemo(() => {
    return (
      detection.subsystems.find((s) => s.name === selectedSubsystemName) ||
      detection.subsystems[0]
    );
  }, [detection.subsystems, selectedSubsystemName]);

  const subsystemChannels = useMemo(() => {
    return channels.filter((c) => c.subsystem === selectedSubsystemName);
  }, [channels, selectedSubsystemName]);

  return (
    <section className="subsystem-page-container">
      {/* Top Split Layout: Comparison Health Bars + Subsystem Cards */}
      <div className="subsystem-layout">
        <Panel
          title="Subsystem Health Matrix"
          action="PCA RECONSTRUCTION DRIVEN"
        >
          <HealthBars
            channels={channels}
            subsystemHealth={detection.subsystems}
          />
        </Panel>

        <div className="subsystem-cards">
          {detection.subsystems.map((subsystem) => {
            const isScored = subsystem.healthScore !== null && subsystem.healthScore !== undefined;
            const healthVal = isScored ? subsystem.healthScore : 100;
            const completenessVal = subsystem.completeness !== null && subsystem.completeness !== undefined
              ? subsystem.completeness
              : 100;

            const isSelected = selectedSubsystemName === subsystem.name;
            const hasAnomalies = subsystem.labeledAnomalies > 0;
            const isNeedsReview = isScored && healthVal < 70;

            return (
              <article
                className={`subsystem-card interactive-card ${isSelected ? "selected" : ""}`}
                key={subsystem.name}
                onClick={() => setSelectedSubsystemName(subsystem.name)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedSubsystemName(subsystem.name);
                  }
                }}
              >
                <div className="card-title">
                  <span className={`system-icon ${hasAnomalies ? "amber" : "green"}`}>
                    {subsystem.detectionRun ? "◈" : "◇"}
                  </span>
                  <strong>{subsystem.name}</strong>
                  <span
                    className={`status-pill ${
                      isNeedsReview
                        ? "amber"
                        : subsystem.detectionRun
                          ? "nominal"
                          : "violet"
                    }`}
                  >
                    {isNeedsReview
                      ? "Needs Review"
                      : subsystem.detectionRun
                        ? "PCA Active"
                        : "Catalog"}
                  </span>
                </div>

                <div
                  className={`big-score ${
                    isNeedsReview ? "amber" : isScored ? "green" : "violet"
                  }`}
                >
                  {isScored ? `${healthVal}%` : "100%"}
                  <small className="score-subtext">
                    {isScored ? "PCA HEALTH" : "CATALOG NOMINAL"}
                  </small>
                </div>

                <div className="mini-line">
                  <span
                    style={{
                      width: `${healthVal}%`,
                      background: isNeedsReview
                        ? "var(--amber)"
                        : isScored
                          ? "var(--green)"
                          : "var(--purple-soft)",
                    }}
                  />
                </div>

                <p>
                  {subsystem.channelCount} channels / {completenessVal}% complete
                </p>
                <small className={hasAnomalies ? "amber-text" : "faint"}>
                  {subsystem.labeledAnomalies > 0
                    ? `⚠️ ${subsystem.labeledAnomalies} labeled intervals`
                    : "0 labeled intervals"}
                </small>
              </article>
            );
          })}
        </div>
      </div>

      {/* Interactive Subsystem Drilldown Panel */}
      {selectedSubsystem && (
        <Panel
          title={`Subsystem Drilldown: ${selectedSubsystem.name} (${subsystemChannels.length} Channels)`}
          action={
            <Link
              to="/telemetry"
              className="action-link-pill"
            >
              Inspect in Telemetry Console →
            </Link>
          }
        >
          <div className="subsystem-drilldown-header">
            <div className="drilldown-stat">
              <span>ACTIVE SUBSYSTEM</span>
              <strong>{selectedSubsystem.name}</strong>
            </div>
            <div className="drilldown-stat">
              <span>CHANNELS INDEXED</span>
              <strong>{subsystemChannels.length}</strong>
            </div>
            <div className="drilldown-stat">
              <span>DATA COMPLETENESS</span>
              <strong className="green-text">
                {selectedSubsystem.completeness !== null
                  ? `${selectedSubsystem.completeness}%`
                  : "100%"}
              </strong>
            </div>
            <div className="drilldown-stat">
              <span>LABELED INTERVALS</span>
              <strong className={selectedSubsystem.labeledAnomalies ? "amber-text" : "green-text"}>
                {selectedSubsystem.labeledAnomalies}
              </strong>
            </div>
            <div className="drilldown-stat">
              <span>PCA EVALUATION</span>
              <strong>
                {selectedSubsystem.detectionRun ? (
                  <span className="status-pill nominal">Scored in PCA Run</span>
                ) : (
                  <span className="status-pill violet">Catalog Baseline</span>
                )}
              </strong>
            </div>
          </div>

          <div className="subsystem-channel-grid">
            {subsystemChannels.map((channel) => {
              const anomCount = channel.anomalies?.length || 0;
              return (
                <div className="subsystem-channel-card" key={channel.id}>
                  <div className="ch-card-top">
                    <div>
                      <strong>{channel.displayName}</strong>
                      <small>({channel.id})</small>
                    </div>
                    <span
                      className={`status-pill ${anomCount > 0 ? "warning" : "nominal"}`}
                    >
                      {anomCount > 0 ? `${anomCount} errors` : "nominal"}
                    </span>
                  </div>

                  <div className="ch-sparkline-preview">
                    <Sparkline
                      points={channel.points}
                      color={anomCount > 0 ? "amber" : "purple"}
                      height={60}
                    />
                  </div>

                  <div className="ch-card-bottom">
                    <span>
                      {channel.sampleCount?.toLocaleString() || 0} samples
                    </span>
                    <span className="mono">
                      {channel.currentLabel || (channel.current ?? "--")}{" "}
                      {channel.unitName || ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </section>
  );
}
