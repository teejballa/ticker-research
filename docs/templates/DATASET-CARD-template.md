---
model_name: <<TODO dataset-slug>>
model_version: <<TODO>>
card_format: gebru-2018
last_validated: <<TODO>>
retrain_cadence: P180D
author: <<TODO>>
source_files:
  - <<TODO Prisma model or table name>>
---

# Dataset Card: <<TODO>>

> **Schema**: Gebru et al. 2018 — *Datasheets for Datasets*. https://arxiv.org/abs/1803.09010
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Motivation

- **For what purpose was the dataset created?**: <<TODO>>
- **Who created the dataset and on behalf of which entity?**: <<TODO>>
- **Who funded the creation of the dataset?**: <<TODO>>

## 2. Composition

- **What do the instances represent?** (rows, observations, snapshots): <<TODO>>
- **How many instances?**: <<TODO>>
- **Does the dataset contain all possible instances or a sample?**: <<TODO>>
- **What data does each instance consist of?** (columns, features): <<TODO>>
- **Is there a label or target?**: <<TODO>>
- **Is any information missing from individual instances?**: <<TODO>>
- **Are relationships between instances made explicit?**: <<TODO>>
- **Are there recommended data splits?**: <<TODO>>
- **Are there errors, sources of noise, or redundancies?**: <<TODO>>
- **Is the dataset self-contained or does it link to external resources?**: <<TODO>>
- **Does the dataset contain confidential or PII data?**: <<TODO>>

## 3. Collection Process

- **How was the data acquired?**: <<TODO>>
- **What mechanisms or procedures were used?**: <<TODO>>
- **If the dataset is a sample from a larger set, what was the sampling strategy?**: <<TODO>>
- **Who was involved in the data collection process and how were they compensated?**: <<TODO>>
- **Over what timeframe was the data collected?**: <<TODO>>
- **Were ethical review processes conducted?**: <<TODO>>

## 4. Preprocessing / Cleaning / Labeling

- **Was any preprocessing/cleaning/labeling done?**: <<TODO>>
- **Was the raw data saved in addition?**: <<TODO>>
- **Is the software used to preprocess available?**: <<TODO>>

## 5. Uses

- **Has the dataset been used for any tasks already?**: <<TODO>>
- **Is there a repository linking to all uses?**: <<TODO>>
- **What other tasks could the dataset be used for?**: <<TODO>>
- **Is there anything about the composition or collection that might bias future uses?**: <<TODO>>
- **Are there tasks for which the dataset should NOT be used?**: <<TODO>>

## 6. Distribution

- **Will the dataset be distributed to third parties?**: <<TODO>>
- **How will the dataset be distributed?**: <<TODO>>
- **When will the dataset be distributed?**: <<TODO>>
- **License or ToS**: <<TODO>>
- **Have any third parties imposed IP-based or other restrictions?**: <<TODO>>
- **Do any export controls or regulatory restrictions apply?**: <<TODO>>

## 7. Maintenance

- **Who is supporting/hosting/maintaining the dataset?**: <<TODO>>
- **How can the maintainer be contacted?**: <<TODO>>
- **Is there an erratum?**: <<TODO>>
- **Will the dataset be updated?**: <<TODO frequency from `retrain_cadence`>>
- **If others want to extend/augment/build on/contribute, is there a mechanism?**: <<TODO>>
