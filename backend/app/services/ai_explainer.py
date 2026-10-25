import os
from typing import Dict, Any, List

def generate_ai_explanation(
    question: str,
    context_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Answers questions grounded strictly in current computed inventory, transfer, and risk state.
    Uses Google Gemini if GEMINI_API_KEY is present; otherwise falls back to a deterministic expert synthesis engine.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    # Format the live state context
    critical_stockouts = [r for r in context_data.get("risks", []) if r.get("stockout_risk_level") == "Critical"]
    expiring_items = [r for r in context_data.get("risks", []) if r.get("expiry_risk_level") in ["Critical", "Warning"]]
    transfers = context_data.get("transfers", [])
    reorders = context_data.get("reorders", [])

    system_grounding = f"""
Current System State:
- Total Facilities: {context_data.get('total_facilities', 0)}
- Critical Stockouts: {len(critical_stockouts)} (e.g., {', '.join([f"{x['facility_name']} for {x['medicine_name']} ({x['days_remaining']} days cover)" for x in critical_stockouts[:3]])})
- Expiring Batches at Risk: {len(expiring_items)} (e.g., {', '.join([f"{x['facility_name']} for {x['medicine_name']} (~{x['projected_wasted_units']} units at risk)" for x in expiring_items[:3]])})
- Proposed Feasible Transfers: {len(transfers)}
- Reorders Needed: {len(reorders)}
- Demand Surge Multiplier: {context_data.get('surge_multiplier', 1.0)}x
"""

    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            prompt = f"""You are the MEDICYCLE Clinical Supply Chain Intelligence Assistant.
Answer the user's question accurately using ONLY the live telemetry provided below. Do not invent facilities, numbers, or drugs.
Keep answers concise, actionable, and structured for medical administrators.

{system_grounding}

User Question: {question}
"""
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return {
                "source": "gemini-api",
                "response": response.text,
                "grounded_context": system_grounding
            }
        except Exception as e:
            # Graceful fallback to deterministic expert synthesizer
            pass

    # Deterministic Rule-Based Grounded Fallback
    q_lower = question.lower()
    answer_lines = []

    if "transfer" in q_lower or "redistribut" in q_lower or "why" in q_lower:
        if transfers:
            t = transfers[0]
            answer_lines.append(
                f"**Top Recommended Redistribution:** {t['suggested_quantity']} {t.get('unit', 'units')} of **{t['medicine_name']}** "
                f"from **{t['source_facility_name']}** to **{t['dest_facility_name']}**."
            )
            answer_lines.append(f"- **Clinical Justification:** {t['reason']}")
            answer_lines.append(
                f"- **Safety Impact:** Recipient coverage jumps from {t['dest_days_cover_before']} to {t['dest_days_cover_after']} days, "
                f"while donor safely preserves {t['donor_coverage_days_post_transfer']} days of supply."
            )
        else:
            answer_lines.append("Currently all facilities have balanced stock for their lead times, or no donor has sufficient surplus above safety threshold.")

    elif "expir" in q_lower or "waste" in q_lower:
        if expiring_items:
            e = expiring_items[0]
            answer_lines.append(
                f"**Critical Expiry Alert:** **{e['facility_name']}** holds batch(es) of **{e['medicine_name']}** with "
                f"approx. {e['projected_wasted_units']} units projected to expire unconsumed (Est. Loss: ${e['estimated_waste_cost']:.2f})."
            )
            answer_lines.append(f"- **Recommendation:** {e['expiry_reason']}")
        else:
            answer_lines.append("No critical batch expiration risks detected across active facilities.")

    elif "stockout" in q_lower or "shortage" in q_lower or "critical" in q_lower:
        if critical_stockouts:
            s = critical_stockouts[0]
            answer_lines.append(
                f"**Immediate Stockout Threat:** **{s['facility_name']}** for **{s['medicine_name']}** has only "
                f"**{s['days_remaining']} days of supply** ({s['current_stock']} units on hand), which is less than supplier lead time of {s['lead_time_days']} days."
            )
            answer_lines.append(f"- **Root Cause:** {s['stockout_reason']}")
        else:
            answer_lines.append("No facilities currently face zero-stock or sub-lead-time stockouts.")

    else:
        answer_lines.append(
            f"**MEDICYCLE System Diagnostic:** Monitoring {context_data.get('total_facilities', 0)} healthcare facilities and "
            f"{context_data.get('total_medicines', 0)} essential medicines."
        )
        answer_lines.append(
            f"- **Active Shortages:** {len(critical_stockouts)} critical facilities requiring immediate stock."
        )
        answer_lines.append(
            f"- **Expiring Surplus:** {len(expiring_items)} facilities holding stock nearing expiry that can be salvaged."
        )
        answer_lines.append(
            f"- **Optimized Transfers:** {len(transfers)} bilateral redistributions computed to resolve shortages without new procurement costs."
        )

    return {
        "source": "deterministic-grounded-engine",
        "response": "\n\n".join(answer_lines),
        "grounded_context": system_grounding
    }
