import { useMission } from "../hooks/useMission";
import {
  AnomalyRows,
  HealthBars,
  Panel,
} from "../components/DashboardComponents";

export default function AnomaliesPage() {
  const { channels, mission } = useMission();
  return (
    <>
      <section className="anomaly-banner">
        <div>
          <p className="eyebrow">SOURCE-LABELED MULTIVARIATE EVENTS</p>
          <h2>{mission.source} anomaly intervals indexed</h2>
          <p>
            {mission.anomalyCount} labeled events across {channels.length}{" "}
            channels.
          </p>
        </div>
        <div className="anomaly-score">
          <small>Source labels</small>
          <strong>{mission.anomalyCount}</strong>
        </div>
      </section>
      <section className="anomaly-layout">
        <Panel title="Labeled interval coverage">
          <HealthBars channels={channels} />
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
