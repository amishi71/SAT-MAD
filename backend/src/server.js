import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { Channel, Mission } from "./models.js";
import { scorePca } from "./pca.js";

const app = express();
const port = process.env.PORT || 4000;
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/sentinel";
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
  },
};

app.use(cors());
app.use(express.json());
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/api/health", async (_request, response) =>
  response.json({
    status: "ok",
    service: "sentinel-api",
    database: mongoose.connection.readyState === 1 ? "connected" : "offline",
  }),
);
app.get("/api/datasets", async (_request, response) => {
  const datasets = await Mission.find(
    {},
    { _id: 0, key: 1, source: 1, channelCount: 1, anomalyCount: 1 },
  )
    .sort({ key: 1 })
    .lean();
  return response.json({ data: datasets });
});
app.get("/api/mission", async (request, response) => {
  const dataset = request.query.dataset || "esamission1";
  const mission = await Mission.findOne({ key: dataset }).lean();
  return mission
    ? response.json({
        source: mission.source,
        channelCount: mission.channelCount,
        anomalyCount: mission.anomalyCount,
      })
    : response.status(404).json({ error: "Mission data has not been seeded" });
});
app.get("/api/telemetry/channels", async (request, response) => {
  const filter = {
    dataset: request.query.dataset || "esamission1",
    ...(request.query.subsystem ? { subsystem: request.query.subsystem } : {}),
  };
  const data = await Channel.find(filter).sort({ id: 1 }).lean();
  return response.json({ data });
});
app.get("/api/telemetry/channels/:channelId", async (request, response) => {
  const channel = await Channel.findOne({
    dataset: request.query.dataset || "esamission1",
    id: request.params.channelId,
  }).lean();
  return channel
    ? response.json({ data: channel })
    : response.status(404).json({ error: "Channel not found" });
});
app.get("/api/detection/runs", async (request, response) => {
  const mission = await Mission.findOne({
    key: request.query.dataset || "esamission1",
  }).lean();
  return mission
    ? response.json({
        data: [
          {
            id: "ESA-MISSION1-INDEX",
            algorithm: "PCA reconstruction error",
            channels: mission.channelCount,
            anomalies: mission.anomalyCount,
            status: "active",
          },
        ],
      })
    : response.status(404).json({ error: "Mission data has not been seeded" });
});
app.get("/api/detection/pca", async (request, response) => {
  const dataset = request.query.dataset || "esamission1";
  if (!pcaCache.has(dataset)) {
    const channels = await Channel.find({ dataset }).sort({ id: 1 }).lean();
    pcaCache.set(dataset, scorePca(channels));
  }
  return response.json({ data: pcaCache.get(dataset) });
});

async function start() {
  await mongoose.connect(mongoUri);
  const channelCount = await Channel.countDocuments();
  if (!channelCount)
    throw new Error(
      "MongoDB is connected, but no ESA data is seeded. Run npm run seed in backend.",
    );
  app.listen(port, () =>
    console.log(
      `Sentinel API listening on port ${port} with ${channelCount} MongoDB channels`,
    ),
  );
}

start().catch((error) => {
  console.error(`Sentinel API startup failed: ${error.message}`);
  process.exit(1);
});
