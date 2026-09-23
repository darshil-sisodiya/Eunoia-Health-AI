"""Measured prototype evaluation. Run from any directory; see README.md."""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import platform
import random
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import risk_engine
import cost_estimator
import specialization_mapper as mapper

# Authored workload, frozen before measurement. No patient observations or labels.
QUERIES = [
    "skin itching", "knee pain", "blurred vision", "ear pain", "tooth pain",
    "acid reflux", "migraine", "hair loss", "back pain", "nasal congestion",
    "frequent urination", "difficulty sleeping", "joint stiffness", "dry eyes",
    "sore throat", "persistent cough", "anxiety", "constipation",
    "high blood pressure", "shortness of breath",
]
PARAPHRASES = [
    "my skin feels itchy", "pain in my knee", "my vision is blurry",
    "pain in my ear", "my tooth hurts", "reflux of stomach acid",
    "I have a migraine", "my hair is falling out", "pain in my back",
    "my nose is congested", "I urinate frequently", "I find it difficult to sleep",
    "my joints feel stiff", "my eyes feel dry", "my throat feels sore",
    "I keep coughing", "I feel anxious", "I am constipated",
    "high bp", "sob",
]


def write_csv(path, rows, fields=None):
    rows = list(rows)
    fields = fields or (list(rows[0]) if rows else [])
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path, required):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not set(required).issubset(reader.fieldnames or []):
            raise ValueError(f"{path.name}: required columns: {required}")
        return [r for r in reader if any(v for v in r.values())]


def unique(rows, keys):
    seen = set()
    for row in rows:
        key = tuple(row[k] for k in keys)
        if key in seen:
            raise ValueError(f"Duplicate observation: {key}")
        seen.add(key)


def number(value, name):
    result = float(value)
    if not np.isfinite(result) or result < 0:
        raise ValueError(f"{name} must be finite and nonnegative")
    return result


def binary(value):
    if value not in ("0", "1"):
        raise ValueError("success must be 0 or 1")
    return int(value)


def save_fig(out, name, fig, note):
    fig.text(.02, .015, note, fontsize=8, va="bottom")
    fig.tight_layout(rect=(0, .085, 1, 1))
    for ext in ("png", "pdf", "svg"):
        fig.savefig(out / f"{name}.{ext}", dpi=300, bbox_inches="tight")
    plt.close(fig)


def profile(age):
    return {
        "basic": {"age": age, "gender": "female", "height_cm": 165, "weight_kg": 65},
        "lifestyle": {"smoking": "never", "alcohol": "never",
                      "exercise_frequency": "daily", "sleep_quality": "fair",
                      "stress_level": "moderate", "water_intake": "moderate"},
        "medical": {"conditions": [], "allergies": [], "current_medications": []},
        "family_history": {"entries": []},
        "location": {"state": "Karnataka", "city": "Bengaluru"},
    }


