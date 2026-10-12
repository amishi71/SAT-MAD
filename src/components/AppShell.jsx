import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navItems } from "../data/navigation";
import { useMission } from "../hooks/useMission";

export default function AppShell() {
  const { mission, datasets, selectedDataset, selectDataset } = useMission();
  const location = useLocation();
  const title =
    navItems.find((item) => item.path === location.pathname)?.label ||
    "Mission overview";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">+</div>
          <div>
            <strong>SENTINEL</strong>
            <span>ORBITAL TELEMETRY</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              key={item.path}
              to={item.path}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" /> DATA READY
          <small>INDEXED SOURCE</small>
          <strong>{mission.source.toUpperCase()}</strong>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            MISSION DATA <span>/</span> {mission.source.toUpperCase()}
          </div>
          <div className="topbar-actions">
            <label className="dataset-control">
              <span>DATASET</span>
              <select
                value={selectedDataset}
                onChange={(event) => selectDataset(event.target.value)}
                aria-label="Select ESA telemetry dataset"
              >
                {datasets.map((dataset) => (
                  <option key={dataset.key} value={dataset.key}>
                    {dataset.source}
                  </option>
                ))}
              </select>
            </label>
            <span className="active-link">
              <span className="status-dot" /> API INDEX ONLINE
            </span>
            <span className="utc">{mission.channelCount} CHANNELS</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">ESA MISSION-1 / INGESTED TELEMETRY</p>
              <h1>{title}</h1>
              <p className="subtitle">
                Exploring the indexed source data, channel statistics, and
                labeled intervals.
              </p>
            </div>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
