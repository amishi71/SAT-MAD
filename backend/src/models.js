import mongoose from "mongoose";

const anomalySchema = new mongoose.Schema(
  { id: String, startTime: String, endTime: String, category: String },
  { _id: false },
);
const pointSchema = new mongoose.Schema(
  { time: String, value: Number },
  { _id: false },
);
const channelSchema = new mongoose.Schema(
  {
    id: { type: String, index: true },
    dataset: { type: String, index: true },
    displayName: String,
    subsystem: { type: String, index: true },
    subsystemName: String,
    unit: String,
    unitName: String,
    group: String,
    groupName: String,
    target: String,
    sampleCount: Number,
    startTime: String,
    endTime: String,
    minimum: Number,
    maximum: Number,
    mean: Number,
    current: Number,
    currentLabel: String,
    valueType: String,
    categories: [String],
    points: [pointSchema],
    anomalies: [anomalySchema],
  },
  { timestamps: true },
);
channelSchema.index({ dataset: 1, id: 1 }, { unique: true });
const missionSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true },
    source: String,
    channelCount: Number,
    anomalyCount: Number,
  },
  { timestamps: true },
);

export const Channel = mongoose.model("Channel", channelSchema);
export const Mission = mongoose.model("Mission", missionSchema);
