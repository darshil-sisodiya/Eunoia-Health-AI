# Corrected Table I — full-text-based entries

Based on the 15 cited papers supplied by the user, reviewed 23 September 2026. This supersedes the access-limited conclusions in TABLE_1_AUDIT.md. All 15 cited full-text PDFs, including the final IEEE version of [5], were examined for the entries below. This is a source-based literature comparison, not an independent reproduction of the studies or certification of their results.

The supplied Eunoia manuscript has one literature-comparison table. Eight additional supplied papers are not cited in its current 15 rows; they have not been silently substituted or added.

**Suggested caption:** Summary of related research: methods, capabilities, and evaluation limitations.

**Column changes:** Replace “Advantages” with “Key capabilities” and “Problem Identified” with “Scope / evaluation limitations”. Scope differences are not necessarily defects, and Eunoia does not automatically resolve another study's evaluation limitations.

## Paste-ready replacement table

| Ref. | Title | Author | Year | Methodology | Key capabilities | Scope / evaluation limitations |
|---|---|---|---|---|---|---|
| [1] | Health Guardian: Using Multi-modal Data to Understand Individual Health | Siu et al. | 2023 | Cloud microservices integrating text, video and wearable data; Clinical Task Manager. | Multimodal and longitudinal assessment, including PHQ-8 scoring and mobility monitoring. | Designed for research cohorts; regional treatment-price estimation and hospital selection are not described. |
| [2] | AI-Driven Mobile App for Personalized Health Monitoring | Almtireen et al. | 2024 | Random Forest activity recognition, SVM cardiovascular-risk assessment and CNN speech/facial analysis; smartwatch/mobile integration. | Combines activity, cardiovascular risk, mood and fatigue monitoring with personalized feedback. | Broader wearable compatibility and healthcare-provider integration remain future work; regional treatment pricing is not described. |
| [3] | AI-Powered Mental Health Tracking With Smartwatch Integration for Instantaneous Stress Assessment and Assistance | Singh et al. | 2025 | Random Forest stress prediction from temperature and step count, with smartwatch monitoring and a Flask API. | Combines stress estimates, self-assessment, alerts, email notifications and helpline access. | Evaluation covers 50 users over two weeks; broader validation and improved stress-prediction accuracy remain needed. |
| [4] | Mental Health Support Using Gen-AI Shot Prompting Technique and Vector Embeddings | Ponmagal R.S. et al. | 2025 | Gemini 1.5 Flash with few-shot prompting, SentenceTransformer embeddings and cosine-similarity relevance filtering. | Contextual mental-health responses with semantic filtering and text-based crisis referral. | Evaluation uses 200 English dialogues; ambiguous-input errors, crisis handling and multilingual generalization remain limitations. |
| [5] | Enhancing Mental Health Support Through Human-AI Collaboration: Toward Secure and Empathetic AI-Enabled Chatbots | AlMakinah et al. | 2025 | Qualitative and TF-IDF similarity comparison of LLM/therapist responses; proposed clinician-supervised federated chatbot framework. | Combines response analysis with a design for clinician oversight and privacy-preserving collaboration. | The federated chatbot is a proposed framework; deployed clinical effectiveness and security are not demonstrated. |
| [6] | Explainable AI in Psychology: Enhancing Transparency and Trust in Mental Health Applications | P U Graandhikaa Sri et al. | 2025 | Random Forest psychological prediction with TreeSHAP feature attribution and preprocessing. | Provides local/global feature explanations and describes missing-data imputation. | Focuses on psychological assessment; regional treatment pricing and hospital selection are not described. |
| [7] | Trustworthy Data and AI Environments for Clinical Prediction: Application to Crisis-Risk in People With Depression | Msosa et al. | 2023 | CogStack/NLP processing of EHRs; Random Forest, gradient boosting and LSTM prediction with feature explanations. | Combines structured records and clinical notes for interpretable depression crisis-risk prediction. | Retrospective single-provider evaluation; point-of-care deployment and prospective clinical validation remain future work. |
| [8] | Interpretable Multimodal Prediction of Student Mental Health Deterioration Using TabNet-Based Deep Learning | Archanaa C K and Gnanajeyaraman Rajaram | 2025 | TabNet with attention masks on academic, psychological and learning-platform features; median imputation. | Provides feature-level explanations for student mental-health risk classification. | Cross-institutional validation, longitudinal extension and a counselor dashboard remain future work. |
| [9] | A Medical Price Prediction System Using Hierarchical Decision Trees | Tike and Tavarageri | 2017 | Hierarchical decision-tree regression in Apache Spark using Medicare payments and local real-estate features. | Predicts hospital/DRG payment variation to support cost-conscious provider choice. | Evaluated on US Medicare inpatient payments; Indian pricing and preventive-health assessment are not evaluated. |
| [10] | Utilizing Machine Learning to Improve Healthcare Cost Prediction on Large Public Datasets | Satwik et al. | 2025 | CatBoost ensemble with uncertainty-based selective prediction on New York SPARCS hospital records. | Offers an adjustable prediction-coverage versus error trade-off for treatment-cost estimates. | Evaluated on New York data, without Indian validation; uncertain cases may receive no prediction. |
| [11] | Prediction of Health Insurance Price Using Machine Learning Algorithms | Goel and Chaudhary | 2024 | Linear regression and neural-network modelling of insurance charges using demographic and lifestyle attributes. | Examines price associations with age, smoking, BMI and other personal attributes. | Targets insurance charges/premiums rather than condition-specific hospital treatment bills. |
| [12] | Voice-based AI Agents: Filling the Economic Gaps in Digital Health Delivery | Wen et al. | 2025 | LLM-powered telephone agent with structured questionnaire extraction, clinician dashboard and cost-utility modelling. | Supports remote assessments, longitudinal follow-up and escalation to healthcare staff. | Pilot includes 33 IBD patients; incomplete responses, conversation latency and EHR integration remain challenges. |
| [13] | Smart Wellness Through Conversational AI: Building FitVore with Gemini for Personalized Health Coaching | Tyagi et al. | 2025 | Gemini plan generation from Vapi voice-collected inputs, with web authentication and stored plan history. | Generates personalized diet/workout plans and provides access to current and previous plans. | Single-session personalization with a 10-user beta; continuous behavior tracking and wearable integration remain future work. |
| [14] | Dynamic Ensemble Selection for Mental Health Prediction: A Path towards Explainable, Scalable and High-Impact AI Solutions | Saha and Hemalatha S. | 2025 | Dynamic ensemble selection, including KNORA-E/U, META-DES, DES-P and KNOP, with SHAP explanations. | Combines instance-specific classifier selection with explanations of workplace mental-health survey predictions. | Moderate-sized datasets; highly imbalanced and real-time scenarios are not tested. |
| [15] | AI-Driven Digital Health: Pioneering Innovations, Overcoming Challenges, and Shaping Future Frontiers | Kumar | 2025 | HealthEdge-AI: federated multimodal transformers with differential privacy, encrypted aggregation and XAI. | Combines EHR, physiological and imaging models with distributed training and feature explanations. | Evaluation uses a simulated federated environment; live-hospital deployment and operational validation remain future work. |