def latency(out, inputs, repeats, seed, status):
    workloads = []
    profiles = [profile(age) for age in (25, 35, 45, 55, 65)]
    write_csv(out / "latency_workload.csv", [
        {"case_id": i, "query": q, "profile_json": json.dumps(profiles[i % 5])}
        for i, q in enumerate(QUERIES)
    ])
    jobs = {
        "Risk scoring": lambda i: risk_engine.compute_risk(profiles[i % 5]),
        "Specialty mapping": lambda i: mapper.best_specialization(QUERIES[i % len(QUERIES)]),
        "Karnataka estimator": lambda i: cost_estimator.estimate(
            city="Mysuru", condition_text=QUERIES[i % len(QUERIES)]),
    }
    try:
        import bangalore_estimator
        if not bangalore_estimator.AVAILABLE:
            raise RuntimeError("Bangalore dataset loader unavailable")
        jobs["Bangalore estimator"] = lambda i: bangalore_estimator.estimate(
            city="Bengaluru", condition_text=QUERIES[i % len(QUERIES)])
    except Exception as exc:
        status["Bangalore latency"] = f"Unavailable: {type(exc).__name__}: {exc}"
    try:
        import pdf_generator

        def pdf_job(i):
            result = pdf_generator.create_health_report_pdf(
                "Constructed evaluation profile", profiles[i % 5]["basic"],
                "Fixed evaluation text; no AI generation measured.")
            if not result.getvalue().startswith(b"%PDF"):
                raise ValueError("Invalid PDF output")
            return result
        jobs["PDF rendering"] = pdf_job
    except Exception as exc:
        status["PDF latency"] = f"Unavailable: {type(exc).__name__}: {exc}"
    # Warmups are preserved but excluded from summary. Failures are never discarded.
    for name, fn in jobs.items():
        for i in range(5):
            workloads.append((name, fn, i, 1))
    measured = [(name, fn, i, 0) for name, fn in jobs.items() for i in range(repeats)]
    random.Random(seed).shuffle(measured)
    workloads.extend(measured)
    raw = []
    for name, fn, i, warmup in workloads:
        start = time.perf_counter_ns()
        error = ""
        try:
            fn(i)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
        elapsed = (time.perf_counter_ns() - start) / 1e6
        raw.append(dict(feature=name, trial=i, case_id=i % len(QUERIES),
                        elapsed_ms=elapsed, success=int(not error), warmup=warmup,
                        measurement_scope="local function", error=error))
    write_csv(out / "latency_raw.csv", raw)
    rows = [r for r in raw if not r["warmup"]]
    external = read_csv(inputs / "external_latency.csv",
                        ["feature", "trial", "elapsed_ms", "success", "measurement_scope", "source"])
    unique(external, ["feature", "trial", "measurement_scope"])
    for r in external:
        if not r["source"].strip() or not r["measurement_scope"].strip():
            raise ValueError("External timings require source and measurement_scope")
        rows.append(dict(feature=r["feature"], trial=r["trial"],
                         elapsed_ms=number(r["elapsed_ms"], "elapsed_ms"),
                         success=binary(r["success"]), measurement_scope=r["measurement_scope"]))
    groups = defaultdict(list)
    for r in rows:
        groups[(r["measurement_scope"], r["feature"])].append(r)
    summary = []
    for (scope, feature), group in sorted(groups.items()):
        times = [r["elapsed_ms"] for r in group if r["success"]]
        summary.append(dict(scope=scope, feature=feature, attempts=len(group),
                            successful=sum(r["success"] for r in group),
                            median_ms=float(np.median(times)) if times else "",
                            p95_ms=float(np.percentile(times, 95)) if times else ""))
    write_csv(out / "latency_summary.csv", summary)
    for idx, scope in enumerate(sorted({key[0] for key in groups})):
        valid = [(key[1], [r["elapsed_ms"] for r in group if r["success"]])
                 for key, group in sorted(groups.items()) if key[0] == scope]
        valid = [(name, vals) for name, vals in valid if vals]
        if not valid:
            continue
        fig, ax = plt.subplots(figsize=(9, 5))
        ax.boxplot([vals for _, vals in valid], vert=False,
                   labels=[f"{name} (n={len(vals)})" for name, vals in valid], showfliers=True)
        ax.set_xscale("log")
        ax.set_xlabel("Elapsed time (ms, logarithmic scale)")
        ax.set_title(f"Execution time — {scope}")
        ax.grid(axis="x", alpha=.2)
        save_fig(out, f"latency_{idx + 1}", fig,
                 "Successful attempts only; failures reported in latency_summary.csv.\n"
                 "Local measurements exclude startup, network, database and AI inference; five warmups per module.")
    status["Latency"] = f"Measured {repeats} attempts per available local module. AI/network timings need external_latency.csv."


