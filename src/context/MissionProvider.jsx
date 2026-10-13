
import { useEffect, useState } from "react";
import { MissionContext } from "./MissionContext";

const defaultDataset = "esamission1";

const detectionChannelIds = [
  "channel_4",
  "channel_5",
  "channel_6",
  "channel_7",
  "channel_8",
  "channel_9",
  "channel_10",
  "channel_11",
];

const detectionSubsystem = "subsystem_1";
const detectionConfig = { calibration_fraction: 0.4 };

function adaptDetection(payload, channels) {
  const result = payload?.results?.[0];

  if (!result) {
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.join("; ")
      : "";

    throw new Error(errors || "The detector returned no results.");
  }

  const scores = result.scores ?? {};
  const rawValues = Array.isArray(scores.values) ? scores.values : [];
  const startMs = Date.parse(scores.start);
  const stepSeconds = Number(scores.step_seconds);

  const series = rawValues.flatMap((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(startMs)) {
      return [];
    }

    return [
      {
        time: new Date(
          startMs + index * stepSeconds * 1000
        ).toISOString(),
        value,
      },
    ];
  });

  const alarms = Array.isArray(result.alarms) ? result.alarms : [];
  const usedChannels = Array.isArray(result.channels_used)
    ? result.channels_used
    : [];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings
    : [];
  const model = result.model ?? {};
  const calibration = result.calibration ?? null;

  const threshold = Number.isFinite(result.threshold)
    ? result.threshold
    : null;

  const latestScore = series.length
    ? series[series.length - 1].value
    : null;

  // These are the channels actually selected for this detector run.
  const selectedChannels = channels.filter((channel) =>
    usedChannels.includes(
      channel.channelId ?? channel.id ?? channel.name
    )
  );

  // The detector does not currently return per-channel contributions.
  // Do not manufacture contribution values.
  const contributors = [];

  // Preserve real channel counts and source annotations, but do not
  // invent health scores or completeness measurements.
  const subsystemNames = [
    ...new Set(
      channels
        .map((channel) => channel.subsystem)
        .filter(Boolean)
    ),
  ];

  const subsystems = subsystemNames.map((name) => {
    const subsystemChannels = channels.filter(
      (channel) => channel.subsystem === name
    );

    return {
      name,
      healthScore: null,
      completeness: null,
      channelCount: subsystemChannels.length,
      labeledAnomalies: subsystemChannels.reduce(
        (total, channel) =>
          total + (channel.anomalies?.length ?? 0),
        0
      ),
      detectionRun: name === result.subsystem,
    };
  });

  return {
    ...result,
    series,
    threshold,
    currentScore:
      latestScore === null ? null : Number(latestScore.toFixed(3)),
    sampleCount: series.length,
    anomalySamples: alarms.reduce(
      (total, alarm) => total + (alarm.n_rows ?? 1),
      0
    ),
    featureCount: usedChannels.length,
    components: model.n_components ?? null,
    contributors,
    alarms,
    warnings,
    calibration,
    channelsUsed: usedChannels,
    selectedChannels,
    subsystems,
    detectionStatus: "completed",
    evaluation: result.evaluation ?? null,
    heldOutFar: result.held_out_far ?? null,
    labelsUsed: result.splits?.labels_used ?? false,
  };
}

export default function MissionProvider({ children }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] =
    useState(defaultDataset);
  const [channels, setChannels] = useState([]);
  const [mission, setMission] = useState(null);
  const [detection, setDetection] = useState(null);
  const [error, setError] = useState("");

  const selectDataset = (dataset) => {
    setMission(null);
    setChannels([]);
    setDetection(null);
    setError("");
    setSelectedDataset(dataset);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      try {
        const response = await fetch("/api/datasets");
        const payload = await response.json();

        if (!response.ok || payload.error) {
          throw new Error(
            payload.error || "Unable to load datasets."
          );
        }

        if (!cancelled) {
          setDatasets(payload.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError(
            "Unable to load the available ESA datasets from the API."
          );
        }
      }
    }

    loadDatasets();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDataset() {
      setError("");
      setChannels([]);
      setMission(null);
      setDetection(null);

      try {
        const query = new URLSearchParams({
          dataset: selectedDataset,
        });

        const [channelResponse, missionResponse] =
          await Promise.all([
            fetch(`/api/telemetry/channels?${query}`),
            fetch(`/api/mission?${query}`),
          ]);

        const [channelPayload, missionPayload] =
          await Promise.all([
            channelResponse.json(),
            missionResponse.json(),
          ]);

        if (!channelResponse.ok || channelPayload.error) {
          throw new Error(
            channelPayload.error || "Unable to load telemetry channels."
          );
        }

        if (!missionResponse.ok || missionPayload.error) {
          throw new Error(
            missionPayload.error || "Unable to load mission details."
          );
        }

        const loadedChannels = channelPayload.data ?? [];

        if (!loadedChannels.length) {
          throw new Error("No telemetry channels were returned.");
        }

        const availableIds = new Set(
          loadedChannels.flatMap((channel) => [
            channel.channelId,
            channel.id,
            channel.name,
          ].filter(Boolean))
        );

        const availableDetectionChannels =
          detectionChannelIds.filter((id) =>
            availableIds.has(id)
          );

        if (!availableDetectionChannels.length) {
          throw new Error(
            `None of the configured detection channels are available in ${selectedDataset}.`
          );
        }

        const detectionResponse = await fetch(
          "/api/detection/run",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dataset: selectedDataset,
              subsystem: detectionSubsystem,
              channelIds: availableDetectionChannels,
              config: detectionConfig,
            }),
          }
        );

        const detectionPayload = await detectionResponse.json();

        if (!detectionResponse.ok) {
          const details =
            detectionPayload.details?.detail ??
            detectionPayload.details ??
            detectionPayload.error ??
            "Detection failed.";

          throw new Error(
            typeof details === "string"
              ? details
              : JSON.stringify(details)
          );
        }

        const adaptedDetection = adaptDetection(
          detectionPayload,
          loadedChannels
        );

        if (!cancelled) {
          setChannels(loadedChannels);
          setMission(missionPayload);
          setDetection(adaptedDetection);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            `Unable to load the dataset or run detection: ${err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    loadDataset();

    return () => {
      cancelled = true;
    };
  }, [selectedDataset]);

  if (error) {
    return (
      <div className="loading-screen">
        {error}
      </div>
    );
  }

  if (!mission || !channels.length || !detection) {
    return (
      <div className="loading-screen">
        <span className="status-dot" />
        Loading ESA telemetry and running PCA detection...
      </div>
    );
  }

  return (
    <MissionContext.Provider
      value={{
        channels,
        mission,
        detection,
        datasets,
        selectedDataset,
        selectDataset,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}
