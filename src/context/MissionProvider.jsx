import { useEffect, useState, useCallback } from "react";
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
      ? payload.errors.map((e) => (typeof e === "string" ? e : e?.detail || JSON.stringify(e))).join("; ")
      : "";

    throw new Error(errors || "The detector returned no results.");
  }

  const scores = result.scores ?? {};
  const rawValues = Array.isArray(scores.values) ? scores.values : [];
  const startMs = Date.parse(scores.start);
  const stepSeconds = Number(scores.step_seconds) || 1;

  const series = rawValues.flatMap((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(startMs)) {
      return [];
    }

    return [
      {
        time: new Date(startMs + index * stepSeconds * 1000).toISOString(),
        value,
      },
    ];
  });

  const alarms = Array.isArray(result.alarms) ? result.alarms : [];
  const usedChannels = Array.isArray(result.channels_used)
    ? result.channels_used
    : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const model = result.model ?? {};
  const calibration = result.calibration ?? null;

  const threshold = Number.isFinite(result.threshold)
    ? result.threshold
    : null;

  const latestScore = series.length ? series[series.length - 1].value : null;

  // Selected channels used by PCA
  const selectedChannels = channels.filter((channel) =>
    usedChannels.includes(channel.channelId ?? channel.id ?? channel.name),
  );

  // Subsystem list with PCA health integration
  const subsystemNames = [
    ...new Set(channels.map((channel) => channel.subsystem).filter(Boolean)),
  ];

  const anomalySamples = alarms.reduce(
    (total, alarm) => total + (alarm.n_rows ?? 1),
    0,
  );

  const subsystems = subsystemNames.map((name) => {
    const subsystemChannels = channels.filter(
      (channel) => channel.subsystem === name,
    );

    let totalPoints = 0;
    let validPoints = 0;
    for (const ch of subsystemChannels) {
      if (Array.isArray(ch.points)) {
        for (const p of ch.points) {
          totalPoints++;
          if (p.value !== null && Number.isFinite(p.value)) {
            validPoints++;
          }
        }
      }
    }
    const channelCompleteness = totalPoints > 0
      ? Math.round((validPoints / totalPoints) * 100)
      : 100;

    const isDetectionSubsystem = name === result.subsystem;

    let healthScore = null;
    if (isDetectionSubsystem && series.length > 0) {
      // PCA reconstruction score drives anomaly health for the scored subsystem
      healthScore = Math.max(
        0,
        Math.min(100, Math.round((1 - anomalySamples / series.length) * 100)),
      );
    }

    return {
      name,
      healthScore,
      completeness: isDetectionSubsystem && result.gaps?.scorable_fraction != null
        ? Math.round(result.gaps.scorable_fraction * 100)
        : channelCompleteness,
      channelCount: subsystemChannels.length,
      labeledAnomalies: subsystemChannels.reduce(
        (total, channel) => total + (channel.anomalies?.length ?? 0),
        0,
      ),
      detectionRun: isDetectionSubsystem,
    };
  });

  return {
    ...result,
    series,
    threshold,
    currentScore:
      latestScore === null ? null : Number(latestScore.toFixed(3)),
    sampleCount: series.length,
    anomalySamples,
    featureCount: usedChannels.length,
    components: model.n_components ?? null,
    contributors: [], // Detector does not fabricate per-channel weights
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
    gaps: result.gaps ?? null,
    splits: result.splits ?? null,
    model: result.model ?? null,
  };
}

