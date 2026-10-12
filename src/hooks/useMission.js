import { useContext } from "react";
import { MissionContext } from "../context/MissionContext.js";

export function useMission() {
  const context = useContext(MissionContext);
  if (!context)
    throw new Error("useMission must be used within MissionProvider");
  return context;
}
