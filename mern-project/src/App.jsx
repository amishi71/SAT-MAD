import { useState, useEffect, useReducer, useContext, useCallback, useMemo, createContext } from 'react';
import {
  Activity, Radio, AlertTriangle, Target, Layers,
  Satellite, ChartNoAxesGantt, Wifi, LogOut
} from 'lucide-react';
import './App.css';

const NAV_ITEMS = [
  { id: 'overview', label: 'Mission Overview', icon: Activity },
  { id: 'subsystems', label: 'Subsystems', icon: Layers },
  { id: 'telemetry', label: 'Telemetry', icon: Radio },
  { id: 'anomalies', label: 'Anomaly Analysis', icon: AlertTriangle },
  { id: 'runs', label: 'Detection Runs', icon: Target },
];

// Add near the top, below initialState/missionReducer.
const DUMMY_DATA = {
  missionMeta: {
    missionCode: 'AURORA-7',
    linkStatus: 'AURORA-7A: ACTIVE',
    latencySec: 12,
    utc: '2026-03-31 14:32:04',
  },
  stats: {
    activeSatellites: { value: 12, total: '100% nominal' },
    telemetryChannels: { value: 1847, status: 'Live streaming' },
    anomalyScore: { value: 0.23, status: 'Healthy' },
    detectionRuns: { value: 342, status: 'PCA enabled' },
  },
  satellites: [
    { id: 'SAT-01', angle: 0, radius: 0, status: 'nominal' },
    { id: 'SAT-02', angle: 60, radius: 1, status: 'nominal' },
    { id: 'SAT-03', angle: 150, radius: 1, status: 'warn' },
    { id: 'SAT-04', angle: 260, radius: 2, status: 'nominal' },
  ],
  systemHealth: [
    { subsystem: 'ADCS', pct: 95 },
    { subsystem: 'EPS', pct: 98 },
    { subsystem: 'COMMS', pct: 87 },
    { subsystem: 'THERMAL', pct: 92 },
    { subsystem: 'PROPULSION', pct: 100 },
    { subsystem: 'PAYLOAD', pct: 96 },
  ],
  anomalies: [
    { timestamp: '14:31:05', channel: 'COMMS_TX_PWR', subsystem: 'COMMS', score: 0.92, severity: 'critical' },
    { timestamp: '14:28:44', channel: 'EPS_BAT_TEMP_A', subsystem: 'EPS', score: 0.78, severity: 'warning' },
    { timestamp: '14:15:12', channel: 'ADCS_GYRO_Y_BIAS', subsystem: 'ADCS', score: 0.34, severity: 'nominal' },
    { timestamp: '14:02:00', channel: 'PROP_N2_PRESS', subsystem: 'PROPULSION', score: 0.41, severity: 'nominal' },
    { timestamp: '13:58:19', channel: 'PAYLOAD_CCD_TEMP', subsystem: 'PAYLOAD', score: 0.81, severity: 'warning' },
  ],
  timeline: [
    { time: '14:20:00', label: 'Orbital correction burn completed' },
    { time: '13:45:12', label: 'Ground station uplink established' },
    { time: '12:10:00', label: 'Eclipse entry - EPS in battery discharge' },
    { time: '10:30:15', label: 'Star tracker calibration OK' },
  ],
  connection: { connected: true, metSeconds: 4 * 3600 + 12 * 60 + 37 },
};

const initialState = {
  missionMeta: { missionCode: null, linkStatus: null, latencySec: null, utc: null },
  stats: {
    activeSatellites: { value: null, total: null },
    telemetryChannels: { value: null, status: null },
    anomalyScore: { value: null, status: null },
    detectionRuns: { value: null, status: null },
  },
  satellites: [],
  systemHealth: [],
  anomalies: [],
  timeline: [],
  connection: { connected: false, metSeconds: null },
};

function missionReducer(state, action) {
  switch (action.type) {
    case 'DATA_LOADED':
      // Backend payload merges in wholesale once it arrives.
      return { ...state, ...action.payload };
    case 'MET_TICK':
      return {
        ...state,
        connection: { ...state.connection, metSeconds: (state.connection.metSeconds ?? 0) + 1 },
      };
    default:
      return state;
  }
}

