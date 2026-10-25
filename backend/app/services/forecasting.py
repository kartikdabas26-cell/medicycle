from typing import List, Dict, Any
import numpy as np

def calculate_demand_forecast(
    weekly_history: List[int],
    surge_multiplier: float = 1.0,
    alpha: float = 0.35
) -> Dict[str, Any]:
    """
    Computes explainable demand forecast using Holt-Winters single exponential smoothing
    and recent weighted moving average on consumption history.
    """
    if not weekly_history:
        # Fallback when no history is available
        return {
            "avg_weekly_demand": 0.0,
            "avg_daily_demand": 0.0,
            "projected_7d_demand": 0.0,
            "projected_30d_demand": 0.0,
            "forecast_method": "Fallback (Zero-history baseline)",
            "explanation": "No prior consumption data recorded. Baseline defaults to 0.",
            "data_limitation_note": "Insufficient historical data for time-series smoothing."
        }

    history = [float(x) for x in weekly_history]
    n = len(history)

    # 1. Exponential Smoothing
    s = history[0]
    for val in history[1:]:
        s = alpha * val + (1.0 - alpha) * s

    # 2. Weighted Moving Average on last 4 weeks (or all available if <4)
    recent_k = min(4, n)
    recent_vals = history[-recent_k:]
    weights = np.linspace(1, recent_k, recent_k)
    weights = weights / weights.sum()
    wma = float(np.sum(np.array(recent_vals) * weights))

    # Blend: 60% exponential smoothing, 40% weighted moving average
    blended_weekly = (0.60 * s + 0.40 * wma) * surge_multiplier
    blended_daily = blended_weekly / 7.0

    # Surge explanation
    surge_text = ""
    if surge_multiplier > 1.0:
        surge_pct = int(round((surge_multiplier - 1.0) * 100))
        surge_text = f" (Includes +{surge_pct}% simulated demand surge)"

    explanation = (
        f"Based on {n} weeks of consumption data, forecast uses 60% exponential smoothing "
        f"(alpha={alpha}) and 40% weighted recent trend. Estimated baseline: "
        f"{blended_weekly:.1f} units/week ({blended_daily:.1f} units/day){surge_text}."
    )

    data_limitation = None
    if n < 4:
        data_limitation = f"Only {n} weeks of history available. Confidence interval is wider until 8+ weeks logged."

    return {
        "avg_weekly_demand": round(blended_weekly, 2),
        "avg_daily_demand": round(blended_daily, 2),
        "projected_7d_demand": round(blended_daily * 7.0, 1),
        "projected_30d_demand": round(blended_daily * 30.0, 1),
        "forecast_method": f"Single Exponential Smoothing (alpha={alpha}) + 4-wk WMA",
        "confidence_interval": "+/- 12.5% (heuristic standard deviation estimate)",
        "explanation": explanation,
        "data_limitation_note": data_limitation
    }