## Evidence for each row

Page numbers below refer to PDF pages counted from 1. “Not described” is bounded to the supplied paper, not every version of the underlying system. Distinctions drawn from study design are reviewer observations; explicitly stated challenges and future work are attributed to the paper.

### [1] Siu et al.

**Basis:** Scope comparison.

Section II and Table I, PDF pp. 2–3; Sections III–VI, pp. 4–9. The paper expressly includes wellness and prevention, patient-facing interfaces, PHQ-8 scoring, and missing-data imputation. Clinical research orientation must not be presented as absence of preventive care.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/Health Guardian Using Multi-modal Data to Understand Individual Health.pdf>)

### [2] Almtireen et al.

**Basis:** Author-stated future work and scope comparison.

Sections III-A–F, PDF pp. 2–3; Section IV, p. 4. Cardiovascular risk assessment is explicitly implemented. Model accuracy values in the results and conclusion differ, so the table should not quote a single unqualified accuracy figure.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/AI-Driven Mobile App for Personalized Health Monitoring.pdf>)

### [3] Singh et al.

**Basis:** Reported evaluation scope and author-stated improvement needs.

Sections III–IV, PDF pp. 2–6, especially IV-A/B, pp. 4–5; Section V, p. 6. The reported stress model is Random Forest with 70% accuracy. Describe the evaluated implementation rather than relying on the abstract's broader algorithm list.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/AI-Powered Mental Health Tracking With Smartwatch Integration for Instantaneous Stress Assessment and Assistance.pdf>)