const MissionContext = createContext();

export default function App({ user, onLogout }) {
  const [state, dispatch] = useReducer(missionReducer, initialState);
  const { missionMeta, stats, satellites, systemHealth, anomalies, timeline, connection } = state;

  const [activeNav, setActiveNav] = useState('overview');

  // useEffect(() => {
  //   fetch('/api/mission-overview')
  //     .then((r) => r.json())
  //     .then((data) => dispatch({ type: 'DATA_LOADED', payload: data }))
  //     .catch(() => {
  //     });
  // }, []);

  // Loads dummy data once on mount — swap this for the real fetch when the backend is ready.
  useEffect(() => {
    dispatch({ type: 'DATA_LOADED', payload: DUMMY_DATA });
  }, []);

  // Local MET clock — ticks while connected, cleans itself up.
  useEffect(() => {
    // if (!connection.connected) return;
    const id = setInterval(() => dispatch({ type: 'MET_TICK' }), 1000);
    return () => clearInterval(id);
  }, [connection.connected]);

  const handleNavClick = useCallback((id) => {
    setActiveNav(id);
  }, []);

  const criticalCount = useMemo(
    () => anomalies.filter((a) => a.severity === 'critical').length,
    [anomalies]
  );

  const avgHealth = useMemo(() => {
    if (systemHealth.length === 0) return null;
    const total = systemHealth.reduce((sum, s) => sum + (s.pct ?? 0), 0);
    return Math.round(total / systemHealth.length);
  }, [systemHealth]);

  return (
    <MissionContext.Provider value={{ missionMeta, connection }}>
      <div className="dash">
        <Sidebar activeNav={activeNav} onNavClick={handleNavClick} user={user} onLogout={onLogout} />

        <main className="main">
          <Header criticalCount={criticalCount} avgHealth={avgHealth} />

          <section className="stat-row">
            <StatCard icon={Satellite} label="Active Satellites"
              value={stats.activeSatellites.value} sub={stats.activeSatellites.total} accent="purple" />
            <StatCard icon={Radio} label="Telemetry Channels"
              value={stats.telemetryChannels.value} sub={stats.telemetryChannels.status} accent="white" />
            <StatCard icon={ChartNoAxesGantt} label="Anomaly Score"
              value={stats.anomalyScore.value} sub={stats.anomalyScore.status} accent="green" />
            <StatCard icon={Target} label="Detection Runs"
              value={stats.detectionRuns.value} sub={stats.detectionRuns.status} accent="white" />
          </section>

          <section className="mid-row">
            <OrbitalPanel satellites={satellites} />
            <SystemHealthPanel systemHealth={systemHealth} />
          </section>

          <section className="bottom-row">
            <AnomaliesPanel anomalies={anomalies} />
            <TimelinePanel timeline={timeline} />
          </section>
        </main>
      </div>
    </MissionContext.Provider>
  );
}

