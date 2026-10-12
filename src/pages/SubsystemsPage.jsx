import { useMission } from "../hooks/useMission";
import { HealthBars, Panel } from "../components/DashboardComponents";

export default function SubsystemsPage() {
  const { channels, detection } = useMission();
  return (
    <section className="subsystem-layout">
      <Panel title="Subsystem comparison">
        <HealthBars
          channels={channels}
          subsystemHealth={detection.subsystems}
        />
      </Panel>
      <div className="subsystem-cards">
        {detection.subsystems.map((subsystem) => (
          <article className="subsystem-card" key={subsystem.name}>
            <div className="card-title">
              <span className="system-icon green">*</span>
              <strong>{subsystem.name}</strong>
              <span
                className={`status-pill ${subsystem.healthScore < 70 ? "amber" : "nominal"}`}
              >
                {subsystem.healthScore < 70 ? "Needs review" : "Nominal"}
              </span>
            </div>
            <div className="big-score green">{subsystem.healthScore}%</div>
            <div className="mini-line">
              <span style={{ width: `${subsystem.healthScore}%` }} />
            </div>
            <p>
              {subsystem.channelCount} channels / {subsystem.completeness}%
              complete
            </p>
            <small>{subsystem.labeledAnomalies} labeled intervals</small>
          </article>
        ))}
      </div>
    </section>
  );
}
