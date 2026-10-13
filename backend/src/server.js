
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { Channel, Mission } from "./models.js";
import { scorePca } from "./pca.js";

const app = express();
const port = process.env.PORT || 4000;
const mongoUri =
  process.env.MONGO_URI || "mongodb://localhost:27017/sentinel";
const detectionUrl =
  process.env.DETECTION_URL || "http://localhost:8000";

const pcaCache = new Map();

const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "Sentinel Telemetry API", version: "0.2.0" },
  paths: {
    "/api/health": {
      get: {
        summary: "MongoDB service health",
        responses: {
          200: { description: "Healthy" },
          503: { description: "MongoDB unavailable" },
        },
      },
    },
    "/api/datasets": {
      get: {
        summary: "List available ESA datasets",
        responses: { 200: { description: "Dataset list" } },
      },
    },
    "/api/mission": {
      get: {
        summary: "Selected ESA mission index metadata",
        responses: { 200: { description: "Mission metadata" } },
      },
    },
    "/api/telemetry/channels": {
      get: {
        summary: "List MongoDB-backed ESA channels",
        responses: { 200: { description: "Channel list" } },
      },
    },
    "/api/telemetry/channels/{channelId}": {
      get: {
        summary: "Read one MongoDB-backed ESA channel",
        responses: {
          200: { description: "Channel detail" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/detection/pca": {
      get: {
        summary: "Compute PCA multivariate anomaly scores",
        responses: {
          200: { description: "PCA score series and contributors" },
        },
      },
    },
    "/api/detection/run": {
      post: {
        summary: "Run Python PCA anomaly detection",
        responses: {
          200: { description: "Detection results" },
          400: { description: "Invalid channel selection" },
          502: { description: "Detection service unavailable" },
        },
      },
    },
  },
};

app.use(cors());
app.use(express.json());

app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument),
);

// Health
app.get("/api/health", async (_request, response) => {
  response.json({
    status: "ok",
    service: "sentinel-api",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "offline",
  });
});

// Available datasets
app.get("/api/datasets", async (_request, response) => {
  try {
    const datasets = await Mission.find(
      {},
      { _id: 0, key: 1, source: 1, channelCount: 1, anomalyCount: 1 },
    )
      .sort({ key: 1 })
      .lean();

    return response.json({ data: datasets });
  } catch (error) {
    console.error("Dataset lookup failed:", error);
    return response.status(500).json({
      error: "Unable to load datasets.",
    });
  }
});

// Mission metadata
app.get("/api/mission", async (request, response) => {
  try {
    const dataset = request.query.dataset || "esamission1";
    const mission = await Mission.findOne({ key: dataset }).lean();

    return mission
      ? response.json({
        source: mission.source,
        channelCount: mission.channelCount,
        anomalyCount: mission.anomalyCount,
      })
      : response.status(404).json({
        error: "Mission data has not been seeded.",
      });
  } catch (error) {
    console.error("Mission lookup failed:", error);
    return response.status(500).json({
      error: "Unable to load mission metadata.",
    });
  }
});

// List telemetry channels
app.get("/api/telemetry/channels", async (request, response) => {
  try {
    const filter = {
      dataset: request.query.dataset || "esamission1",
      ...(request.query.subsystem
        ? { subsystem: request.query.subsystem }
        : {}),
    };

    const data = await Channel.find(filter).sort({ id: 1 }).lean();

    return response.json({ data });
  } catch (error) {
    console.error("Channel lookup failed:", error);
    return response.status(500).json({
      error: "Unable to load telemetry channels.",
    });
  }
});

// Get one telemetry channel
app.get(
  "/api/telemetry/channels/:channelId",
  async (request, response) => {
    try {
      const channel = await Channel.findOne({
        dataset: request.query.dataset || "esamission1",
        id: request.params.channelId,
      }).lean();

      return channel
        ? response.json({ data: channel })
        : response.status(404).json({
          error: "Channel not found.",
        });
    } catch (error) {
      console.error("Channel lookup failed:", error);
      return response.status(500).json({
        error: "Unable to load the channel.",
      });
    }
  },
);