### [4] Ponmagal R.S. et al.

**Basis:** Author-reported limitations and evaluation scope.

Abstract, PDF p. 1; Sections III–V, pp. 2–4. The relevance-classification result is not a clinical-outcome or overall chatbot-safety accuracy measurement. Existing crisis referral must not be described as absent.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/Mental Health Support Using Gen-AI Shot Prompting Technique and Vector Embeddings.pdf>)

### [5] AlMakinah et al.

**Basis:** Proposal-versus-evaluation distinction.

Sections II–IV, PDF pp. 2–6; conclusion, pp. 6–7. This is the final seven-page IEEE paper, replacing the earlier preprint in the audit. Hospitals and clinics are explicitly proposed as training nodes. Privacy and empathy are design aims, not established guarantees of the proposed deployment.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/Enhancing Mental Health Support Through Human-AI Collaboration Toward Secure and Empathetic AI-Enabled Chatbots.pdf>)

### [6] P U Graandhikaa Sri et al.

**Basis:** Scope comparison.

Sections III–V, PDF pp. 2–5; Section VI, pp. 5–6. Section IV-A explicitly describes mean/mode or k-nearest-neighbor missing-value handling. The paper also discusses early intervention, so 'no complete preventive workflow' is not a precise limitation.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/Explainable AI in Psychology Enhancing Transparency and Trust in Mental Health Applications.pdf>)

### [7] Msosa et al.

**Basis:** Study design and author-stated future work.

Section III-A/B, PDF pp. 2–3; Sections V–VI, pp. 9–10. The evaluated EHR data come from Mersey Care. The conclusion explicitly leaves deployment and a clinical blind test for future work. Early crisis prediction has preventive intent.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/Trustworthy Data and AI Environments for Clinical Prediction Application to Crisis-Risk in People With Depression.pdf>)

### [8] Archanaa C K and Gnanajeyaraman Rajaram

**Basis:** Author-stated future work.

Sections III–V, PDF pp. 2–4; Section VII, pp. 5–6. Student-specific evaluation is a scope statement, not evidence that the approach cannot transfer. Missing-value handling is explicitly reported.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/Interpretable Multimodal Prediction of Student Mental Health Deterioration Using TabNet-Based Deep Learning.pdf>)

### [9] Tike and Tavarageri

**Basis:** Dataset and task scope.

Sections I and III, PDF pp. 1, 3–4; Section IV, pp. 4–8. The model uses DRG and geographic/provider-related features, and explicitly supports comparing providers. 'No hospital support' is therefore misleading. Average payments are not individual patient quotations.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (2)/A medical price prediction system using hierarchical decision trees.pdf>)

### [10] Satwik et al.

**Basis:** Dataset scope and explicit selective-prediction behavior.

Section III, PDF p. 2; Sections IV–V, pp. 3–4. The title page lists four authors: Satwik; Aneeket Yadav; Rahul Garg; A. Ravishankar Rao. Model 1 is called XGBoost in methods but CatBoost elsewhere; avoid repeating the headline 55% comparison without this qualification.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (2)/Utilizing machine learning to improve healthcare cost prediction on large public datasets.pdf>)

### [11] Goel and Chaudhary

**Basis:** Prediction-target scope.

Sections III–V, PDF pp. 2–4; conclusion, p. 5. The supplied publisher-formatted PDF replaces the earlier public transcription. The target distinction is supported; discussion of hospital operations does not turn it into a hospital treatment-bill estimator.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (2)/Prediction of Health Insurance Price using Machine Learning Algorithms.pdf>)

### [12] Wen et al.

**Basis:** Pilot scope and author-reported challenges.

Section IV, PDF pp. 5–7; Section V, p. 8; Appendix A, pp. 11–12. The appendix includes MHBI and EQ-5D-3L assessment outputs. The economic analysis concerns care delivery, not regional hospital treatment prices. Questionnaire scoring should not be confused with an independently validated Eunoia-equivalent risk engine.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/Voice-based AI Agents Filling the Economic Gaps in Digital Health Delivery.pdf>)

### [13] Tyagi et al.

**Basis:** Explicit implementation limits and evaluation scope.

