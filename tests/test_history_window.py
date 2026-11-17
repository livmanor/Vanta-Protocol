"""Relative words in an officer question become calendar dates. They do not reuse the last wet spell."""
from datetime import date, timedelta

from backend.agents.workflow import resolve_relative_history_window

TODAY = date(2026, 11, 17)


def test_yesterday_is_the_previous_local_day():
    start, end = resolve_relative_history_window("yesterday rainfall", TODAY)
    assert start == end == date(2026, 11, 16)


def test_last_two_days_end_today_and_are_not_a_fixed_november_spell():
    start, end = resolve_relative_history_window("rain in the last 2 days", TODAY)
    assert end == TODAY
    assert start == TODAY - timedelta(days=1)
    assert (start, end) != (date(2026, 11, 5), date(2026, 11, 7))


def test_a_question_without_a_period_is_left_unresolved():
    assert resolve_relative_history_window("Moosarambagh bridge overflow", TODAY) is None
