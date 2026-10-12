import { useState } from "react";
import { useMission } from "../hooks/useMission";
import {
  ChannelRows,
  Panel,
  Sparkline,
} from "../components/DashboardComponents";

export default function TelemetryPage() {
  const { channels, mission } = useMission();
  const [selected, setSelected] = useState(channels[0]);
  return (
    <>
      <div className="telemetry-toolbar">
        <select
          value={selected.id}
          onChange={(event) =>
            setSelected(
              channels.find((channel) => channel.id === event.target.value),
            )
          }
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.displayName} / {channel.subsystemName}
            </option>
          ))}
        </select>
        <div className="range-tabs">
          <button className="selected">Indexed</button>
        </div>
        <span className="toggle-label">
          SOURCE: {mission.source.toUpperCase()}
        </span>
      </div>
      <section className="telemetry-layout">
        <Panel
          title={`${selected.displayName} / ${selected.id}`}
          action={`${selected.sampleCount.toLocaleString()} SAMPLES`}
        >
          <Sparkline points={selected.points} />
        </Panel>
        <Panel title="Channel statistics">
          <dl className="stats-list">
            <dt>Subsystem</dt>
            <dd>{selected.subsystemName}</dd>
            <dt>Unit</dt>
            <dd>{selected.unitName}</dd>
            <dt>Minimum</dt>
            <dd>{selected.minimum}</dd>
            <dt>Maximum</dt>
            <dd>{selected.maximum}</dd>
            <dt>Mean</dt>
            <dd>{selected.mean}</dd>
            <dt>Current</dt>
            <dd className="violet-text">
              {selected.currentLabel || selected.current}
            </dd>
          </dl>
        </Panel>
      </section>
      <Panel title={`${mission.source} channel catalog`}>
        <ChannelRows
          channels={channels}
          onSelect={setSelected}
          selected={selected}
        />
      </Panel>
    </>
  );
}
