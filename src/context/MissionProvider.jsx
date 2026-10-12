import { useEffect, useState } from "react";
import { MissionContext } from "./MissionContext";

const defaultDataset = "esamission1";

export default function MissionProvider({ children }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(defaultDataset);
  const [channels, setChannels] = useState([]);
  const [mission, setMission] = useState(null);
  const [error, setError] = useState("");
  const selectDataset = (dataset) => {
    setMission(null);
    setChannels([]);
    setSelectedDataset(dataset);
  };

  useEffect(() => {
    fetch("/api/datasets")
      .then((response) => response.json())
      .then((payload) => setDatasets(payload.data))
      .catch(() =>
        setError("Unable to load the available ESA datasets from the API."),
      );
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ dataset: selectedDataset });
    Promise.all([
      fetch(`/api/telemetry/channels?${query}`).then((response) => response.json()),
      fetch(`/api/mission?${query}`).then((response) => response.json()),
    ])
      .then(([channelPayload, missionPayload]) => {
        if (channelPayload.error || missionPayload.error) {
          throw new Error("Selected dataset is not available");
        }
        setChannels(channelPayload.data);
        setMission(missionPayload);
      })
      .catch(() =>
        setError("Unable to load the selected ESA dataset. Check the MongoDB seed."),
      );
  }, [selectedDataset]);

  if (error) return <div className="loading-screen">{error}</div>;
  if (!mission || !channels.length)
    return (
      <div className="loading-screen">
        <span className="status-dot" /> Loading ESA dataset...
      </div>
    );

  return (
    <MissionContext.Provider
      value={{
        channels,
        mission,
        datasets,
        selectedDataset,
        selectDataset,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}
