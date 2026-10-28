from datetime import date

from app.main import build_analysis

START = END = date(2026, 1, 1)  # one decision day -> delivery 2026-01-02


def forecast(publish, target, mw):
    return {"publishTime": publish, "startTime": target, "generation": mw}


def actual(target, mw, fuel="WIND"):
    return {"startTime": target, "fuelType": fuel, "generation": mw}


def test_picks_latest_forecast_published_by_cutoff():
    target = "2026-01-02T12:00:00Z"
    rows = [
        forecast("2026-01-01T04:30:00Z", target, 100),
        forecast("2026-01-01T07:30:00Z", target, 120),  # latest before 09:00 cutoff
        forecast("2026-01-01T09:30:00Z", target, 999),  # after cutoff: must be ignored
    ]
    result = build_analysis([actual(target, 110)], rows, START, END, cutoff_hour=9)
    [point] = result["points"]
    assert point["forecast"] == 120
    assert point["publishTime"] == "2026-01-01T07:30:00Z"
    assert point["error"] == 10
    assert point["horizonHours"] == 28.5


def test_no_forecast_before_cutoff_means_no_point():
    target = "2026-01-02T12:00:00Z"
    result = build_analysis([actual(target, 110)], [forecast("2026-01-01T11:30:00Z", target, 1)], START, END)
    assert result["points"] == []
    assert result["metrics"]["coverage"] == 0


def test_ignores_non_wind_and_out_of_range_deliveries():
    rows = [forecast("2026-01-01T07:30:00Z", t, 100) for t in ("2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z")]
    acts = [actual("2026-01-02T00:00:00Z", 50), actual("2026-01-02T00:00:00Z", 1, fuel="CCGT"),
            actual("2026-01-03T00:00:00Z", 50)]
    result = build_analysis(acts, rows, START, END)
    assert [p["startTime"] for p in result["points"]] == ["2026-01-02T00:00:00Z"]
    assert result["points"][0]["actual"] == 50


def test_metrics():
    targets = [f"2026-01-02T{h:02d}:00:00Z" for h in range(4)]
    errors = [10, -10, 30, -30]
    rows = [forecast("2026-01-01T07:30:00Z", t, 100 + e) for t, e in zip(targets, errors)]
    m = build_analysis([actual(t, 100) for t in targets], rows, START, END)["metrics"]
    assert m["mae"] == 20
    assert m["bias"] == 0
    assert m["rmse"] == round((2000 / 4) ** 0.5, 1)
    assert m["coverage"] == round(4 / 24 * 100, 1)
    assert m["recommendedBuffer"] == round(m["p90"]) > 0
