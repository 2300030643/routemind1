import sys
import os
# Adjust path to import backend modules correctly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn

from backend.data_generator import generate_route_data, get_dynamic_pool
from backend.solvers import (
    solve_naive_greedy,
    solve_or_tools,
    solve_routemind_ai,
    replan_route,
    evaluate_route
)

app = FastAPI(title="RouteMind Backend API")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory storage for active demo route data
current_data = generate_route_data(num_stops=15)

class SolveRequest(BaseModel):
    solver_type: str  # 'naive', 'ortools', 'routemind'
    problem_data: Dict[str, Any]

class ReplanRequest(BaseModel):
    current_sequence: List[str]
    event_type: str  # 'NEW_PICKUP', 'FAILED_DELIVERY'
    event_data: Dict[str, Any]
    problem_data: Dict[str, Any]

class EvaluateRequest(BaseModel):
    sequence: List[str]
    problem_data: Dict[str, Any]

@app.get("/api/route-data")
def get_route_data(stops: Optional[int] = 15):
    """Retrieve or regenerate the main route problem dataset."""
    global current_data
    current_data = generate_route_data(num_stops=stops)
    return current_data

@app.get("/api/dynamic-pool")
def get_dynamic_pool_endpoint():
    """Retrieve the pool of dynamic simulation stops."""
    return get_dynamic_pool()

@app.post("/api/solve")
def solve_route(req: SolveRequest):
    """Solves the routing problem with the chosen optimizer."""
    global current_data
    current_data = req.problem_data
    if req.solver_type == "naive":
        result = solve_naive_greedy(current_data)
    elif req.solver_type == "ortools":
        result = solve_or_tools(current_data)
    elif req.solver_type == "routemind":
        result = solve_routemind_ai(current_data)
    else:
        raise HTTPException(status_code=400, detail="Invalid solver_type. Must be 'naive', 'ortools', or 'routemind'.")
    
    return result

@app.post("/api/replan")
def trigger_replan(req: ReplanRequest):
    """Trigger a real-time re-plan based on a driver event or supervisor input."""
    global current_data
    current_data = req.problem_data
    
    # If it is a new pickup (dynamic or custom map click), we must register it in the global state
    # so that future re-plans or evaluations can reference its coordinates and volume.
    if req.event_type == "NEW_PICKUP":
        new_stop = req.event_data
        new_stop_id = new_stop["stop_id"]
        current_data["stops"][new_stop_id] = new_stop
        
        # Calculate distance and travel times from the new stop to all other locations
        new_loc = {"lat": new_stop["lat"], "lng": new_stop["lng"]}
        current_data["distances"][new_stop_id] = {}
        current_data["travel_times"][new_stop_id] = {}
        
        locations = {"DEPOT": current_data["depot"]}
        for s_id, s_info in current_data["stops"].items():
            if s_id != new_stop_id:
                locations[s_id] = {"lat": s_info["lat"], "lng": s_info["lng"]}
                
        for other_id, loc in locations.items():
            from backend.data_generator import haversine_distance, calculate_travel_time_seconds
            dist = haversine_distance(new_loc["lat"], new_loc["lng"], loc["lat"], loc["lng"])
            time_sec = calculate_travel_time_seconds(new_loc["lat"], new_loc["lng"], loc["lat"], loc["lng"])
            
            current_data["distances"][new_stop_id][other_id] = dist
            current_data["distances"][other_id][new_stop_id] = dist
            current_data["travel_times"][new_stop_id][other_id] = time_sec
            current_data["travel_times"][other_id][new_stop_id] = time_sec
            
        current_data["distances"][new_stop_id][new_stop_id] = 0.0
        current_data["travel_times"][new_stop_id][new_stop_id] = 0

    result, explanation = replan_route(
        req.current_sequence,
        req.event_type,
        req.event_data,
        current_data
    )
    
    # Calculate costs for the calculation log
    cost_per_compute = 0.02
    
    return {
        "evaluation": result,
        "explanation": explanation,
        "cost_per_compute_rupees": cost_per_compute,
        "updated_problem_data": current_data
    }

@app.post("/api/evaluate")
def evaluate_sequence_endpoint(req: EvaluateRequest):
    """Evaluates an arbitrary stop sequence using the active dataset."""
    global current_data
    current_data = req.problem_data
    result = evaluate_route(req.sequence, current_data)
    return result

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=5000, reload=True)
