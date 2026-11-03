import { useMission } from "../hooks/useMission";
import { HealthBars, Panel } from "../components/DashboardComponents";
import { InteractivePcaChart } from "../components/InteractivePcaChart";
import { DataErrorInspector } from "../components/DataErrorInspector";

export default function AnomaliesPage() {
  const { channels, detection } = useMission();

  const explainedRatio = detection?.model?.explained_variance_ratio || [];
  const totalVariance = detection?.model?.explained_variance_total !== undefined
    ? (detection.model.explained_variance_total * 100).toFixed(1)
    : null;

  return (
    <>
      {/* High-level Anomaly Banner */}
      <section className="anomaly-banner">
        <div>
          <p className="eyebrow">MULTIVARIATE PCA ERROR ANALYSIS</p>
          <h2>PCA Anomaly Scoring & Error Detection</h2>
          <p>
            {detection.anomalySamples} of {detection.sampleCount} score samples exceed the calibrated threshold τ = {detection.threshold?.toFixed(2)}.
            Ground truth intervals are displayed alongside detected multivariate events.
          </p>
        </div>
        <div className="anomaly-score">
          <small>Current PCA Score E(t)</small>
          <strong className={detection.currentScore > detection.threshold ? "critical" : "green"}>
            {detection.currentScore !== null ? detection.currentScore : "--"}
          </strong>
          <span className="mono">Threshold τ = {detection.threshold?.toFixed(2) || "--"}</span>
        </div>
      </section>

      {/* Interactive PCA Reconstruction Error Plot */}
      <section className="anomaly-chart-panel">
        <Panel
          title="Multivariate PCA Reconstruction Error Over Time"
          action={
            <span className="panel-badge-group">
              <span className="status-dot green" />
              THRESHOLD τ = {detection.threshold?.toFixed(3) || "0.000"} • TARGET FAR:{" "}
              {((detection.calibration?.target_far ?? 0.01) * 100).toFixed(1)}%
            </span>
          }
        >
          <InteractivePcaChart detection={detection} height={300} />
        </Panel>
      </section>

      {/* Model Variance Decomposition & Component Analysis */}
      <section className="anomaly-layout">
        <Panel title="Principal Component Variance Decomposition">
          {explainedRatio.length > 0 ? (
            <div className="pca-variance-breakdown">
              <div className="variance-header">
                <span>
                  <strong>{detection.components || explainedRatio.length} COMPONENTS</strong> CAPTURING{" "}
                  <b className="green-text">{totalVariance}%</b> TOTAL VARIANCE
                </span>
                <span className="mono text-muted">TARGET: 95.0%</span>
              </div>
              <div className="variance-bars-list">
                {explainedRatio.map((ratio, index) => {
                  const pct = (ratio * 100).toFixed(1);
                  return (
                    <div className="variance-item" key={`pc-${index}`}>
                      <div className="variance-labels">
                        <span className="mono">Principal Component {index + 1} (PC{index + 1})</span>
                        <strong className="mono">{pct}%</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill purple"
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {detection.channelsUsed && detection.channelsUsed.length > 0 && (
                <div className="channels-used-section">
                  <small>CHANNELS SCORED IN MULTIVARIATE MODEL ({detection.channelsUsed.length}):</small>
                  <div className="channel-chips-list">
                    {detection.channelsUsed.map((chId) => (
                      <span key={chId} className="channel-chip">
                        {chId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="contributions">
              {detection.contributors && detection.contributors.length > 0 ? (
                detection.contributors.map((item) => (
                  <div key={item.channel}>
                    <span>{item.name}</span>
                    <b>{item.contribution}</b>
                    <i>
                      <em
                        style={{
                          width: `${Math.min(100, item.contribution * 25)}%`,
                        }}
                      />
                    </i>
                  </div>
                ))
              ) : (
                <div className="empty-panel-state">
                  <span>Multivariate PCA scoring active across correlated subsystem features.</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Subsystem Health Distribution">
          <HealthBars
            channels={channels}
            subsystemHealth={detection.subsystems}
          />
        </Panel>
      </section>

      {/* Comprehensive Error & Gap Inspector */}
      <Panel
        title="Comprehensive Data Error & Anomaly Explorer"
        action="GROUND TRUTH VS. PCA ALARMS"
      >
        <DataErrorInspector
          channels={channels}
          detection={detection}
        />
      </Panel>
    </>
  );
}