function Sidebar({ activeNav, onNavClick, user, onLogout }) {
  const { connection } = useContext(MissionContext);

  return (
    <aside className="sidebar">
      <div className="brand">
        <Wifi size={20} className="brand-icon" />
        <div>
          <div className="brand-name">SENTINEL</div>
          <div className="brand-sub">Orbital Telemetry</div>
        </div>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${activeNav === id ? 'active' : ''}`}
            onClick={() => onNavClick(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="conn-row">
          <span className={`dot ${connection.connected ? 'dot-on' : 'dot-off'}`} />
          <span>{connection.connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="met-label">Mission Elapsed Time</div>
        <div className="met-value">
          {connection.metSeconds != null ? formatMET(connection.metSeconds) : '--:--:--'}
        </div>

        <div className="account-row">
          <span className="account-email">{user?.email ?? user?.name ?? 'Guest'}</span>
          <button type="button" className="logout-btn" onClick={onLogout}>
            <LogOut size={13} />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function Header({ criticalCount, avgHealth }) {
  const { missionMeta } = useContext(MissionContext);

  return (
    <header className="header">
      <h1>Mission Overview</h1>
      <div className="header-badges">
        <span className="badge badge-purple">Mission: {missionMeta.missionCode ?? '—'}</span>
        <span className="badge badge-outline">
          {missionMeta.linkStatus ?? '—'}
          {missionMeta.latencySec != null && ` (${missionMeta.latencySec} sec latency)`}
        </span>
        <span className="badge badge-muted">UTC: {missionMeta.utc ?? '—'}</span>
        {criticalCount > 0 && (
          <span className="badge sev-critical">{criticalCount} critical</span>
        )}
        {avgHealth != null && (
          <span className="badge badge-muted">Avg health: {avgHealth}%</span>
        )}
      </div>
    </header>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <div className={`stat-value accent-${accent}`}>
        {value ?? '—'}
      </div>
      <div className="stat-sub">{sub ?? '—'}</div>
    </div>
  );
}

function OrbitalPanel({ satellites }) {
  const radii = [60, 100, 140];
  return (
    <div className="card panel">
      <div className="panel-header">
        <span>Orbital Status Visualization</span>
        <span className="panel-tag">Realtime Concentric Analysis</span>
      </div>
      <div className="orbital-canvas">
        <svg viewBox="0 0 300 260" width="100%" height="260">
          <circle cx="150" cy="130" r="20" className="orbit-core" />
          {radii.map((r) => (
            <circle key={r} cx="150" cy="130" r={r} className="orbit-ring" />
          ))}
          {satellites.map((sat) => {
            const rad = (sat.angle * Math.PI) / 180;
            const r = radii[Math.min(sat.radius, radii.length - 1)];
            const x = 150 + r * Math.cos(rad);
            const y = 130 + r * Math.sin(rad);
            return (
              <g key={sat.id}>
                <circle cx={x} cy={y} r="4" className={`sat-dot sat-${sat.status}`} />
                <text x={x + 8} y={y + 4} className="sat-label">
                  {sat.id}
                </text>
              </g>
            );
          })}
        </svg>
        {satellites.length === 0 && (
          <div className="empty-overlay">No satellite data</div>
        )}
      </div>
    </div>
  );
}

function SystemHealthPanel({ systemHealth }) {
  const subsystems = ['ADCS', 'EPS', 'COMMS', 'THERMAL', 'PROPULSION', 'PAYLOAD'];
  return (
    <div className="card panel">
      <div className="panel-header">
        <span>System Health</span>
      </div>
      <div className="health-list">
        {subsystems.map((name) => {
          const entry = systemHealth.find((s) => s.subsystem === name);
          const pct = entry?.pct ?? 0;
          return (
            <div className="health-row" key={name}>
              <div className="health-label">
                <span>{name}</span>
                <span>{entry?.pct != null ? `${entry.pct}%` : '—'}</span>
              </div>
              <div className="health-bar-track">
                <div className="health-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnomaliesPanel({ anomalies }) {
  return (
    <div className="card panel">
      <div className="panel-header">
        <span>Recent Telemetry Anomalies</span>
      </div>
      <table className="anomaly-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Channel</th>
            <th>Subsystem</th>
            <th>Score</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-cell">No anomalies reported</td>
            </tr>
          ) : (
            anomalies.map((a, i) => (
              <tr key={i}>
                <td>{a.timestamp}</td>
                <td className="mono">{a.channel}</td>
                <td>{a.subsystem}</td>
                <td>{a.score}</td>
                <td>
                  <span className={`sev-badge sev-${a.severity}`}>{a.severity}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TimelinePanel({ timeline }) {
  return (
    <div className="card panel">
      <div className="panel-header">
        <span>Mission Timeline (UTC)</span>
      </div>
      <div className="timeline-list">
        {timeline.length === 0 ? (
          <div className="empty-cell">No events logged</div>
        ) : (
          timeline.map((t, i) => (
            <div className="timeline-item" key={i}>
              <span className="timeline-dot" />
              <div>
                <div className="timeline-time">{t.time}</div>
                <div className="timeline-label">{t.label}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatMET(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
  return `MET ${h}:${m}:${s}`;
}