function adaptLegacyDetection(legacyData, channels) {
  const series = legacyData.series || [];
  const threshold = legacyData.threshold ?? 1;
  const currentScore = legacyData.currentScore ?? 0;
  const anomalySamples = legacyData.anomalySamples ?? 0;
  const components = legacyData.components ?? 2;
  const contributors = legacyData.contributors ?? [];

  const subsystemNames = [
    ...new Set(channels.map((channel) => channel.subsystem).filter(Boolean)),
  ];

  const subsystems = subsystemNames.map((name) => {
    const subsystemChannels = channels.filter(
      (channel) => channel.subsystem === name,
    );
    const isDetectionSubsystem = name === "subsystem_1";
    let healthScore = null;
    if (isDetectionSubsystem && series.length > 0) {
      healthScore = Math.max(
        0,
        Math.min(100, Math.round((1 - anomalySamples / series.length) * 100)),
      );
    }
    return {
      name,
      healthScore,
      completeness: 100,
      channelCount: subsystemChannels.length,
      labeledAnomalies: subsystemChannels.reduce(
        (total, channel) => total + (channel.anomalies?.length ?? 0),
        0,
      ),
      detectionRun: isDetectionSubsystem,
    };
  });

  return {
    subsystem: "subsystem_1",
    series,
    threshold,
    currentScore,
    sampleCount: series.length,
    anomalySamples,
    featureCount: legacyData.featureCount || 8,
    components,
    contributors,
    alarms: [],
    warnings: ["Using legacy MongoDB PCA scoring (Python detector offline)."],
    calibration: { target_far: 0.05, threshold_mode: "percentile_95" },
    channelsUsed: detectionChannelIds,
    selectedChannels: channels.filter((c) => detectionChannelIds.includes(c.id)),
    subsystems,
    detectionStatus: "legacy",
    evaluation: null,
    heldOutFar: null,
    labelsUsed: false,
    gaps: null,
    splits: null,
    model: { algorithm: "Legacy PCA reconstruction", n_components: components },
  };
}

function createFallbackDetection(channels) {
  const subsystemNames = [
    ...new Set(channels.map((channel) => channel.subsystem).filter(Boolean)),
  ];

  const subsystems = subsystemNames.map((name) => {
    const subsystemChannels = channels.filter(
      (channel) => channel.subsystem === name,
    );
    return {
      name,
      healthScore: null,
      completeness: 100,
      channelCount: subsystemChannels.length,
      labeledAnomalies: subsystemChannels.reduce(
        (total, channel) => total + (channel.anomalies?.length ?? 0),
        0,
      ),
      detectionRun: false,
    };
  });

  return {
    subsystem: "subsystem_1",
    series: [],
    threshold: 1.0,
    currentScore: 0,
    sampleCount: 0,
    anomalySamples: 0,
    featureCount: 0,
    components: 0,
    contributors: [],
    alarms: [],
    warnings: ["Detection service offline. Telemetry and source labels are still available."],
    calibration: null,
    channelsUsed: [],
    selectedChannels: [],
    subsystems,
    detectionStatus: "offline",
    evaluation: null,
    heldOutFar: null,
    labelsUsed: false,
    gaps: null,
    splits: null,
    model: null,
  };
}

