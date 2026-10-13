"""Run the detector over an indexed ESA summary JSON (backend/data/*.json)."""

from __future__ import annotations

import argparse
import json

from .align import ChannelSeries, parse_times
from .pipeline import DetectionConfig, DetectionError, run_subsystem


def load_summary(path: str) -> dict[str, list[dict]]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    groups: dict[str, list[dict]] = {}
    for ch in data["channels"]:
        groups.setdefault(ch["subsystem"], []).append(ch)
    return groups


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dataset", help="path to a mission summary JSON")
    ap.add_argument("--out", help="write full JSON results here")
    ap.add_argument("--target-far", type=float, default=0.01)
    ap.add_argument("--replicates", type=int, default=500)
    ap.add_argument("--no-labels", action="store_true")
    ap.add_argument("--robustness", action="store_true")
    args = ap.parse_args(argv)

    cfg = DetectionConfig(
        target_far=args.target_far, bootstrap_replicates=args.replicates,
        run_robustness=args.robustness, include_scores=False,
    )
    results, errors = [], []
    for sub, chans in sorted(load_summary(args.dataset).items()):
        series = [
            ChannelSeries(
                c["id"], sub, parse_times([p["time"] for p in c["points"]]),
                [float("nan") if p["value"] is None else p["value"] for p in c["points"]],
                (c.get("valueType") or "numeric").lower(),
            )
            for c in chans
        ]
        labels = [] if args.no_labels else [
            (float(parse_times([a["startTime"]])[0]), float(parse_times([a["endTime"]])[0]))
            for c in chans for a in c["anomalies"]
        ]
        try:
            r = run_subsystem(sub, series, labels, cfg)
            results.append(r)
            ev = r["evaluation"] or {}
            print(
                f"{sub}: {len(r['channels_used'])} ch, k={r['model']['n_components']}, tau={r['threshold']:.4g}, "
                f"held-out FAR={(r['held_out_far'] or {}).get('far')}, "
                f"events={ev.get('n_events')}, recall={ev.get('event_recall')}"
            )
            for w in r["warnings"]:
                print(f"   warning: {w}")
        except DetectionError as exc:
            errors.append({"subsystem": sub, "detail": str(exc)})
            print(f"{sub}: SKIPPED - {exc}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"results": results, "errors": errors}, fh)
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(main())
