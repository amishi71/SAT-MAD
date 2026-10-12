import { useMission } from "../hooks/useMission";
import { Metric, Panel } from "../components/DashboardComponents";

export default function RunsPage() {
  const { mission, detection } = useMission();
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
        <Metric
          label="PCA status"
          value="ACTIVE"
          note={`${detection.components} components`}
        />
      </section>
      <Panel title="Detection run readiness">
        <div className="compare-cards">
          <div>
            <small>DATA INGESTION</small>
            <strong>COMPUTED</strong>
            <span className="green-text">
              {detection.sampleCount} score samples
            </span>
          </div>
          <div>
            <small>DETECTION INPUT</small>
            <strong>{detection.featureCount} CH</strong>
            <span className="green-text">Correlated features scored</span>
          </div>
          <div>
            <small>LABEL COVERAGE</small>
            <strong>{detection.anomalySamples}</strong>
            <span className="green-text">Samples above PCA threshold</span>
          </div>
        </div>
      </Panel>
    </>
  );
}
