import urllib.request
import json

def check(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MEDICYCLE-Verifier"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def main():
    print("=== 1. Summary Endpoint ===")
    summary = check("http://127.0.0.1:8000/api/risks/summary")
    print(f"Facilities: {summary['total_facilities']}, Medicines: {summary['total_medicines']}")
    print(f"Critical Stockouts: {summary['stockout_critical_count']}, Expiry Threats: {summary['expiry_risk_count']}")
    print(f"Transferable Units: {summary['total_surplus_transferable_units']}, Feasible Transfers: {summary['feasible_transfers_count']}")
    print(f"Estimated Loss at Risk: ${summary['estimated_at_risk_value_usd']}")

    print("\n=== 2. Transfers Endpoint ===")
    transfers = check("http://127.0.0.1:8000/api/transfers")
    for t in transfers:
        print(f"[{t['urgency']}] {t['source_facility_name']} -> {t['dest_facility_name']}: {t['suggested_quantity']} {t.get('unit', '')} of {t['medicine_name']}")
        print(f"   Reason: {t['reason'][:90]}...")

    print("\n=== 3. Reorder Endpoint ===")
    reorders = check("http://127.0.0.1:8000/api/reorder")
    for r in reorders:
        print(f"[{r['urgency']}] {r['facility_name']}: Order {r['suggested_order_qty']} {r['unit']} of {r['medicine_name']} (Est Cost: ${r['estimated_order_cost']})")

    print("\n=== 4. Demand Surge Check (+20%) ===")
    surge_summary = check("http://127.0.0.1:8000/api/risks/summary?surge_pct=20")
    print(f"Under +20% surge, Critical stockout count is: {surge_summary['stockout_critical_count']}")

    print("\nAll API endpoints verified successfully!")

if __name__ == "__main__":
    main()