// Detection run listing (existing index metadata)
app.get("/api/detection/runs", async (request, response) => {
  try {
    const mission = await Mission.findOne({
      key: request.query.dataset || "esamission1",
    }).lean();

    return mission
      ? response.json({
        data: [
          {
            id: `${mission.key}-INDEX`,
            algorithm: "PCA reconstruction error",
            channels: mission.channelCount,
            anomalies: mission.anomalyCount,
            status: "active",
          },
        ],
      })
      : response.status(404).json({
        error: "Mission data has not been seeded.",
      });
  } catch (error) {
    console.error("Detection run lookup failed:", error);
    return response.status(500).json({
      error: "Unable to load detection run metadata.",
    });
  }
});

// Legacy JavaScript PCA endpoint (kept for compatibility)
app.get("/api/detection/pca", async (request, response) => {
  try {
    const dataset = request.query.dataset || "esamission1";

    if (!pcaCache.has(dataset)) {
      const channels = await Channel.find({ dataset })
        .sort({ id: 1 })
        .lean();

      pcaCache.set(dataset, scorePca(channels));
    }

    return response.json({ data: pcaCache.get(dataset) });
  } catch (error) {
    console.error("Legacy PCA request failed:", error);
    return response.status(500).json({
      error: "Unable to compute legacy PCA scores.",
    });
  }
});

// Actual Python detection endpoint
app.post("/api/detection/run", async (request, response) => {
  try {
    const dataset = request.body.dataset || "esamission1";
    const subsystem = request.body.subsystem;
    const channelIds = request.body.channelIds;

    if (
      channelIds !== undefined &&
      (!Array.isArray(channelIds) ||
        channelIds.length < 2 ||
        channelIds.some(
          (id) => typeof id !== "string" || !id.trim(),
        ))
    ) {
      return response.status(400).json({
        error: "channelIds must contain at least two valid channel IDs.",
      });
    }

    const filter = {
      dataset,
      ...(subsystem ? { subsystem } : {}),
      ...(channelIds ? { id: { $in: channelIds } } : {}),
    };

    const channels = await Channel.find(filter)
      .sort({ id: 1 })
      .lean();

    if (channels.length < 2) {
      return response.status(400).json({
        error: "At least two matching channels are required.",
      });
    }

    const payload = {
      dataset,
      channels: channels.map((channel) => ({
        id: channel.id,
        subsystem: channel.subsystem,
        valueType: channel.valueType || "numeric",
        points: (channel.points || []).map((point) => ({
          time: point.time,
          value: point.value,
        })),
        anomalies: (channel.anomalies || []).map((anomaly) => ({
          id: anomaly.id,
          startTime: anomaly.startTime,
          endTime: anomaly.endTime,
        })),
      })),
      ...(request.body.config
        ? { config: request.body.config }
        : {}),
    };

    const detectorResponse = await fetch(
      `${detectionUrl}/detect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      },
    );

    const result = await detectorResponse.json();

    if (!detectorResponse.ok) {
      return response.status(detectorResponse.status).json({
        error: "Detection service could not process this dataset.",
        details: result,
      });
    }

    return response.json({
      status: "completed",
      dataset,
      results: result.results,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Detection request failed:", error);

    return response.status(502).json({
      error: "Could not complete detection.",
      details: error.message,
    });
  }
});

// Start server only after registering all routes
async function start() {
  await mongoose.connect(mongoUri);

  const channelCount = await Channel.countDocuments();

  if (!channelCount) {
    throw new Error(
      "MongoDB is connected, but no ESA data is seeded. Run npm run seed in backend.",
    );
  }

  app.listen(port, () => {
    console.log(
      `Sentinel API listening on port ${port} with ${channelCount} MongoDB channels`,
    );
  });
}

start().catch((error) => {
  console.error(`Sentinel API startup failed: ${error.message}`);
  process.exit(1);
});
