# Table 1 literature-claim audit

> Superseded by [the corrected full-text-based table](TABLE_1_CORRECTED.md). The user subsequently supplied all 15 cited PDFs, including the final IEEE version of [5]. The access restrictions and provisional verdicts below describe the earlier audit, not the current evidence.

Reviewed 23 September 2026 against Table 1 in `IEEE_Conference_Template (4).pdf`.

## Coverage and interpretation

Every claimed limitation was assessed, but **full-text verification of all 15 cited publications remains incomplete**. Full-text copies were examined for [1], [7], [11], and [12]. For [5], an earlier full preprint was examined; it is not the final IEEE conference version. The other ten rows have only abstract/metadata-level evidence available in this audit.

Accessible manuscripts may differ from their final published versions. In particular, [11] was read through a public transcription of a publisher-formatted copy, rather than a publisher-hosted PDF. Page and section references below refer to the examined copies. Publisher records, repository searches, author links, and available abstracts were checked; failure to locate a full text does not prove that it is unavailable elsewhere.

“Not described” means absent from the examined document, not impossible for the system or absent from later versions. An abstract cannot substantiate a negative claim about the complete paper. Suggested wording based only on abstracts is provisional.

## Row-by-row findings

### [1] Siu et al. — Health Guardian

**Table claim:** “Clinical research focus rather than consumer preventive care”

**Verdict: Partly supported, but the prevention contrast is misleading.**

The platform supports clinical research, but Section II and Table I explicitly include wellness and prevention services, patient-facing mobile interfaces, and at-home assessment. Sections III-B/C also describe PHQ-8 scoring and longitudinal tracking. Clinical orientation does not establish an absence of preventive or consumer-facing functions.

**Safer wording:** “Research-oriented multimodal health platform with patient-facing wellness and prevention services.”

Evidence: Section II, PDF pp. 2–4; Section III, p. 5. [Full manuscript](https://arxiv.org/pdf/2310.01733).

### [2] Almtireen et al. — AI-Driven Mobile App

**Table claim:** “Limited integration of preventive risk, regional cost, and hospitals”

**Verdict: Not established without full text.**

The indexed abstract describes smartwatch/mobile monitoring, physiological measurements, stress and fatigue analysis, and personalized proactive health support. It does not establish how fully risk, pricing, and hospital services are integrated. Their omission from the abstract is insufficient evidence.

**Provisional scope wording:** “Multimodal smartwatch/mobile health monitoring with stress and fatigue analysis.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/REM63063.2024.10735595).

### [3] Singh et al. — Smartwatch Mental Health Tracking

**Table claim:** “Narrow mental-health scope”

**Verdict: Mental-health focus is supported by the abstract; ‘narrow’ is an unsupported evaluation.**

The abstract describes mental-health self-assessment, monitoring, predictive models, and assistance. Specialization is a scope distinction, not evidence of inferior performance or an author-acknowledged limitation.

**Provisional scope wording:** “Targets mental-health self-assessment, monitoring, and support.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/ICICV64824.2025.11085533).

### [4] Ponmagal et al. — Gen-AI Mental Health Support

**Table claim:** “No deterministic risk or regional cost analysis”

**Verdict: These absence claims remain unverified.**

The abstract describes Gemini, few-shot prompting, and embedding-based relevance checks. It actually reports ambiguous-input errors and crisis-response bottlenecks, with multilingual support left for future work. Those are better grounded limitations than presumed absences elsewhere in the paper.

**Provisional limitation wording:** “Reports ambiguous-input relevance errors and crisis-response bottlenecks; multilingual support remains future work.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/ICDSBS63635.2025.11031881).

### [5] AlMakinah et al. — Human–AI Collaboration

**Table claim:** “No integrated risk, cost, prescription, and hospital support”

**Verdict: The combined feature bundle is not described in the reviewed preprint; ‘hospital support’ needs qualification. Final-version verification is pending.**

The preprint compares chatbot responses and proposes clinician-supervised federated support. Hospitals and clinics explicitly participate in its framework. Hospital participation is distinct from consumer hospital selection. This 17-page preprint has an ACM submission header; the cited IEEE paper is seven pages, so equivalence cannot be assumed.

