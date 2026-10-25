# MEDICYCLE — AI-Powered Essential Medicine Supply Optimization Platform

[![Python](https://img.shields.io/badge/Python-3.14-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)](https://tailwindcss.com)
[![Status](https://img.shields.io/badge/Hackathon-MVP%20Ready-emerald.svg)]()

> **MediCycle is a unified medicine redistribution and patient-direct platform** for health authorities, hospitals, community chemists, distributors and patients. A role-gated entry gateway gives each user a dedicated workspace while preserving the shared forecasting, safe transfers, procurement and waste analytics services.

The single application runs at `http://127.0.0.1:5175`. Start at `/portal` to choose Patient Direct or a dedicated Hospital, Chemist, Supplier or Health Authority workspace. Each session only exposes the navigation and operational views for its selected role.

---

## 1. The Core Problem & Solution

- **The Imbalance:** In healthcare systems, critical life-saving medicines run out at primary clinics while central hospitals or secondary clinics hold surplus stock that expires unused in storage.
- **The MEDICYCLE Innovation:** Rather than treating each clinic as an isolated inventory silo, MEDICYCLE tracks multi-facility stock, forecasts consumption with explainable smoothing algorithms, detects impending stockouts and shelf-life expirations, and executes **bilateral transfer recommendations** to safely redistribute medicine.

---

## 2. Key Capabilities Demonstrated

1. **Role-specific Operations Dashboards:**
   - Live KPI cards: Facilities tracked, Medicines monitored, Critical Stockout threats, Batches nearing expiry, Transferable surplus units, and At-risk dollar value.
   - 8-Week aggregate network demand trend line.
   - Facility vulnerability bar chart.
   - Live prioritized alerts.

2. **Explainable Demand Forecasting:**
   - Holt-Winters Single Exponential Smoothing (\(\alpha = 0.35\)) blended with a 4-week Weighted Moving Average.
   - Generates transparent, deterministic projections (7-day and 30-day run rates).
   - Demand surge simulation toggle (Baseline 0%, +20% Surge, +30% Epidemic stress) that dynamically updates calculations across the entire system.

3. **Stockout & Expiry Risk Matrix:**
   - Days-of-supply horizon calculated against supplier replenishment lead times.
   - Differentiates between normal buffer erosion and critical deficits (\(\text{days remaining} \le \text{lead time}\)).
   - Evaluates batch shelf life against local run-rate to project exact units and dollar cost at risk of expiration.

4. **Transfer Optimizer and bilateral donor handshake (The Main Differentiator):**
   - Deterministic matching algorithm: matches deficit facilities with safe donor facilities holding surplus above their own safety buffer.
   - **Expiry Salvage Routing:** Detects batches expiring in \(\le 45\) days and routes them to higher-volume hospitals that can safely dispense them before expiry.
   - Calculates pre- and post-transfer coverage for both donor and recipient.
   - Each algorithmic match creates a persisted `PENDING_DONOR_CONSENT` request; the donor has exactly 10 minutes to accept or decline. Stock is not deducted before consent.
   - A rejection or timeout offers the request to the next eligible donor; if donors are exhausted, the system creates an emergency supplier PO. The Network Admin can force-approve, reroute or cancel active requests.
   - Acceptance deducts donor stock and creates an HMAC-signed manifest. Recipient reconciliation credits the stock and records `DELIVERED`.
   - **"Recalculate Recommendations"** and CSV export remain available.

5. **Central Supplier Reorder Planner:**
   - Calculates external procurement quantities when redistribution cannot close the deficit.
   - Formula: \(\text{Order Qty} = \max(\text{Min Order}, (\text{Lead Time Demand} + \text{Safety Stock} + \text{Cycle Stock}) - \text{Current Stock})\).
   - Prevents negative orders and details procurement cost in USD.

6. **Interactive Demo Controls:**
   - **Reset Demo Scenario**: Instantly restores the deterministic scenario.
   - **Inline Stock Adjustment**: Modify stock, safety threshold, or lead times on any item to observe instant rebalancing.
   - **CSV Import & Export**: One-click export for inventory, transfers, and reorders; upload CSV to bulk-update inventory.
   - **Grounded Clinical AI Assistant**: Answers supply chain questions strictly grounded in live telemetry with zero hallucinations.

---

## 3. Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts and Canvas Confetti; Web Speech API voice search and a large-font Assist Mode.
- **Backend:** Python, FastAPI, SQLAlchemy, SQLite, Pandas, NumPy, Pytest.
- **AI Engine:** Contextually grounded synthesis engine with optional Google Gemini integration (`GEMINI_API_KEY`). **Runs 100% offline without requiring paid API keys!**

---

## 4. Unified patient and healthcare network

- **Role-gated portals:** `/portal` is the entry gateway for Patient & Family, Hospital, Retail Chemist, Supplier and Health Authority. Facility sessions use the demo JWT endpoint and seeded facility IDs (`NET-H01`, `NET-C01`, `NET-S01`, etc.); the JWT carries both role and facility claims. Navigation and dashboard data are scoped to the selected portal, and **Switch Portal** returns to the gateway.
- **Facility-aware demo auth:** The UI sends the selected API role and `facility_id` (for example, `{"role":"Hospital","facility_id":"NET-H01"}`) to `/api/network/auth/demo`; older role-only requests remain accepted for compatibility.
- **Patient Direct:** Nearby licensed pharmacy offers compare generic and branded prices, show distance and availability, and exclude batches with less than 180 days to expiry. Voice search uses the Web Speech API where supported. Prescription matching is a local demonstration that reads text prescriptions or matches medicine names in a file name; it does not perform medical OCR or validate prescriptions.
- **Accessibility and chronic care:** Assist Mode uses larger text, stronger contrast and larger targets. Refill reminders are stored locally and prompt the user to review each refill; they do not automatically dispense medicine.
- **Patient checkout and urgent stock finder:** The demo supports delivery or an express pickup reservation and checks listed stock at licensed 24/7 pharmacies for urgent restock requests. It is not an emergency-response service.
- **Network seed:** SQLite startup seeds 7 network facilities (2 hospitals, 3 chemists and 2 distributors), medicine catalog, batch-level inventory, supplier offers and reconciled transfer history. The patient demo catalog provides 15 essential medicines with patient-facing batches.
- **Live stock and expiry matrix:** Search by medicine, molecule, batch or facility; filter by facility type and risk status. Batch expiry badges use red for under 60 days, amber for 60–120 days and green for more than 120 days.
- **Transfer optimizer:** Matches donor surplus or salvage batches with safety-buffer shortages, checks recipient consumption against remaining shelf life, and scores routes by urgency, ETA and value. The role dashboard uses a bilateral handshake: the donor has a ten-minute consent window, refusal/timeout triggers the next donor or an emergency supplier PO, and inventory moves only after donor consent or a recorded NOC override. Accepted transfers create HMAC-verifiable manifests and recipient reconciliation completes stock movement.
- **Handshake API:** Facility sessions use `GET /api/transfers/pending-requests`, `POST /api/transfers/{id}/respond`, and `POST /api/transfers/{id}/receive`. NOC-only `GET /api/transfers/ledger` and `POST /api/transfers/admin/override` provide governance controls. Verify a dispatched manifest at `GET /api/transfers/{id}/manifest/verify` or download its voucher at `GET /api/transfers/{id}/manifest.pdf`. Existing transfer recommendation and PDF export endpoints remain intact.
- **Supplier controls:** Compare pricing, MOQ, reliability and lead time. Purchase orders first check available neighboring stock; continuing despite a salvage match requires explicit confirmation. A facility must approve a requisition before a supplier can dispatch it.
- **Analytics and audit:** Savings, prevention counts and redistributed volume are calculated from the transfer ledger. Network Admin can inspect the audit events for transfer and procurement actions.
- **Typed client algorithms:** `frontend/src/utils/algorithms.ts` implements weighted demand forecasting, expiry-safe donor matching and anti-double-buying checks. The existing FastAPI/SQLite network endpoints remain authoritative for B2B stock, transfers, purchase orders and audit records; patient cart, refill and demo checkout state is held in browser state/local storage.
- **Portal paths:** `/portal` is the entry gateway; Patient Direct is `/patient`, and facility workspaces start at `/hospital`, `/chemist`, `/supplier`, or `/admin`. Role-permitted inventory, redistribution, supplier marketplace, order, analytics and alert views use their respective nested paths.

This is a demonstrator: facility profiles are demo sign-ins, not a production identity provider or full server-side tenant authorization system. The patient catalog and checkout are demo data and do not transmit or process real patient health information, prescriptions or payments. Set `MEDICYCLE_JWT_SECRET` to a securely managed secret before deployment; do not use the built-in local-demo secret in production. Production deployments also need real user credentials, tenant membership provisioning, transport security, migration management, clinical review and operational controls.

## 5. Quickstart Guide (Local Run)

### Prerequisites
- Python 3.10+ (tested on Python 3.14)
- Node.js 18+ and npm

### Method 1: One-Click Windows Launcher
Double-click `start_medicycle.bat` or run:
```powershell
.\start_medicycle.bat
```

### Method 2: Manual Startup

#### Step 1: Start Backend
```powershell
# From the project root:
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
Backend API will be live at `http://127.0.0.1:8000` (Interactive docs: `http://127.0.0.1:8000/docs`).

#### Step 2: Start Frontend
```powershell
# In a separate terminal:
cd frontend
npm install
npm run dev
```
Open `http://127.0.0.1:5175` in your browser.

---

## 6. Verification & Testing

To run the backend test suite covering forecasting, stockouts, expiry detection, transfer optimization, and reordering:
```powershell
python -m pytest backend/tests/test_engine.py -v
```
To verify all API endpoints:
```powershell
python backend/verify_endpoints.py
```
To build and type-check the frontend:
```powershell
cd frontend
npm run build
npm test
```

The network API is available at `/api/network` and its interactive OpenAPI documentation at `http://127.0.0.1:8000/docs`. Obtain a demo JWT by posting `{"role":"Hospital"}` (or `Chemist`, `Supplier`, `Network Admin`) to `/api/network/auth/demo`; include it as `Authorization: Bearer <access_token>` for protected network endpoints.

---

## 7. Hackathon Demonstration Script (Step-by-Step)

Follow this unified-platform walkthrough:

1. **Find patient stock:** Open **Patient Direct**, search by voice or text for a medicine, compare generic and branded offers, and verify the six-month expiry guarantee.
2. **Assist and refill:** Turn on **Assist Mode**, upload a text prescription (or a file whose name includes a medicine), and add a refill reminder. Reminders require review and confirmation.
3. **Place a demo order:** Add an offer to your basket, choose delivery or express pickup, and confirm checkout. Demo stock updates in browser state.
4. **Enter stakeholder portals:** Return to `/portal`, select a Hospital, Chemist, Supplier or Health Authority demo profile, then use **Switch Portal** to return to the gateway.
5. **Review stock and request a transfer:** Open **Inventory** and **Redistribution** to inspect safe matches. The donor portal receives a ten-minute consent request; accept to generate a manifest, or decline to invoke automatic failover.
6. **Avoid double buying and reconcile fulfillment:** Compare supplier offers, submit a requisition that has a neighboring surplus match, inspect the warning, then approve and advance it through delivery.
7. **Review outcomes and reset:** Switch to Network Admin for savings charts, facility leaderboard and compliance audit. Use **Reset Demo State** in the unified sidebar when needed.

---

## 7. Mathematical Formulations

- **Exponential Smoothing:**  
  \(S_t = \alpha Y_t + (1 - \alpha) S_{t-1}\), where \(\alpha = 0.35\)
- **Weighted Moving Average:**  
  \(\text{WMA}_k = \sum_{i=1}^k w_i Y_{t-k+i} \Big/ \sum w_i\), with linear weights \([0.1, 0.2, 0.3, 0.4]\)
- **Blended Daily Demand:**  
  \(\hat{D} = \frac{0.60 S_t + 0.40 \text{WMA}}{7} \times \text{Surge Multiplier}\)
- **Days of Supply:**  
  \(\text{DoS} = \frac{\text{Current Usable Stock}}{\hat{D}}\)
- **Safe Donor Transferable Surplus:**  
  \(\text{Surplus}_{\text{donor}} = \max\left(0, \text{Stock} - (\text{Safety Stock} + \hat{D} \cdot L_{\text{donor}} + 14 \cdot \hat{D})\right)\)

---

## 8. Limitations & Roadmap

- **Current MVP Scope:** Evaluates bilateral hub-and-spoke and peer transfers within regional transit distances.
- **Future Enhancements:**
  - Multi-hop vehicle routing optimization (VRP with time windows).
  - Temperature-controlled cold chain IoT sensor integration for insulin and vaccines.
  - Integration with national DHIS2 and openLMIS databases.
