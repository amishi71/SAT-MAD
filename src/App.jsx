import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AppShell from "./components/AppShell";
import MissionProvider from "./context/MissionProvider";
import AnomaliesPage from "./pages/AnomaliesPage";
import OverviewPage from "./pages/OverviewPage";
import RunsPage from "./pages/RunsPage";
import SubsystemsPage from "./pages/SubsystemsPage";
import TelemetryPage from "./pages/TelemetryPage";

export default function App() {
  return (
    <BrowserRouter>
      <MissionProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="subsystems" element={<SubsystemsPage />} />
            <Route path="telemetry" element={<TelemetryPage />} />
            <Route path="anomalies" element={<AnomaliesPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
      </MissionProvider>
    </BrowserRouter>
  );
}