**Version-qualified wording:** “The reviewed preprint proposes clinician-supervised mental-health chat support; regional treatment pricing and hospital selection are not described.”

Evidence: Sections 2–4, especially pp. 8–13. [Reviewed preprint](https://arxiv.org/pdf/2410.02783); [cited publication](https://doi.org/10.1109/CAI64502.2025.00038).

### [6] Graandhikaa Sri et al. — Explainable AI in Psychology

**Table claim:** “Does not implement a complete preventive-health workflow”

**Verdict: Unverified and insufficiently defined.**

A matching abstract discusses TreeSHAP and ensemble predictions in psychological assessment. It cannot establish every implemented workflow. “Complete” also needs an independently defined set of requirements; matching Eunoia's feature list is not a universal completeness criterion.

**Provisional scope wording:** “Uses explainable ensemble predictions for psychological assessment.”

Access: Abstract only; the retrieved 129-page document is a book of abstracts, not this seven-page paper. Matching abstract: PDF p. 20, printed p. 8. [Abstract collection](https://deepscienceresearch.com/dsr/catalog/download/73/309/821?inline=1); [publication record](https://doi.org/10.1109/ICCIES63851.2025.11032593).

### [7] Msosa et al. — Trustworthy Clinical Prediction

**Table claim:** “Focused on clinical prediction rather than consumer prevention”

**Verdict: Supported as a clinical-versus-consumer scope distinction.**

The work uses clinical records for depression crisis-risk prediction and clinician decision support. Its early-warning purpose can support prevention, so the wording should distinguish users and deployment setting rather than imply no preventive value.

**Safer wording:** “EHR-based crisis prediction for clinician decision support, rather than a general consumer wellness application.”

Evidence: Section 3.1, manuscript p. 4; discussion/conclusion, pp. 15–18. [Accepted manuscript](https://livrepository.liverpool.ac.uk/3172585/1/A_Trustworthy_AI_Environment_for_Predicting_Crisis_Risk_of_Depression.pdf).

### [8] Archanaa and Rajaram — TabNet Student Mental Health

**Table claim:** “Limited to student mental-health prediction”

**Verdict: Evaluation scope is supported by the abstract; universal limitation is not established.**

The abstract targets student mental-health deterioration using academic, psychological, and digital features. This supports describing the evaluated population, not asserting that the method cannot apply elsewhere.

**Provisional scope wording:** “Evaluated for student mental-health deterioration prediction.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/CICT67193.2025.11399215).

### [9] Tike and Tavarageri — Medical Price Prediction

**Table claim:** “No integrated preventive-health or hospital support”

**Verdict: Overbroad; the full combined claim remains unverified.**

The abstract explicitly motivates price prediction as helping patients choose cost-effective providers. Thus, an unqualified lack of hospital/provider support is misleading. Provider-price guidance and a specific hospital-matching implementation must be distinguished. The author-linked paper required sign-in and was not read.

**Provisional scope wording:** “Predicts Medicare service prices to support cost-conscious provider choice.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/BigData.2017.8258396); [author publication page](https://sites.google.com/site/sanketst/home/research/publications).

### [10] Satwik et al. — Healthcare Cost Prediction

**Table claim:** “Does not address India-specific regional pricing”

**Verdict: Consistent with the abstract's dataset scope, but not fully verified.**

The abstract describes treatment-cost prediction using New York SPARCS records. This supports a US-data scope statement. Without the full paper, absence of all Indian comparisons or transfer analyses cannot be certified.

**Provisional scope wording:** “Evaluates treatment-cost prediction on New York SPARCS data; Indian regional applicability is not established by the accessible evidence.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/SIST61657.2025.11139245).

### [11] Goel and Chaudhary — Health Insurance Price Prediction

**Table claim:** “Focuses on insurance rather than treatment-cost estimation”

**Verdict: Supported as a distinction in the prediction target.**

The examined article models insurance charges/premiums using personal attributes, including age, BMI, smoking, dependants, and region. It does not present a condition-specific hospital treatment-bill estimator. General discussion of healthcare operations does not change that primary modelling target.

**Safer wording:** “Predicts insurance charges/premiums from personal attributes rather than condition-specific hospital treatment costs.”

Evidence: Sections III–IV, pp. 1346–1347; conclusion, p. 1349. [Public full-text transcription](https://www.scribd.com/document/844929462/Prediction-of-Health-Insurance111-Price-u111sing-Machine-Learning-Algorithms); [publication record](https://doi.org/10.23919/INDIACom61295.2024.10498661). The transcription's identifiers match the cited paper; publisher-PDF verification would strengthen provenance.

### [12] Wen et al. — Voice-Based AI Agents

**Table claim:** “No deterministic risk or regional hospital-cost pipeline”

**Verdict: Regional hospital pricing is not described; the scoring contrast needs tighter definition.**

AgentPULSE includes structured questionnaire assessments, MHBI and EQ-5D-3L instruments, clinician follow-up, and emergency alerts. These are not proof of an Eunoia-equivalent deterministic risk engine, but they make broad claims of absent scoring or risk support misleading. Its economic model concerns delivery/resource allocation, not regional hospital bills.

**Safer wording:** “Voice-based monitoring with structured assessments and provider follow-up; regional hospital treatment-price estimation is not described.”

Evidence: Sections III–IV, pp. 2–7; Appendix A, pp. 11–12. [Full manuscript](https://arxiv.org/pdf/2507.16229).

### [13] Tyagi et al. — FitVore

**Table claim:** “Lacks preventive-risk, prescription, or regional healthcare integration”

**Verdict: These absence claims remain unverified.**

The abstract describes Gemini-based conversational coaching across fitness, nutrition, and mental health, with multimodal/voice interaction. An abstract's feature selection does not establish the absence of prescription or regional healthcare features from the full implementation.

**Provisional scope wording:** “Conversational coaching for fitness, nutrition, and mental health.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/AISummit66170.2025.11411641).

### [14] Saha and Hemalatha — Dynamic Ensemble Selection

**Table claim:** “No deterministic scoring with explicit missing-data handling”

**Verdict: Unverified, with a terminology problem.**

The abstract describes dynamic ensemble selection and SHAP for survey-based mental-health prediction. Learned models can produce deterministic predictions; machine learning is not the opposite of determinism. Whether this paper explicitly handles missing data requires its methods/preprocessing text.

**Provisional scope wording:** “Survey-based mental-health prediction using dynamic ensemble selection and SHAP.”

If the intended comparison is fixed clinical rules versus learned models, use those terms and verify missing-data policies separately.

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/ICICKE65317.2025.11136272).

### [15] Kumar — HealthEdge AI

**Table claim:** “Does not implement Eunoia’s integrated preventive-health workflow”

**Verdict: Not a useful standalone scientific limitation; full-text absence is also unverified.**

The abstract describes federated multimodal clinical modelling, including risk stratification. Defining a competitor's limitation as not implementing the proposed system's exact workflow is circular. It does not establish inferior effectiveness, safety, or usability.

**Provisional scope wording:** “Federated multimodal clinical risk modelling in a different deployment setting from Eunoia.”

Access: Abstract/metadata only. [Publication record](https://doi.org/10.1109/IEMCON67450.2025.11381123).

## Recommended treatment of Table 1

Rename the comparison column **“Scope and comparison with Eunoia”** if it primarily describes differences in purpose, users, geography, or feature sets. Reserve **“Limitations”** for demonstrated constraints, explicitly attributed author statements, or carefully bounded findings supported by the full text.

Separate bundled assertions: risk scoring, missing-data handling, treatment pricing, prescription interpretation, and hospital selection each require their own evidence. Define these features consistently before marking them present or absent. Use **“Unverified”** when full text was unavailable and **“Not described in the reviewed version”** only after examining that version.

Adding features to Eunoia would not repair an inaccurate characterization of another paper. Nor does broader integration alone establish better clinical outcomes or technical superiority; those require evaluation.

To finish the requested full-text verification, obtain the cited PDFs for **[2], [3], [4], [6], [8], [9], [10], [13], [14], and [15]**, plus the final IEEE version of **[5]**. The most important follow-up is to check each negative assertion against methods, architecture, implementation, evaluation, and supplementary material in those exact publications.

No project code or manuscript was modified by this audit.
