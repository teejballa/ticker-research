---
model_name: <<TODO>>
model_version: <<TODO>>
card_format: mitchell-2019
last_validated: <<TODO>>
retrain_cadence: P90D
author: <<TODO>>
source_files:
  - <<TODO>>
---

# Model Card: <<TODO model_name>>

> **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Model Details

- **Person or organization developing the model**: <<TODO>>
- **Model date**: <<TODO>>
- **Model version**: <<TODO>>
- **Model type** (e.g., transformer fine-tune, lexicon, ensemble): <<TODO>>
- **Training algorithms, parameters, fairness constraints**: <<TODO>>
- **Paper or other resource**: <<TODO>>
- **Citation details**: <<TODO>>
- **License**: <<TODO>>
- **Where to send questions or comments**: <<TODO>>

## 2. Intended Use

- **Primary intended uses**: <<TODO>>
- **Primary intended users**: <<TODO>>
- **Out-of-scope use cases**: <<TODO>>

## 3. Factors

- **Relevant factors** (groups, instrumentation, environments that influence performance): <<TODO>>
- **Evaluation factors** (which factors were reported): <<TODO>>

## 4. Metrics

- **Model performance measures**: <<TODO>>
- **Decision thresholds**: <<TODO>>
- **Variation approaches** (CIs, bootstrap): <<TODO>>

## 5. Evaluation Data

- **Datasets**: <<TODO>>
- **Motivation**: <<TODO>>
- **Preprocessing**: <<TODO>>

## 6. Training Data

- **Datasets**: <<TODO>>
- **Distribution / demographics**: <<TODO>>

## 7. Quantitative Analyses

- **Unitary results** (per-factor): <<TODO>>
- **Intersectional results**: <<TODO>>

## 8. Ethical Considerations

- **Data sensitivity**: <<TODO>>
- **Risks and harms**: <<TODO>>
- **Use cases that raise concern**: <<TODO>>

## 9. Caveats and Recommendations

- **Known limitations**: <<TODO>>
- **Recommendations for future work**: <<TODO>>

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**: <<TODO>>
- **Detection mechanism if any** (e.g., fall-back classifier, null-sentinel): <<TODO>>

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1**: <<TODO>>
- **Failure mode 2**: <<TODO>>

## 12. Retrain Cadence — *Cipher extension*

- **Cadence** (matches frontmatter `retrain_cadence`): <<TODO>>
- **Trigger conditions** (e.g., ECE > 0.05, ICIR drop > 0.05, vendor SHA bump): <<TODO>>
- **Owner**: <<TODO>>