def robustness(out, status):
    rows = []
    for i, query in enumerate(QUERIES):
        baseline = mapper.best_specialization(query)
        # Fixed deterministic one-character deletion, not selected after seeing results.
        words = query.split()
        j = max(range(len(words)), key=lambda k: len(words[k]))
        word = words[j]
        mid = len(word) // 2
        words[j] = word[:mid] + word[mid + 1:]
        variants = {"Uppercase": query.upper(), "Punctuation": query + "!!!",
                    "Extra spaces": "   ".join(query.split()),
                    "Single typo": " ".join(words), "Authored rewording": PARAPHRASES[i]}
        for kind, text in variants.items():
            prediction = mapper.best_specialization(text)
            rows.append(dict(case_id=i, original=query, variant_type=kind, variant=text,
                             original_prediction=baseline, variant_prediction=prediction,
                             agreement=int(prediction == baseline)))
    write_csv(out / "robustness_raw.csv", rows)
    summary = []
    for kind in variants:
        group = [r for r in rows if r["variant_type"] == kind]
        summary.append(dict(variant=kind, cases=len(group),
                            agreeing=sum(r["agreement"] for r in group),
                            agreement_percent=100 * np.mean([r["agreement"] for r in group])))
    write_csv(out / "robustness_summary.csv", summary)
    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.barh([r["variant"] for r in summary], [r["agreement_percent"] for r in summary], color="#356a95")
    ax.bar_label(bars, labels=[f"{r['agreeing']}/{r['cases']}" for r in summary], padding=4)
    ax.set(xlim=(0, 115), xlabel="Agreement with original prediction (%)",
           title="Specialty mapping: consistency under input changes", xticks=[0, 25, 50, 75, 100])
    save_fig(out, "robustness", fig,
             "20 constructed base queries, paired across five transformations. Agreement is not clinical accuracy.\n"
             "Authored rewordings are not independently reviewed; no patient observations are used.")
    status["Robustness"] = "Measured on 20 constructed queries and 100 variants; not clinical validation."


def specialty(out, inputs, status):
    rows = read_csv(inputs / "specialty_labels.csv",
                    ["case_id", "text", "expected_specialty", "reviewer_id", "source"])
    if not rows:
        status["Specialty accuracy"] = "Pending independent labelled cases in specialty_labels.csv."
        return
    unique(rows, ["case_id"])
    known = set(mapper.SPECIALIZATIONS) | {"General Physician", "Internal Medicine"}
    for row in rows:
        if not all(row[k].strip() for k in ("case_id", "text", "reviewer_id", "source")):
            raise ValueError("Specialty cases require IDs, text, reviewer and source")
        if row["expected_specialty"] not in known:
            raise ValueError(f"Unknown specialty: {row['expected_specialty']}")
        row["predicted"] = mapper.best_specialization(row["text"])
    labels = sorted({r["expected_specialty"] for r in rows} | {r["predicted"] for r in rows})
    matrix = np.zeros((len(labels), len(labels)), dtype=int)
    for r in rows:
        matrix[labels.index(r["expected_specialty"]), labels.index(r["predicted"])] += 1
    scores = []
    for i, label in enumerate(labels):
        tp, actual, predicted = int(matrix[i, i]), int(matrix[i].sum()), int(matrix[:, i].sum())
        scores.append(dict(specialty=label, support=actual, predicted=predicted,
                           precision=tp / predicted if predicted else 0,
                           recall=tp / actual if actual else 0,
                           f1=2 * tp / (actual + predicted) if actual + predicted else 0))
    write_csv(out / "specialty_predictions.csv", rows)
    write_csv(out / "specialty_per_class.csv", scores)
    write_csv(out / "specialty_summary.csv", [dict(cases=len(rows),
        accuracy=float(np.trace(matrix) / len(rows)), macro_f1=float(np.mean([r["f1"] for r in scores])),
        macro_definition="union of observed reference and predicted classes; undefined scores set to zero")])
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * .65), max(7, len(labels) * .6)))
    im = ax.imshow(matrix, cmap="Blues", vmin=0)
    ax.set(xticks=range(len(labels)), yticks=range(len(labels)), xticklabels=labels,
           yticklabels=labels, xlabel="Predicted specialty", ylabel="Reference specialty",
           title=f"Specialty mapping confusion matrix (n={len(rows)})")
    plt.setp(ax.get_xticklabels(), rotation=60, ha="right")
    for i in range(len(labels)):
        for j in range(len(labels)):
            ax.text(j, i, str(matrix[i, j]), ha="center", va="center",
                    color="white" if matrix[i, j] > matrix.max() / 2 else "black")
    fig.colorbar(im, ax=ax, label="Cases")
    save_fig(out, "specialty_confusion", fig,
             "Reference labels supplied by the evaluator; reviewer credentials and independence must be documented.")
    status["Specialty accuracy"] = f"Measured on {len(rows)} supplied reference cases."


