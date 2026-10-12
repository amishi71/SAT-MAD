import { useMission } from "../hooks/useMission";
import {
  AnomalyRows,
  HealthBars,
  Panel,
  Sparkline,
} from "../components/DashboardComponents";

export default function AnomaliesPage() {
  const { channels, mission, detection } = useMission();
  return (
    <>
      <section className="anomaly-banner">
        <div>
          <p className="eyebrow">SOURCE-LABELED MULTIVARIATE EVENTS</p>
          <h2>PCA anomaly score computed</h2>
          <p>
            {detection.anomalySamples} of {detection.sampleCount} score samples
            exceed the PCA threshold. Labels remain available below for
            comparison.
          </p>
        </div>
        <div className="anomaly-score">
          <small>Current PCA score</small>
          <strong>{detection.currentScore}</strong>
        </div>
      </section>
      <section className="anomaly-layout">
        <Panel
          title="PCA reconstruction error over time"
          action={`THRESHOLD: ${detection.threshold}`}
        >
          <Sparkline points={detection.series} />
        </Panel>
        <Panel title="Principal component contributors">
          <div className="contributions">
            {detection.contributors.map((item) => (
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
            ))}
          </div>
        </Panel>
      </section>
      <section className="anomaly-layout">
        <Panel title="Labeled interval coverage">
          <HealthBars
            channels={channels}
            subsystemHealth={detection.subsystems}
          />
        </Panel>
        <Panel title="Index metadata">
          <dl className="stats-list">
            <dt>Dataset</dt>
            <dd>{mission.source}</dd>
            <dt>Label type</dt>
            <dd>Subsequence</dd>
            <dt>Dimensionality</dt>
            <dd>Multivariate</dd>
            <dt>Source</dt>
            <dd>labels.csv</dd>
          </dl>
        </Panel>
      </section>
      <Panel title="Detected anomaly labels">
        <AnomalyRows channels={channels} />
      </Panel>
    </>
  );
}
