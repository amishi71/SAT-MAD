import { useMission } from "../hooks/useMission";
import { HealthBars, Panel } from "../components/DashboardComponents";

export default function SubsystemsPage() {
  const { channels } = useMission();
  const groups = [...new Set(channels.map((channel) => channel.subsystem))];
  return (
    <section className="subsystem-layout">
      <Panel title="Subsystem comparison">
        <HealthBars channels={channels} />
      </Panel>
      <div className="subsystem-cards">
        {groups.map((group) => {
          const members = channels.filter(
            (channel) => channel.subsystem === group,
          );
          const anomalies = members.reduce(
            (sum, channel) => sum + channel.anomalies.length,
            0,
          );
          return (
            <article className="subsystem-card" key={group}>
              <div className="card-title">
                <span className="system-icon green">*</span>
                <strong>{group}</strong>
                <span
                  className={`status-pill ${anomalies ? "amber" : "nominal"}`}
                >
                  {anomalies ? "Labeled" : "Nominal"}
                </span>
              </div>
              <div className="big-score green">{members.length}</div>
              <div className="mini-line">
                <span
                  style={{ width: `${Math.min(100, members.length * 10)}%` }}
                />
              </div>
              <p>Channels in catalog</p>
              <small>{anomalies} labeled intervals</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
