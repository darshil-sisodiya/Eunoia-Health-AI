# Eunoia research evaluation

This standalone harness measures the current backend without changing application code.
It produces 300 DPI PNG, vector PDF and SVG figures, CSV metrics, a Markdown results
table, raw observations, input snapshots and environment/code hashes. Every run gets
a new UTC-stamped directory; previous results are never overwritten.

## Run

From the repository root:

```powershell
python -m pip install -r research_eval/requirements.txt
python research_eval/evaluate.py --repeats 100
```

The last printed path contains the outputs. `RESULTS.md` contains the tables and
`status.json` distinguishes measured results from missing evidence. The harness does
not call paid AI services, log in, query patient records or start the application server.

## What the default run actually establishes

- **Latency:** 100 calls per available module, after five recorded warmups. Calls are
  randomly interleaved with a fixed seed. Risk scoring cycles through five constructed
  profiles; mapping and estimation cycle through 20 constructed queries. PDF generation
  renders a basic profile with fixed text, not a full clinical report or live AI summary.
  Imports and dataset loading are outside the timer. The plot uses a logarithmic time
  axis because module times can differ greatly. Median/p95 cover successful calls only;
  the table also reports all attempts and successes. Exceptions remain in the raw file.
  Success here means no exception (plus a PDF header check for PDF rendering), not a
  correctness judgement. This is a local microbenchmark, not end-to-end app latency.
- **Robustness:** 20 authored base queries, each with uppercase, punctuation, spacing,
  one deterministic character deletion and an authored rewording. The metric is agreement
  with the unmodified query's prediction, not accuracy. The same wrong answer can agree.
  Rewordings are not independently reviewed. These examples are constructed software
  test inputs, not patient data or a representative sample. Do not claim they are unseen
  relative to all existing development tests. They were frozen before this run; future
  development against them makes them a regression set, not a held-out benchmark.

`latency_workload.csv` records the query/profile schedule (trial modulo 20). The Karnataka
estimator uses Mysuru and the Bangalore estimator uses Bengaluru. Default severity/tier
arguments are used. `metadata.json` records the random seed, source hashes, dirty working
tree, runtime and dependency versions. This makes the measurement attributable to the
actual current files, including uncommitted changes. The hospital data's authenticity is
not certified by this evaluation, and estimator latency says nothing about price accuracy.

## Supply evidence for the other charts

The four input CSVs initially have headers only. Never put invented observations in
these files. You can use `--inputs C:\path\to\inputs` to keep sensitive inputs separate;
all four CSV files with the documented headers must be present. Inputs are copied into
the result folder, so only use de-identified records suitable for that location.

### Specialty confusion matrix

Fill `inputs/specialty_labels.csv`:

| Column | Meaning |
| --- | --- |
| case_id | Unique case identifier |
| text | Held-out symptom description |
| expected_specialty | One independently reviewed reference label |
| reviewer_id | Pseudonymous reviewer ID; document qualifications separately |
| source | Dataset/vignette source and version |

Use label spellings from `backend/specialization_keywords.py`, or `General Physician`
and `Internal Medicine`. Freeze labels before running predictions. Have ambiguous or
multi-specialty cases adjudicated under a documented single-label protocol; do not just
discard difficult cases after seeing predictions. For multi-label evaluation a different
scoring protocol is needed. Reviewer/source fields record attribution, but the script
cannot certify credentials, label correctness or independence from development data.

Outputs: confusion matrix, predictions, per-class precision/recall/F1/support and overall
accuracy/macro-F1. Macro-F1 averages over the union of reference and predicted classes;
undefined scores are set to zero. Include class counts and limitations in the paper.

### Prescription extraction accuracy

Fill `inputs/prescription_fields.csv` with actual reference/prediction pairs:

- `document_id`: de-identified image ID; `item_id`: aligned medication/item ID.
- `field`: e.g. medicine_name, dose, frequency.
- `expected`: manually verified transcription; `predicted`: actual saved app output.
- `source`: traceable de-identified image/output record; `reviewer_id`: transcriber ID.

One row per document/item/field. Include every reference field even when prediction is
missing (empty predicted cell). Include extra extracted items with empty expected cells
and unique item IDs; those are counted separately, not silently ignored. Do not include
rows with both values empty. Align items independently of whether their field values
match; document the alignment method. No fuzzy matching or dose-unit conversion occurs:
only case and whitespace are normalized. A incorrect nonempty value and a missing value
both fail exact match. Extra fields appear separately in the table because exact-match
accuracy alone does not penalize hallucinated extras. The harness scores saved outputs;
it does not extract prescriptions or invent reference transcriptions.

### Usability

Fill `inputs/usability.csv` from observed sessions:

- `participant_id`: pseudonymous volunteer ID.
- `task`: fixed task name (use the same spelling across participants).
- `success`: 1 or 0 under a success criterion declared before testing.
- `duration_seconds`: actual elapsed time, including time to stop for failed tasks.
- `errors`: observed nonnegative integer error count under a predefined rubric.

Use one first attempt per participant/task. Record failed attempts too. Report participant
recruitment, task instructions, stop-time rule, device and observer assistance. Use dummy
health profiles and obtain appropriate participant consent. Completion uses all attempts;
median completion time uses successful attempts only (no successful attempt means blank,
not zero). These are descriptive pilot observations, not population-wide usability claims.

### Live AI or API latency

Optionally fill `inputs/external_latency.csv` using actual timing logs:
`feature,trial,elapsed_ms,success,measurement_scope,source`.
Use a unique feature/scope/trial combination. Record success as 0/1, retain failures, and
give a traceable log source. Scope should distinguish e.g. `HTTP round trip` from
`local function`; different scopes get separate figures. Define success as an acceptable
response, not merely HTTP 200 if the endpoint can return an error/fallback in its body.
Record environment, service/model version, workload, timeout and warmup policy separately.
The harness validates imported rows but cannot independently authenticate external logs.

## Publication notes

Use the full figures with their scope notes. Cite the run ID, input construction/sources,
sample counts and testing machine. Treat repeated calls and related query variants as
dependent measurements; this harness reports descriptive metrics and does not manufacture
confidence intervals by treating them as independent patients. Publish failure cases and
the evaluation protocol. Do not describe these results as diagnostic accuracy, clinical
effectiveness, proven safety or independently validated treatment-cost prediction.

Missing evidence yields a pending status, never fabricated bars or a synthetic confusion
matrix. The default run therefore produces two chart families; the other three render
once their actual evidence is supplied.

## Verify the evaluator

```powershell
python -m unittest discover -s research_eval -p "test_*.py"
```

The tests use explicitly synthetic fixtures in disposable temporary directories to check
metric arithmetic and chart paths. They never contribute observations to paper results.