def prescriptions(out, inputs, status):
    rows = read_csv(inputs / "prescription_fields.csv",
                    ["document_id", "item_id", "field", "expected", "predicted", "source", "reviewer_id"])
    if not rows:
        status["Prescription extraction"] = "Pending verified reference and actual extracted fields in prescription_fields.csv."
        return
    unique(rows, ["document_id", "item_id", "field"])
    for r in rows:
        if not all(r[k].strip() for k in ("document_id", "item_id", "field", "source", "reviewer_id")):
            raise ValueError("Prescription observations require IDs, field, source and reviewer")
        if not r["expected"].strip() and not r["predicted"].strip():
            raise ValueError("Both fields empty: not a scored observation")
    normalize = lambda s: " ".join(s.casefold().split())
    summary = []
    for field in sorted({r["field"] for r in rows}):
        group = [r for r in rows if r["field"] == field]
        reference = [r for r in group if r["expected"].strip()]
        matches = sum(normalize(r["expected"]) == normalize(r["predicted"]) for r in reference)
        summary.append(dict(field=field, reference_fields=len(reference), exact_matches=matches,
            exact_match_percent=100 * matches / len(reference) if reference else "",
            missing=sum(not r["predicted"].strip() for r in reference),
            incorrect=sum(bool(r["predicted"].strip()) and normalize(r["predicted"]) != normalize(r["expected"]) for r in reference),
            extra_fields=sum(not r["expected"].strip() for r in group)))
    write_csv(out / "prescription_summary.csv", summary)
    valid = [r for r in summary if r["reference_fields"]]
    if valid:
        fig, ax = plt.subplots(figsize=(8, 5))
        bars = ax.bar([r["field"] for r in valid], [r["exact_match_percent"] for r in valid], color="#356a95")
        ax.bar_label(bars, labels=[f"{r['exact_matches']}/{r['reference_fields']}" for r in valid])
        ax.set(ylim=(0, 112), yticks=[0, 25, 50, 75, 100], ylabel="Exact field match (%)",
               title=f"Prescription extraction ({len({r['document_id'] for r in rows})} documents)")
        save_fig(out, "prescription_accuracy", fig,
                 "Case/whitespace normalized; missing fields count as errors.\n"
                 "Extra predicted fields are reported separately in prescription_summary.csv.")
    status["Prescription extraction"] = f"Scored {len(rows)} supplied field observations; predictions not generated by this script."


