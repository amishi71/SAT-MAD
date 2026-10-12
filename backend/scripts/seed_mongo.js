import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { Channel, Mission } from "../src/models.js";

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/sentinel";
const dataDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

const titleCase = (value) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const withDisplayNames = (channel, dataset) => ({
  ...channel,
  dataset,
  displayName: titleCase(channel.id),
  subsystemName: titleCase(channel.subsystem),
  unitName: titleCase(channel.unit),
  groupName: `Group ${channel.group}`,
});

const summaries = fs
  .readdirSync(dataDirectory)
  .filter((fileName) => fileName.endsWith("-summary.json"))
  .map((fileName) => JSON.parse(fs.readFileSync(path.join(dataDirectory, fileName), "utf8")));
await mongoose.connect(mongoUri);
await Channel.deleteMany({});
await Mission.deleteMany({});
await Channel.collection.dropIndexes();
await Channel.syncIndexes();
for (const summary of summaries) {
  const dataset = summary.key || (summary.source?.includes("2") ? "esamission2" : "esamission1");
  const source = summary.source || (dataset === "esamission2" ? "ESA Mission 2" : "ESA Mission 1");
  await Channel.insertMany(summary.channels.map((channel) => withDisplayNames(channel, dataset)));
  await Mission.create({
    key: dataset,
    source,
    channelCount: summary.channelCount,
    anomalyCount: summary.anomalyCount,
  });
  console.log(`Seeded ${summary.channelCount} ${source} channels and ${summary.anomalyCount} anomaly IDs`);
}
await mongoose.disconnect();
