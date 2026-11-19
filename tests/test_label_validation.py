"""Waterlogging labels need a day, a citation, and a Hyderabad coordinate."""
from datetime import date

from scripts.label_schema import LABELS_PATH, is_seed, read_rows, validate_row

TODAY = date(2026, 11, 17)


def _row(**overrides):
    base = {
        "event_id": "evt-2024-08-01",
        "date": "2024-08-01",
        "lat": "17.39144",
        "lon": "78.470213",
        "location_name": "Nampally Metro Underpass",
        "label": "1",
        "label_type": "reported_positive",
        "source": "https://example.com/ghmc-waterlogging-2024-08-01",
        "notes": "",
    }
    base.update(overrides)
    return base


def test_template_seeds_are_not_labels():
    rows = read_rows(LABELS_PATH)
    seeds = [row for row in rows if is_seed(row)]
    real = [row for row in rows if not is_seed(row)]
    assert len(seeds) == 6
    assert len(real) >= 1
    assert all(validate_row(row, TODAY) == [] for row in seeds)
    assert all(validate_row(row, TODAY) == [] for row in real)


def test_missing_date_or_source_is_rejected():
    assert "date is missing" in validate_row(_row(date=""), TODAY)
    assert any("source" in error for error in validate_row(_row(source=""), TODAY))


def test_chennai_coordinate_is_rejected():
    errors = validate_row(_row(lat="13.0067", lon="80.257"), TODAY)
    assert any("Chennai" in error for error in errors)


def test_rainfall_product_cannot_be_the_source():
    errors = validate_row(_row(source="https://archive-api.open-meteo.com/v1/archive daily total 0.0 mm"), TODAY)
    assert any("rainfall" in error for error in errors)


def test_cited_positive_is_accepted():
    assert validate_row(_row(), TODAY) == []
