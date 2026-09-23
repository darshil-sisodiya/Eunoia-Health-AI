# Evaluation results

Measured outputs only. Missing datasets are not represented by zero-valued charts.

- **Latency:** Measured 100 attempts per available local module. AI/network timings need external_latency.csv.
- **Robustness:** Measured on 20 constructed queries and 100 variants; not clinical validation.
- **Specialty accuracy:** Pending independent labelled cases in specialty_labels.csv.
- **Prescription extraction:** Pending verified reference and actual extracted fields in prescription_fields.csv.
- **Usability:** Pending observed participant trials in usability.csv.

## Latency Summary

| scope | feature | attempts | successful | median_ms | p95_ms |
| --- | --- | --- | --- | --- | --- |
| local function | Bangalore estimator | 100 | 100 | 45.7333 | 77.890465 |
| local function | Karnataka estimator | 100 | 100 | 0.353 | 1.7430449999999988 |
| local function | PDF rendering | 100 | 100 | 22.656100000000002 | 34.95427 |
| local function | Risk scoring | 100 | 100 | 0.1877 | 0.8097749999999997 |
| local function | Specialty mapping | 100 | 100 | 20.17375 | 36.26767999999999 |

## Robustness Summary

| variant | cases | agreeing | agreement_percent |
| --- | --- | --- | --- |
| Uppercase | 20 | 20 | 100.0 |
| Punctuation | 20 | 20 | 100.0 |
| Extra spaces | 20 | 20 | 100.0 |
| Single typo | 20 | 2 | 10.0 |
| Authored rewording | 20 | 10 | 50.0 |
