"""Create a compact, browser-friendly index from the ESA Mission-1 archive."""
import argparse
import csv
import json
import re
import zipfile
from io import BytesIO, TextIOWrapper
from pathlib import Path

import pandas as pd

MAX_POINTS = 120


def read_csv(archive, root, name):
    with archive.open(root + name) as stream:
        return list(csv.DictReader(TextIOWrapper(stream, encoding="utf-8")))


def channel_labels(labels, channel_id):
    return [label for label in labels if label["Channel"] == channel_id]


def compact_series(frame, numeric_values):
    if frame.empty:
        return [], []
    stride = max(1, len(frame) // MAX_POINTS)
    sampled = frame.iloc[::stride].iloc[:MAX_POINTS]
    sampled_values = numeric_values.iloc[::stride].iloc[:MAX_POINTS]
    return ([{"time": index.isoformat(), "value": round(float(value), 6)} for index, value in sampled_values.items()], [])


def build_summary(archive_path, output_path):
    with zipfile.ZipFile(archive_path) as archive:
        root = next(name for name in archive.namelist() if name.endswith(
            "/channels.csv")).removesuffix("channels.csv")
        mission_name = root.rstrip("/").replace("-", " ")
        mission_name = re.sub(r"Mission(\d+)", r"Mission \1", mission_name)
        mission_key = re.sub(r"[^a-z0-9]", "", mission_name.lower())
        catalog = read_csv(archive, root, "channels.csv")
        labels = read_csv(archive, root, "labels.csv")
        anomaly_types = {row["ID"]: row for row in read_csv(
            archive, root, "anomaly_types.csv")}
        channels = []
        for index, metadata in enumerate(catalog, 1):
            channel_id = metadata["Channel"]
            nested_name = f"{root}channels/{channel_id}.zip"
            print(f"[{index}/{len(catalog)}] {channel_id}")
            nested_bytes = archive.read(nested_name)
            with zipfile.ZipFile(BytesIO(nested_bytes)) as nested:
                raw = nested.read(channel_id)
            frame = pd.read_pickle(BytesIO(raw))
            column = frame.columns[0]
            raw_values = frame[column]
            numeric_values = pd.to_numeric(raw_values, errors="coerce")
            categories = []
            if numeric_values.notna().sum() < max(1, len(raw_values) // 2):
                categories = sorted(
                    raw_values.dropna().astype(str).unique().tolist())
                category_codes = {value: index for index,
                                  value in enumerate(categories)}
                numeric_values = raw_values.astype(
                    str).map(category_codes).astype(float)
            values = numeric_values.dropna()
            channel_anomalies = channel_labels(labels, channel_id)
            points, _ = compact_series(frame, numeric_values)
            channels.append({
                "id": channel_id,
                "name": channel_id,
                "dataset": mission_key,
                "subsystem": metadata["Subsystem"],
                "unit": metadata["Physical Unit"] or "unknown_unit",
                "group": metadata["Group"],
                "target": metadata["Target"],
                "sampleCount": int(len(values)),
                "startTime": frame.index[0].isoformat(),
                "endTime": frame.index[-1].isoformat(),
                "minimum": round(float(values.min()), 6),
                "maximum": round(float(values.max()), 6),
                "mean": round(float(values.mean()), 6),
                "current": round(float(values.iloc[-1]), 6),
                "currentLabel": str(raw_values.iloc[-1]),
                "valueType": "categorical" if categories else "numeric",
                "categories": categories,
                "points": points,
                "anomalies": [{
                    "id": item["ID"],
                    "startTime": item["StartTime"],
                    "endTime": item["EndTime"],
                    "category": anomaly_types.get(item["ID"], {}).get("Category", "Anomaly"),
                } for item in channel_anomalies],
            })

        summary = {
            "key": mission_key,
            "source": mission_name,
            "channelCount": len(channels),
            "anomalyCount": len({label["ID"] for label in labels}),
            "channels": channels,
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(
            summary, separators=(",", ":")), encoding="utf-8")
        print(
            f"Wrote {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    build_summary(arguments.archive, arguments.output)