Sections III–V, PDF pp. 3–4; Section VI-E and Sections VII–VIII, pp. 5–6. Despite broader language in the abstract, the implementation explicitly does not track long-term behavior or predict emotional states. Use the implemented diet/workout scope.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download/Smart Wellness through Conversational AI Building FitVore with Gemini for Personalized Health Coaching.pdf>)

### [14] Saha and Hemalatha S.

**Basis:** Author-stated limitations.

Section III-F/G, PDF pp. 4–5; Section IV-B, p. 7; conclusion, p. 8. Section III-G explicitly handles missing numeric entries with neutral placeholders and standardizes categorical fields. The original blanket missing-data claim is contradicted; the paper does not establish Eunoia-style separate unknown/not-asked evidence states.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/Dynamic Ensemble Selection for Mental Health Prediction  A Path towards Explainable- Scalable and High-Impact AI Solutions.pdf>)

### [15] Kumar

**Basis:** Explicit experimental setting and future work.

Sections III–IV, PDF pp. 2–4; Section VI, p. 5. This is a specific modelling framework, not merely a broad perspective article. It also describes missing-modality masking. Reported privacy mechanisms do not independently establish legal compliance.

[Open supplied full-text PDF](<C:/Users/darsh/Downloads/bulk-download (1)/AI-Driven Digital Health Pioneering Innovations- Overcoming Challenges- and Shaping Future Frontiers.pdf>)

## Important corrections to preserve

- **[1]:** Health Guardian includes prevention, patient-facing assessments and fixed questionnaire scoring. Do not describe it as having no preventive care.
- **[2]:** Cardiovascular-risk assessment is implemented. Do not imply that risk assessment is absent.
- **[5]:** The federated chatbot is proposed; hospital/clinic participation is expressly part of that proposal. Do not present security or empathy aims as proven deployed-system benefits.
- **[9]:** Hospital/provider price comparison is an intended use. Replace the previous “no hospital support” assertion.
- **[12]:** Structured health assessments and clinician escalation are present. Separate those from regional hospital-price estimation.
- **[14]:** Missing-value processing is explicitly documented. Distinguish preprocessing/imputation from a user-facing confidence and evidence-completeness policy; do not contrast machine learning with determinism.
- **[15]:** Describe the actual federated transformer framework and its simulated evaluation, rather than saying it does not implement Eunoia.

## Author-label corrections

Use **Almtireen et al.** for [2], **Ponmagal R.S. et al.** for [4], **Archanaa C K and Gnanajeyaraman Rajaram** for [8], **Satwik et al.** for [10], and **Saha and Hemalatha S.** for [14]. Reference [10] has four authors: Satwik, Aneeket Yadav, Rahul Garg, and A. Ravishankar Rao; “S. A. Yadav” incorrectly merges two people. Keep the existing publication years for all 15 entries.

## Numerical claims not suitable for unqualified copying

- **[2]:** Results report 98% activity accuracy, 86% cardiovascular accuracy and 97% speech accuracy; the conclusion instead lists 95%, 92% and 93%. This table therefore identifies capabilities without choosing one inconsistent set.
- **[10]:** Methods identify Model 1 as XGBoost, but the abstract/discussion describe the comparison as against a single CatBoost model. Selective prediction also changes the evaluated coverage. Do not copy the headline 55% reduction as an unqualified like-for-like result.
- **[15]:** The table reports 91.4% accuracy versus a best listed baseline of 85.6%, a difference of 5.8 percentage points. This does not directly match the text's stated 7.8% improvement. The qualitative entry avoids reproducing that inconsistency.

Numbers such as the 50-user study, 33-patient pilot and 10-user beta describe the authors' reported evaluation sizes, not independently verified participant records.

## Replacement paragraph for Section VI

“Table I compares the reviewed studies by methodology, implemented capabilities, and reported evaluation scope. The studies address complementary tasks, including multimodal monitoring, mental-health prediction, conversational support, clinical analytics, and healthcare-cost modelling. Eunoia combines preventive-risk and wellness calculations, conversational assistance, prescription interpretation, and regional cost and hospital information within a consumer-facing prototype. This comparison characterizes differences in system scope; it does not establish superior clinical effectiveness, safety, or prediction accuracy.”

Project implementation claims in this paragraph still need to match the current code and evaluation. No application code or manuscript PDF was changed.

