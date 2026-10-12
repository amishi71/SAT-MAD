import { useMission } from "../hooks/useMission";
import { Metric, Panel } from "../components/DashboardComponents";

export default function RunsPage() {
  const { mission } = useMission();
  return (
    <>
      <section className="metric-grid run-metrics">
        <Metric
          label="Indexed channels"
          value={mission.channelCount}
          note={mission.source}
          accent="violet"
        />
        <Metric
          label="Labeled intervals"
          value={mission.anomalyCount}
          note="Ground truth"
          accent="green"
        />
        <Metric label="Data status" value="READY" note="API indexed" />
      </section>
      <Panel title="Detection run readiness">
        <div className="compare-cards">
          <div>
            <small>DATA INGESTION</small>
            <strong>COMPLETE</strong>
            <span className="green-text">All source channels indexed</span>
          </div>
          <div>
            <small>DETECTION INPUT</small>
            <strong>{mission.channelCount} CH</strong>
            <span className="green-text">PCA window source available</span>
          </div>
          <div>
            <small>LABEL COVERAGE</small>
            <strong>{mission.anomalyCount}</strong>
            <span className="green-text">
              Intervals available for evaluation
            </span>
          </div>
        </div>
      </Panel>
    </>
  );
}
