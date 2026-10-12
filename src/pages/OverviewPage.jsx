import { Link } from "react-router-dom";
import { useMission } from "../hooks/useMission";
import {
  AnomalyRows,
  HealthBars,
  Metric,
  Panel,
} from "../components/DashboardComponents";

export default function OverviewPage() {
  const { channels, mission } = useMission();
  return (
    <>
      <section className="metric-grid">
        <Metric
          label="Mission channels"
          value={mission.channelCount}
          note={mission.source}
          accent="violet"
        />
        <Metric
          label="Total samples"
          value={channels
            .reduce((sum, channel) => sum + channel.sampleCount, 0)
            .toLocaleString()}
          note="Indexed from source"
        />
        <Metric
          label="Labeled anomalies"
          value={mission.anomalyCount}
          note="Multivariate intervals"
          accent="green"
        />
        <Metric
          label="Subsystem groups"
          value={
            [...new Set(channels.map((channel) => channel.subsystem))].length
          }
          note="Catalog groups"
        />
      </section>
      <section className="overview-grid">
        <Panel
          title="Mission data health"
          action={`${mission.source.toUpperCase()} INDEX`}
        >
          <HealthBars channels={channels} />
        </Panel>
        <Panel title="Dataset coverage">
          <dl className="stats-list">
            <dt>First sample</dt>
            <dd>{channels[0]?.startTime.slice(0, 10)}</dd>
            <dt>Last sample</dt>
            <dd>{channels[0]?.endTime.slice(0, 10)}</dd>
            <dt>Channels indexed</dt>
            <dd>{mission.channelCount}</dd>
            <dt>Source labels</dt>
            <dd>{mission.anomalyCount}</dd>
          </dl>
        </Panel>
      </section>
      <section className="overview-grid lower-grid">
        <Panel title="Recent labeled intervals">
          <AnomalyRows channels={channels} />
        </Panel>
        <Panel title="Channel browser">
          <Link className="quick-link" to="/telemetry">
            Explore all ESA channels -&gt;
          </Link>
          <Link className="quick-link" to="/anomalies">
            Inspect labeled intervals -&gt;
          </Link>
        </Panel>
      </section>
    </>
  );
}
