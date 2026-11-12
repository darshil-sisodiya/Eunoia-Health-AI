# Scoring contract

The risk and wellness numbers are deterministic **heuristic indices**, not
calibrated probabilities, diagnoses, or evidence of clinical validation.
Confidence is weighted input coverage, not a probability that the result is correct.
Clinical validation on an appropriate independent population remains outstanding.

## Compatible response and presentation

Existing score fields, component caps, risk-level strings, and frontend components
are retained. No frontend files need to change. Risk points still equal the sum of
the capped components. The reported level is the higher of the index band and an
explicit review flag. Thus 9 points can carry a Very High level for a reported BP
of 200/130; the existing factor explanation explains why. These level floors are
product review rules, not newly validated medical cutoffs for the overall index.

Severely elevated BP guidance is deterministic, so it is available even when AI
insight generation fails. The engine does not infer symptoms or diagnose an
emergency from BP alone. Discordant glucose tests retain the stronger signal and
recommend review rather than discarding an abnormal result.

## Wellness

The 100 available points are: activity 20, sleep 15, diet 15, tobacco 10, weight
10, condition control 10, vitals 10, and mood/anxiety screening 10. Missing diet,
weight, condition history, vitals, and mental-screening answers earn no credit in
their respective domains. A missing diet answer retains two provisional risk
points, identified as unassessed, so omitting a poor diet answer cannot improve
either score. Missing diet also reduces input confidence. These weights are
product choices and require evaluation; a high wellness number is not clearance
from a clinical review flag.

## FINDRISC

FINDRISC is withheld unless the exact questionnaire answers, age, BMI and waist
are available. The optional API `findrisc` object contains:

- `daily_activity_30min`: usually at least 30 minutes of activity daily.
- `daily_fruit_vegetables`: fruit, vegetables or berries every day.
- `ever_bp_medication`: ever regularly taken blood-pressure medication.
- `ever_high_glucose`: ever been found to have elevated blood glucose.
- `family_diabetes`: `none`, `second_degree` or `first_degree`, using the
  original questionnaire's relative groups (including aunt/uncle/first cousin in
  its second group).

Current clients do not collect these exact answers, so their reports omit the
FINDRISC row rather than publish an incomplete score. PHQ-2 and GAD-2 remain.
FINDRISC is also withheld for minors, unknown applicable waist category, missing
condition history, and reported diabetes. Published population risk percentages
are not presented as locally calibrated individual probabilities.

Existing stored reports are historical snapshots and are not rewritten. Generate
a new assessment to use the corrected scoring. New and old wellness values are
not directly comparable because the weights have changed.

## Sources

- [Original FINDRISC form](https://carpha.org/Portals/0/FINDRISC.pdf)
- [AHA guidance on severely elevated BP](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/when-to-call-911-for-high-blood-pressure)
- [NIDDK on discordant glucose and HbA1c results](https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test)

These sources support individual questionnaire rules and review guidance, not
the custom composite weights or the mapping of review flags to display levels.
