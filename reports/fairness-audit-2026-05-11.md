# Fairness Audit — 2026-05-11

- **audit_id**: `782ed807-f789-47cc-b9d6-6801cde1d60a`
- **audit_window_days**: 90
- **triggered_by**: `initial-bootstrap`
- **dimensions_evaluated**: `['cap_class', 'sector', 'geography', 'ticker_age']`

**MODE: synthetic-floor — production data sparse; this is the bootstrap audit. Next monthly run will be real-data-only.**

## Classifier: `finbert-prosus`
- n_predictions_total: 100

### Dimension: `cap_class`

| segment | n | Brier | ECE | bh_q | is_limitation | insufficient_data |
|---|---|---|---|---|---|---|
| micro | 100 | 0.3300 | 0.3000 | 0.0000 | true | false |

### Flagged Limitations (n=1)
- cap_class=micro: Brier=0.330, ECE=0.300, n=100

