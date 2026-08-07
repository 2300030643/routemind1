# RouteMind - Adaptive Route Optimization for the Supply Chain

RouteMind is an intelligent supply chain routing dashboard designed to optimize middle-mile and last-mile logistics. It uses a hybrid optimizer that combines classical routing models (OR-Tools) with a rule-based AI heuristic that solves complex real-world Indian policy constraints and provides supervisors with explainable real-time re-plans.

## Key Features

1. **Multi-Model Routing Engine**:
   - **Naive Greedy**: A nearest-neighbor solver (baseline).
   - **OR-Tools Solver**: A classical vehicle routing solver optimizing pure distance and basic time windows.
   - **RouteMind AI Solver**: Enforces specific Indian constraints like cash-carry limits and commercial vehicle curfews, producing fully legal, feasible routes.
2. **Indian Operations Constraints**:
   - **COD Cash-Carry Limit**: Drivers have a cash limit (max ₹50,000 cash on hand). Exceeding it automatically schedules a return to the depot for drop-off.
   - **Commercial Curfew Timing**: Commercial vehicles are banned from entering Connaught Place (Z1) during peak windows (08:00-11:00 & 17:00-20:00). Stops are re-sequenced to comply.
   - **Delivery Time Windows (SLA)**: Adherence to customer-specific delivery slots.
3. **Supervisor Approval Dashboard**:
   - High-fidelity dark mode visualizer using OpenStreetMap.
   - Dynamic simulation triggers for "Failed Delivery" and "New Dynamic Pickup".
   - Shows detailed natural-language explainability summaries detailing what changed and why.
4. **Driver Companion App Simulator**:
   - Displays active stops sequence.
   - **Offline Mode**: Local storage cache lets drivers work in dead-zones, queuing logs and syncing back to the dashboard once reconnected.

## Directory Structure

```
new/
├── backend/
│   ├── data_generator.py  # Delhi NCR test data generator (mimicking Amazon challenge schema)
│   ├── solvers.py         # Naive, OR-Tools, and RouteMind optimization engines
│   ├── main.py            # FastAPI server
│   ├── test_solvers.py    # Test suite
│   └── requirements.txt   # Python dependencies
├── src/
│   ├── main.jsx           # React mount script
│   ├── App.jsx            # Operations Dashboard, Leaflet Map, and Driver App
│   └── App.css            # Premium theme & Glassmorphism styles
├── package.json           # Node configuration
├── vite.config.js         # Vite configuration with backend proxy
└── README.md              # Documentation
```

## Running the Project

### Prerequisite: Python & Node.js
Ensure Python 3.8+ and Node.js 18+ are installed.

### 1. Start the Backend API
Run these commands from the project root:
```bash
pip install -r backend/requirements.txt
python -X utf8 backend/main.py
```
*The API server will run at `http://127.0.0.1:5000`.*

### 2. Start the Frontend Dev Server
In a separate terminal window, run:
```bash
npm install
npm run dev
```
*The React application will run at `http://localhost:3000`.*

## Benchmarks & Telemetry

Our verification suite (12 stops in Delhi NCR) yields:
- **OR-Tools CVRPTW**: 57.18 km, but violates curfew windows and COD limits.
- **RouteMind AI**: 72.03 km, satisfies **all** curfews, SLAs, and schedules a return to the Okhla Depot to drop cash.
- **Re-planning Latency**: Re-plans solve in **< 15 milliseconds** (budget: 30 seconds).
- **Compute Cost**: **₹0.02** per route computed using heuristics.
"# routemind" 
"# routemind1" 
"# routemind1" 
