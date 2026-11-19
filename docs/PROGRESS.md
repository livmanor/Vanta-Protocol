# Vanta Protocol — Progress Log
*Branch: vanta-upgrade*

---

## Session 1 — 2026-11-19

### Done

**Audit: `docs/VANTA_TECHNICAL_AUDIT.md` written**

Command run:
```
python -m pytest tests/ -v --tb=short
```
Real output summary: 41 passed, 1 failed in 3.03s.
- 1 failure: `test_label_validation::test_template_seeds_are_not_labels` — asserts `len(rows)==6`, CSV now has 38 rows (6 seeds + 32 real positive labels).

Training gate checked:
```
python -c "from scripts.label_schema import read_rows, training_gate, LABELS_PATH; ..."
```
Output: Seeds=6, Positives=32, Negatives=0, Events=5, Ready=True — but zero negatives means binary classifier cannot be fit.

`docs/model_report.md` confirms last training run (2026-11-19): every LOEO fold raised `ValueError: training fold has a single class (1)`. No model trained. Honest outcome.

### Verified Working Features
- Auth (bcrypt + SQLite sessions)
- CAP/SACHET ingestion and floor logic
- HTP waterlogging poller with stale-snapshot fallback
- Risk score engine (1–5 heuristic), correctly withholds score when both rain fields null
- 120-cell GHMC grid, elevation cached in SQLite
- Evacuation routing with blocked-road buffer
- SOS gate with officer approval
- Incident triage
- Replay (archive-only, writes nothing)
- Predict/Prepare/Respond agents (config-gated; no keys committed)

### Known Issues (see VANTA_TECHNICAL_AUDIT.md for full list)
1. `test_template_seeds_are_not_labels` stale assertion — P0 fix
2. Zero negatives in label file → no trainable model
3. All HTP points use city-centroid weather sample (rate limit workaround, disclosed in `why_this`)
4. Archive 48h rain ≠ live 48h rain (daily sum vs. hourly sum)
5. `AUTH_REQUIRED` defaults `False` in code
6. Groq model ID `openai/gpt-oss-20b` unverified
7. Pydantic V2 `Config` class deprecation warning

### Blocked
- Nothing blocked at this stage (audit-only session, no code changes required except fixing the test).

---

## Next Steps
1. Fix `test_template_seeds_are_not_labels` (P0).
2. Fix `AUTH_REQUIRED` default and Pydantic V2 deprecation (P2).
3. Add verified negatives to labels if proceeding with model training.