def usability(out, inputs, status):
    rows = read_csv(inputs / "usability.csv", ["participant_id", "task", "success", "duration_seconds", "errors"])
    if not rows:
        status["Usability"] = "Pending observed participant trials in usability.csv."
        return
    unique(rows, ["participant_id", "task"])
    for r in rows:
        if not r["participant_id"].strip() or not r["task"].strip():
            raise ValueError("Usability requires participant ID and task")
        r["success"] = binary(r["success"])
        r["duration_seconds"] = number(r["duration_seconds"], "duration_seconds")
        r["errors"] = number(r["errors"], "errors")
        if not r["errors"].is_integer():
            raise ValueError("errors must be an integer count")
    summary = []
    for task in sorted({r["task"] for r in rows}):
        group = [r for r in rows if r["task"] == task]
        times = [r["duration_seconds"] for r in group if r["success"]]
        summary.append(dict(task=task, attempts=len(group), completed=sum(r["success"] for r in group),
            completion_percent=100 * np.mean([r["success"] for r in group]),
            median_success_seconds=float(np.median(times)) if times else "", total_errors=sum(r["errors"] for r in group)))
    write_csv(out / "usability_summary.csv", summary)
    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.barh([r["task"] for r in summary], [r["completion_percent"] for r in summary], color="#356a95")
    ax.bar_label(bars, labels=[f"{r['completed']}/{r['attempts']}" for r in summary], padding=4)
    ax.set(xlim=(0, 115), xticks=[0, 25, 50, 75, 100], xlabel="Task completion (%)", title="Observed usability task completion")
    save_fig(out, "usability_completion", fig,
             f"{len({r['participant_id'] for r in rows})} participants; one attempt per participant/task.\n"
             "Completion means the predeclared success criterion was met; failures remain in the denominator.")
    status["Usability"] = f"Measured from {len(rows)} supplied participant/task observations."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=Path(__file__).parent / "inputs")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "results")
    parser.add_argument("--repeats", type=int, default=100)
    parser.add_argument("--seed", type=int, default=20260923)
    args = parser.parse_args()
    if args.repeats < 20:
        parser.error("Use at least 20 attempts per module to cover the workload")
    out = args.output / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    out.mkdir(parents=True, exist_ok=False)
    plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
                         "pdf.fonttype": 42, "svg.fonttype": "none"})
    status = {}
    paths = [Path(__file__), ROOT / "blr.xlsx", ROOT / "karnataka_hospitals_200.csv"]
    paths += list((ROOT / "backend").glob("*.py")) + list(args.inputs.glob("*.csv"))
    hashes = {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p):
              hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
    def git(*commands):
        return subprocess.run(["git", *commands], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    metadata = dict(timestamp_utc=datetime.now(timezone.utc).isoformat(), python=sys.version,
                    platform=platform.platform(), processor=platform.processor(),
                    commit=git("rev-parse", "HEAD"), working_tree=git("status", "--short"),
                    repeats=args.repeats, seed=args.seed, input_sha256=hashes,
                    packages={p: importlib.metadata.version(p) for p in ("matplotlib", "numpy", "openpyxl")},
                    scope="Local prototype evaluation; constructed inputs; no clinical outcome validation")
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    # Store exact supplied inputs so later edits cannot silently change the evidence.
    (out / "input_snapshot").mkdir()
    for path in args.inputs.glob("*.csv"):
        (out / "input_snapshot" / path.name).write_bytes(path.read_bytes())
    latency(out, args.inputs, args.repeats, args.seed, status)
    robustness(out, status)
    specialty(out, args.inputs, status)
    prescriptions(out, args.inputs, status)
    usability(out, args.inputs, status)
    (out / "status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    lines = ["# Evaluation results", "", "Measured outputs only. Missing datasets are not represented by zero-valued charts.", ""]
    for key, value in status.items():
        lines.append(f"- **{key}:** {value}")
    for path in sorted(out.glob("*_summary.csv")):
        with path.open(encoding="utf-8") as handle:
            data = list(csv.reader(handle))
        lines.extend(["", f"## {path.stem.replace('_', ' ').title()}", "",
                      "| " + " | ".join(data[0]) + " |", "| " + " | ".join("---" for _ in data[0]) + " |"])
        for row in data[1:]:
            lines.append("| " + " | ".join(row) + " |")
    (out / "RESULTS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out)
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
