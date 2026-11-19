# Model comparison report

Generated 2026-11-19T13:28:01.

all labels are positives from the 2025 monsoon; negatives are dry-day or uncertain and were handled as described.

Trained on 32 labelled rows with complete Open-Meteo features (32 positives, 0 negatives, 5 events / leave-one-event-out folds). Classes present in feature rows: [1].

Features: rain_24h, rain_48h, rain_72h, max hourly intensity, 7-day antecedent rain.
Baseline: daily rain_24h ≥ 25 mm.

- **Baseline (≥25 mm)**: precision=0.000, recall=0.000, F1=0.000 (tp=0, fp=0, fn=32)
- **Logistic regression**: not scored — evt-2025-07-18: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-04: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-07: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-09: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-09-18: ValueError: training fold has a single class (1); binary classifier not fit
- **Gradient boosting**: not scored — evt-2025-07-18: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-04: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-07: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-08-09: ValueError: training fold has a single class (1); binary classifier not fit; evt-2025-09-18: ValueError: training fold has a single class (1); binary classifier not fit

uncertain negatives excluded