export default function MissionProvider({ children }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(defaultDataset);
  const [channels, setChannels] = useState([]);
  const [mission, setMission] = useState(null);
  const [detection, setDetection] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState("loading"); // 'loading' | 'completed' | 'legacy' | 'offline'
  const [detectionWarning, setDetectionWarning] = useState("");
  const [error, setError] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);

  const selectDataset = (dataset) => {
    setMission(null);
    setChannels([]);
    setDetection(null);
    setDetectionStatus("loading");
    setDetectionWarning("");
    setError("");
    setSelectedDataset(dataset);
  };

  // 1. Load available datasets list
  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      try {
        const response = await fetch("/api/datasets");
        const payload = await response.json();

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Unable to load datasets.");
        }

        if (!cancelled) {
          setDatasets(payload.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load the available ESA datasets from the API.");
        }
      }
    }

    loadDatasets();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Load mission & channels & run detection
  const loadDatasetData = useCallback(async () => {
    try {
      const query = new URLSearchParams({ dataset: selectedDataset });

      const [channelResponse, missionResponse] = await Promise.all([
        fetch(`/api/telemetry/channels?${query}`),
        fetch(`/api/mission?${query}`),
      ]);

      const [channelPayload, missionPayload] = await Promise.all([
        channelResponse.json(),
        missionResponse.json(),
      ]);

      if (!channelResponse.ok || channelPayload.error) {
        throw new Error(
          channelPayload.error || "Unable to load telemetry channels.",
        );
      }

      if (!missionResponse.ok || missionPayload.error) {
        throw new Error(
          missionPayload.error || "Unable to load mission details.",
        );
      }

      const loadedChannels = channelPayload.data ?? [];
      if (!loadedChannels.length) {
        throw new Error("No telemetry channels were returned from MongoDB.");
      }

      setChannels(loadedChannels);
      setMission(missionPayload);

      // Now attempt detection
      const availableIds = new Set(
        loadedChannels.flatMap((channel) =>
          [channel.channelId, channel.id, channel.name].filter(Boolean),
        ),
      );

      const availableDetectionChannels = detectionChannelIds.filter((id) =>
        availableIds.has(id),
      );

      let detectorResult = null;

      if (availableDetectionChannels.length >= 2) {
        try {
          const detectionResponse = await fetch("/api/detection/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataset: selectedDataset,
              subsystem: detectionSubsystem,
              channelIds: availableDetectionChannels,
              config: detectionConfig,
            }),
          });

          const detectionPayload = await detectionResponse.json();

          if (detectionResponse.ok && detectionPayload.results?.length) {
            detectorResult = adaptDetection(detectionPayload, loadedChannels);
            setDetectionStatus("completed");
            setDetectionWarning("");
          } else {
            console.warn("Detection service issue:", detectionPayload);
            setDetectionWarning(
              detectionPayload?.details?.detail ||
                detectionPayload?.error ||
                "Detection service returned an error.",
            );
          }
        } catch (detErr) {
          console.warn("Detection service unreachable:", detErr);
          setDetectionWarning("Python detection service unreachable on port 8000.");
        }
      }

      // If python detector was not available, try MongoDB legacy PCA
      if (!detectorResult) {
        try {
          const legacyRes = await fetch(`/api/detection/pca?${query}`);
          if (legacyRes.ok) {
            const legacyData = await legacyRes.json();
            if (legacyData.data) {
              detectorResult = adaptLegacyDetection(legacyData.data, loadedChannels);
              setDetectionStatus("legacy");
            }
          }
        } catch (legErr) {
          console.warn("Legacy PCA fallback failed:", legErr);
        }
      }

      // If both unavailable, construct safe fallback
      if (!detectorResult) {
        detectorResult = createFallbackDetection(loadedChannels);
        setDetectionStatus("offline");
      }

      setDetection(detectorResult);
    } catch (err) {
      setError(
        `Failed to load dataset: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [selectedDataset]);

  useEffect(() => {
    let cancelled = false;
    async function executeLoad() {
      if (!cancelled) {
        await loadDatasetData();
      }
    }
    executeLoad();
    return () => {
      cancelled = true;
    };
  }, [loadDatasetData]);

  const retryDetection = async () => {
    setIsRetrying(true);
    await loadDatasetData();
    setIsRetrying(false);
  };

  if (error) {
    return (
      <div className="loading-screen">
        <div className="error-dialog">
          <div className="error-icon">⚠️</div>
          <h3>System Initialization Alert</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => loadDatasetData()}
            >
              Retry Connection
            </button>
            <button
              type="button"
              className="chart-btn"
              onClick={() => selectDataset("esamission1")}
            >
              Reset to Mission 1
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mission || !channels.length || !detection) {
    return (
      <div className="loading-screen">
        <span className="status-dot green" />
        Loading ESA telemetry from MongoDB and running PCA anomaly scoring...
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
        detectionStatus,
        detectionWarning,
        retryDetection,
        isRetrying,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}
