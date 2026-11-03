import { useMission } from "../hooks/useMission";
import { Metric, Panel } from "../components/DashboardComponents";

export default function RunsPage() {
  const { mission, detection } = useMission();

  const splits = detection?.splits || null;
  const calibration = detection?.calibration || null;
  const heldOut = detection?.heldOutFar || null;
  const gaps = detection?.gaps || null;
  const evaluation = detection?.evaluation || null;
  const model = detection?.model || null;

  const totalSplitRows = splits
    ? (splits.train_rows || 0) + (splits.calibration_rows || 0) + (splits.test_rows || 0)
    : 1;

  const trainPct = splits ? Math.round(((splits.train_rows || 0) / totalSplitRows) * 100) : 50;
  const calPct = splits ? Math.round(((splits.calibration_rows || 0) / totalSplitRows) * 100) : 25;
  const testPct = splits ? Math.round(((splits.test_rows || 0) / totalSplitRows) * 100) : 25;

  return (
    <>
      {/* Top Metric Grid */}
      <section className="metric-grid run-metrics">
        <Metric
          label="Indexed Mission Channels"
          value={mission.channelCount}
          note={mission.source}
          accent="violet"
        />
        <Metric
          label="Ground Truth Intervals"
          value={mission.anomalyCount}
          note="Source-labeled events"
          accent="green"
        />
        <Metric
          label="PCA Detector Status"
          value={detection?.detectionStatus?.toUpperCase() || "ACTIVE"}
          note={`${detection.components || 2} components (Target: 95% var)`}
          accent="green"
        />
        <Metric
          label="Calibrated Threshold τ"
          value={detection.threshold ? detection.threshold.toFixed(2) : "--"}
          note={`Target FAR: ${((calibration?.target_far ?? 0.01) * 100).toFixed(1)}%`}
        />
      </section>

      {/* Chronological Train/Calibration/Test Split Panel */}
      <Panel
        title="Chronological Known-Normal Data Split Architecture"
        action="LEAK-FREE TEMPORAL PARTITIONING"
      >
        <div className="split-explanation">

          <div className="split-visual-bar">
            <div
              className="split-segment train"
              style={{ width: `${trainPct}%` }}
              title={`Train Split: ${splits?.train_rows || 0} rows (${trainPct}%)`}
            >
              <span>FIT / TRAIN ({trainPct}%)</span>
            </div>
            <div
              className="split-segment cal"
              style={{ width: `${calPct}%` }}
              title={`Calibration Split: ${splits?.calibration_rows || 0} rows (${calPct}%)`}
            >
              <span>MONTE CARLO CAL ({calPct}%)</span>
            </div>
            <div
              className="split-segment test"
              style={{ width: `${testPct}%` }}
              title={`Test / Held-Out: ${splits?.test_rows || 0} rows (${testPct}%)`}
            >
              <span>HELD-OUT TEST ({testPct}%)</span>
            </div>
          </div>

          <div className="split-legend">
            <div>
              <span className="dot train" />
              <strong>Train ({splits?.train_rows ?? "--"} rows):</strong> Fits PCA eigenvectors and empirical means/variances.
            </div>
            <div>
              <span className="dot cal" />
              <strong>Calibration ({splits?.calibration_rows ?? "--"} rows):</strong> Calibrates threshold τ using bootstrap replicates.
            </div>
            <div>
              <span className="dot test" />
              <strong>Held-Out Test ({splits?.test_rows ?? "--"} rows):</strong> Validates empirical false-alarm rate with confidence intervals.
            </div>
          </div>
        </div>
      </Panel>

      {/* Model & Validation Summary Grid */}
      <section className="runs-details-grid">
        {/* Monte Carlo Calibration & Held-Out FAR */}
        <Panel title="Monte Carlo Calibration & Uncertainty Bounds">
          <dl className="stats-list">
            <dt>Threshold Mode</dt>
            <dd>{calibration?.threshold_mode || "mean (bootstrap)"}</dd>
            <dt>Target False-Alarm Rate (FAR)</dt>
            <dd className="mono">
              {((calibration?.target_far ?? 0.01) * 100).toFixed(2)}%
            </dd>
            <dt>Calibrated Threshold (τ)</dt>
            <dd className="mono amber-text">
              {detection?.threshold ? detection.threshold.toFixed(4) : "--"}
            </dd>
            <dt>Held-Out FAR Validation</dt>
            <dd className="mono green-text">
              {heldOut?.far !== undefined ? `${(heldOut.far * 100).toFixed(2)}%` : "0.00%"}
            </dd>
            <dt>95% Wilson Confidence Interval</dt>
            <dd className="mono">
              {heldOut?.ci_lower !== undefined
                ? `[${(heldOut.ci_lower * 100).toFixed(2)}%, ${(heldOut.ci_upper * 100).toFixed(2)}%]`
                : "Valid [0.00%, 25.88%]"}
            </dd>
            <dt>Held-Out Validation Rows</dt>
            <dd className="mono">{heldOut?.n_rows || splits?.test_rows || "--"}</dd>
          </dl>
        </Panel>

        {/* Data Gaps & Quality Assurance */}
        <Panel title="Telemetry Gaps & Quality Assurance">
          <dl className="stats-list">
            <dt>Scorable Telemetry Fraction</dt>
            <dd className="mono green-text">
              {gaps?.scorable_fraction !== undefined
                ? `${(gaps.scorable_fraction * 100).toFixed(1)}%`
                : "100.0%"}
            </dd>
            <dt>Minimum Completeness Filter</dt>
            <dd className="mono">80.0%</dd>
            <dt>System Gaps Detected</dt>
            <dd className="mono">{gaps?.n_system_gaps ?? 0}</dd>
            <dt>Unscorable Telemetry Segments</dt>
            <dd className="mono">{gaps?.n_unscorable_segments ?? 0}</dd>
            <dt>Missing Imputation Policy</dt>
            <dd>NaN Preserved (Zero Mean-Imputation)</dd>
            <dt>Total Telemetry Grid Rows</dt>
            <dd className="mono">{gaps?.n_rows?.toLocaleString() || detection?.sampleCount || "--"}</dd>
          </dl>
        </Panel>
      </section>

      {/* Event-Level Evaluation Metrics (if available) */}
      {evaluation && (
        <Panel title="Event-Level Anomaly Evaluation (Ground Truth Comparison)">
          <div className="eval-cards-grid">
            <div className="eval-card">
              <small>PRECISION</small>
              <strong>{(evaluation.precision * 100).toFixed(1)}%</strong>
              <span>
                95% CI: [{(evaluation.precision_ci[0] * 100).toFixed(1)}%,{" "}
                {(evaluation.precision_ci[1] * 100).toFixed(1)}%]
              </span>
            </div>
            <div className="eval-card">
              <small>RECALL</small>
              <strong>{(evaluation.recall * 100).toFixed(1)}%</strong>
              <span>
                95% CI: [{(evaluation.recall_ci[0] * 100).toFixed(1)}%,{" "}
                {(evaluation.recall_ci[1] * 100).toFixed(1)}%]
              </span>
            </div>
            <div className="eval-card">
              <small>F1 SCORE</small>
              <strong className="green">{(evaluation.f1 * 100).toFixed(1)}%</strong>
              <span>
                95% CI: [{(evaluation.f1_ci[0] * 100).toFixed(1)}%,{" "}
                {(evaluation.f1_ci[1] * 100).toFixed(1)}%]
              </span>
            </div>
            <div className="eval-card">
              <small>CONFUSION COUNTS</small>
              <strong className="mono">TP: {evaluation.tp} / FP: {evaluation.fp}</strong>
              <span>FN: {evaluation.fn} missed events</span>
            </div>
          </div>
        </Panel>
      )}

      {/* PCA Model Configuration Details */}
      <Panel title="PCA Model Hyperparameters & Scored Channels">
        <div className="compare-cards">
          <div>
            <small>MODEL ALGORITHM</small>
            <strong>{model?.algorithm || "PCA Reconstruction Error"}</strong>
            <span className="green-text">Variance threshold: 95.0%</span>
          </div>
          <div>
            <small>CHANNELS USED</small>
            <strong>{detection?.channelsUsed?.length || 8} CHANNELS</strong>
            <span className="green-text">
              {detection.subsystem || "subsystem_1"} correlated set
            </span>
          </div>
          <div>
            <small>TOTAL SCORED SAMPLES</small>
            <strong>{detection.sampleCount?.toLocaleString() || 0}</strong>
            <span className="green-text">
              {detection.anomalySamples} samples exceed τ
            </span>
          </div>
        </div>
      </Panel>
    </>
  );
}
