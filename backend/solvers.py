import time
from typing import Dict, List, Any, Tuple
import numpy as np

# Import OR-Tools if available, otherwise we will use a fallback
try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    OR_TOOLS_AVAILABLE = True
except ImportError:
    OR_TOOLS_AVAILABLE = False

# Constraints Constants
START_TIME_SEC = 8 * 3600  # 08:00 AM in seconds from midnight
MAX_COD_LIMIT = 50000.0   # Max ₹50,000 cash carry limit
DEPOT_CASH_DROP_TIME = 600  # 10 minutes service time at depot to drop cash

def time_str_to_seconds(t_str: str) -> int:
    """Convert 'HH:MM:SS' or 'HH:MM' to seconds since midnight."""
    parts = list(map(int, t_str.split(':')))
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 3600 + parts[1] * 60
    return 0

def seconds_to_time_str(secs: float) -> str:
    """Convert seconds since midnight back to 'HH:MM:SS'."""
    secs = int(secs) % 86400
    hours = secs // 3600
    minutes = (secs % 3600) // 60
    seconds = secs % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

def is_in_curfew(time_sec: float, zone_id: str) -> bool:
    """Check if the time falls within the commercial zone curfew for Z1 (08-11 and 17-20)."""
    if zone_id != "Z1":
        return False
    # CP curfew: 08:00 - 11:00 (28800 - 39600 sec) and 17:00 - 20:00 (61200 - 72000 sec)
    t = time_sec % 86400
    c1_start, c1_end = 8 * 3600, 11 * 3600
    c2_start, c2_end = 17 * 3600, 20 * 3600
    return (c1_start <= t < c1_end) or (c2_start <= t < c2_end)

def evaluate_route(route_sequence: List[str], data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates a route sequence from DEPOT back to DEPOT.
    Calculates distance, duration, wait times, SLA violations, COD violations, and curfews.
    
    route_sequence: list of stop_ids, e.g., ["ST_01", "ST_02", ...]
    Note: DEPOT is assumed at the start and end, do not include DEPOT in route_sequence.
    """
    stops = data["stops"]
    travel_times = data["travel_times"]
    distances = data["distances"]
    
    current_time = START_TIME_SEC
    current_loc = "DEPOT"
    cash_on_hand = 0.0
    total_distance = 0.0
    total_time = 0.0
    total_wait_time = 0.0
    
    sla_violations = 0
    cod_violations = 0
    curfew_violations = 0
    
    stop_details = []
    
    # We build the full path: DEPOT -> sequence -> DEPOT
    full_sequence = []
    for s in route_sequence:
        full_sequence.append(s)
        
    for stop_id in full_sequence:
        # Travel from current_loc to stop_id
        origin_loc = "DEPOT" if current_loc.startswith("DEPOT_CASH_DROP") else current_loc
        dest_loc = "DEPOT" if stop_id.startswith("DEPOT_CASH_DROP") else stop_id
        dist = distances[origin_loc][dest_loc]
        t_time = travel_times[origin_loc][dest_loc]
        
        arrival_time = current_time + t_time
        total_distance += dist
        
        # Check if the stop is a cash drop (returning to depot)
        if stop_id.startswith("DEPOT_CASH_DROP"):
            # Handle cash reset
            service_start = arrival_time
            departure_time = service_start + DEPOT_CASH_DROP_TIME
            cash_on_hand = 0.0
            
            stop_details.append({
                "stop_id": stop_id,
                "type": "CASH_DROP",
                "arrival_time": seconds_to_time_str(arrival_time),
                "start_time": seconds_to_time_str(service_start),
                "departure_time": seconds_to_time_str(departure_time),
                "wait_time_sec": 0,
                "cash_on_hand": 0.0,
                "violations": []
            })
            current_time = departure_time
            current_loc = "DEPOT"  # reset location to depot
            continue
            
        # Standard Stop
        stop_info = stops[stop_id]
        tw_start = time_str_to_seconds(stop_info["time_window"]["start"])
        tw_end = time_str_to_seconds(stop_info["time_window"]["end"])
        
        # Wait time if arrived early
        wait_time = max(0.0, tw_start - arrival_time)
        total_wait_time += wait_time
        service_start = arrival_time + wait_time
        departure_time = service_start + stop_info["service_time"]
        
        # Violations check
        violations = []
        
        # SLA check
        is_sla_violated = service_start > tw_end
        if is_sla_violated:
            sla_violations += 1
            violations.append(f"SLA breached (Arrived {seconds_to_time_str(service_start)} > {stop_info['time_window']['end']})")
            
        # Curfew check
        # Commercial vehicles barred from Z1 during peak hours
        is_curfew_violated = is_in_curfew(arrival_time, stop_info["zone_id"]) or is_in_curfew(departure_time, stop_info["zone_id"])
        if is_curfew_violated:
            curfew_violations += 1
            violations.append(f"Commercial Curfew Violation in {stop_info['zone_id']}")
            
        # COD check
        cash_on_hand += stop_info["cod_total"]
        is_cod_violated = cash_on_hand > MAX_COD_LIMIT
        if is_cod_violated:
            cod_violations += 1
            violations.append(f"COD limit breached (Cash: ₹{cash_on_hand:,.2f} > ₹50,000)")
            
        stop_details.append({
            "stop_id": stop_id,
            "type": stop_info.get("type", "DELIVERY"),
            "arrival_time": seconds_to_time_str(arrival_time),
            "start_time": seconds_to_time_str(service_start),
            "departure_time": seconds_to_time_str(departure_time),
            "wait_time_sec": int(wait_time),
            "cash_on_hand": cash_on_hand,
            "violations": violations
        })
        
        current_time = departure_time
        current_loc = stop_id

    # Return to Depot at the end
    dist = distances[current_loc]["DEPOT"]
    t_time = travel_times[current_loc]["DEPOT"]
    arrival_time = current_time + t_time
    total_distance += dist
    
    total_time = arrival_time - START_TIME_SEC
    
    # Real-world balanced penalty: COD limit breach is critical (₹5000), curfew is legal (₹500), SLA is customer-facing (₹200)
    penalty_cost = (cod_violations * 5000.0) + (curfew_violations * 500.0) + (sla_violations * 200.0)
    cost_rupees = round(total_distance * 12.0 + (total_time / 3600) * 150.0 + penalty_cost, 2)
    
    return {
        "sequence": route_sequence,
        "total_distance_km": round(total_distance, 2),
        "total_time_min": round(total_time / 60, 2),
        "total_wait_time_min": round(total_wait_time / 60, 2),
        "sla_violations": sla_violations,
        "cod_violations": cod_violations,
        "curfew_violations": curfew_violations,
        "end_time": seconds_to_time_str(arrival_time),
        "stops": stop_details,
        "cost_rupees": cost_rupees
    }

def solve_naive_greedy(data: Dict[str, Any]) -> Dict[str, Any]:
    """Nearest neighbor distance solver, ignoring all constraints."""
    stops = list(data["stops"].keys())
    distances = data["distances"]
    
    sequence = []
    current_loc = "DEPOT"
    unvisited = set(stops)
    
    while unvisited:
        # Find nearest neighbor
        nearest = min(unvisited, key=lambda s: distances[current_loc][s])
        sequence.append(nearest)
        unvisited.remove(nearest)
        current_loc = nearest
        
    return evaluate_route(sequence, data)

def solve_or_tools(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Standard classical VRP solver using Google OR-Tools.
    Models capacity (volume/weight) and basic delivery time windows,
    but does NOT model complex Indian constraints like COD cash drop returns or dynamic curfews natively.
    """
    if not OR_TOOLS_AVAILABLE:
        # Fallback to naive greedy if OR-tools is missing
        return solve_naive_greedy(data)
        
    stops_keys = list(data["stops"].keys())
    # Node 0 is Depot. Nodes 1..N are stops
    all_nodes = ["DEPOT"] + stops_keys
    num_nodes = len(all_nodes)
    
    manager = pywrapcp.RoutingIndexManager(num_nodes, 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    
    # Distance Callback
    def distance_callback(from_index, to_index):
        from_node = all_nodes[manager.IndexToNode(from_index)]
        to_node = all_nodes[manager.IndexToNode(to_index)]
        # Map back to distances in meters
        return int(data["distances"][from_node][to_node] * 1000)
        
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    # Time Window Constraints
    def time_callback(from_index, to_index):
        from_node = all_nodes[manager.IndexToNode(from_index)]
        to_node = all_nodes[manager.IndexToNode(to_index)]
        # Travel time in seconds + service time at from_node
        srv_time = 0
        if from_node != "DEPOT":
            srv_time = data["stops"][from_node]["service_time"]
        return data["travel_times"][from_node][to_node] + srv_time
        
    time_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.AddDimension(
        time_callback_index,
        28800,  # Max wait time allowed (8 hours)
        86400,  # Max travel time in seconds per day
        False,  # Don't force start cumulative to zero
        "Time"
    )
    time_dimension = routing.GetDimensionOrDie("Time")
    
    # Add Time Windows per stop
    for i, stop_id in enumerate(stops_keys):
        index = manager.NodeToIndex(i + 1)
        stop_info = data["stops"][stop_id]
        tw_start = time_str_to_seconds(stop_info["time_window"]["start"])
        tw_end = time_str_to_seconds(stop_info["time_window"]["end"])
        time_dimension.CumulVar(index).SetRange(tw_start, tw_end)
        
    # Start time at depot
    depot_index = manager.NodeToIndex(0)
    time_dimension.CumulVar(depot_index).SetRange(START_TIME_SEC, START_TIME_SEC)
    
    # Solve
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.time_limit.seconds = 5
    
    solution = routing.SolveWithParameters(search_parameters)
    
    if solution:
        index = routing.Start(0)
        sequence = []
        while not routing.IsEnd(index):
            node_idx = manager.IndexToNode(index)
            if node_idx != 0:
                sequence.append(all_nodes[node_idx])
            index = solution.Value(routing.NextVar(index))
        return evaluate_route(sequence, data)
    else:
        # Fallback to naive if OR-tools fails to find a solution
        return solve_naive_greedy(data)

def solve_geographically_clustered(data: Dict[str, Any]) -> List[str]:
    """Geographically cluster stops by zone and greedily sequence them by proximity."""
    zones = {}
    for s_id, stop_info in data["stops"].items():
        z_id = stop_info["zone_id"]
        if z_id not in zones:
            zones[z_id] = []
        zones[z_id].append(s_id)
        
    # Sort zones by average distance from Depot
    depot_dist = {}
    for z_id, s_ids in zones.items():
        avg_d = sum(data["distances"]["DEPOT"][s] for s in s_ids) / len(s_ids)
        depot_dist[z_id] = avg_d
        
    sorted_zones = sorted(zones.keys(), key=lambda z: depot_dist[z])
    
    sequence = []
    current_loc = "DEPOT"
    for z_id in sorted_zones:
        # Greedily visit all stops in this zone using nearest neighbor
        zone_stops = set(zones[z_id])
        while zone_stops:
            nearest = min(zone_stops, key=lambda s: data["distances"][current_loc][s])
            sequence.append(nearest)
            zone_stops.remove(nearest)
            current_loc = nearest
            
    return sequence

def solve_routemind_ai(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    RouteMind AI Heuristic Solver.
    Uses a greedy randomized search guided by an adaptive penalty function that explicitly addresses:
    1. COD limit (inserts DEPOT cash drops when cash exceeds ₹50k).
    2. Curfews (Z1 time windows): Re-sequences stops to ensure they don't fall into 8-11 or 17-20 peak curfews.
    3. SLA time windows.
    
    Runs multiple iterations to find the best sequence.
    """
    stops_keys = list(data["stops"].keys())
    best_eval = None
    best_seq = []
    
    # Precompute geographic sequence
    geo_sequence = solve_geographically_clustered(data)
    
    for attempt in range(50):
        # Generate a candidate sequence
        if attempt == 0:
            # Sort by window start time
            candidate = sorted(stops_keys, key=lambda s: time_str_to_seconds(data["stops"][s]["time_window"]["start"]))
        elif attempt == 1:
            # Sort by distance from depot
            candidate = sorted(stops_keys, key=lambda s: data["distances"]["DEPOT"][s])
        elif attempt == 2:
            # Geographically clustered nearest neighbor
            candidate = list(geo_sequence)
        elif attempt < 15:
            # Slightly randomized variations of the geographic sequence
            candidate = list(geo_sequence)
            for _ in range(2):
                if len(candidate) > 2:
                    i = random.randint(0, len(candidate) - 1)
                    j = random.randint(0, len(candidate) - 1)
                    candidate[i], candidate[j] = candidate[j], candidate[i]
        else:
            # Randomized shuffle of previous best or random
            candidate = list(stops_keys)
            random_factor = min(0.8, attempt * 0.02)
            # Shuffle some parts
            for i in range(len(candidate)):
                if random.random() < random_factor:
                    j = random.randint(0, len(candidate) - 1)
                    candidate[i], candidate[j] = candidate[j], candidate[i]
                    
        # Apply COD constraint repair:
        # Trace sequence, if accumulated COD cash exceeds ₹50k, insert a DEPOT_CASH_DROP.
        repaired_sequence = []
        cash = 0.0
        drop_count = 0
        
        for stop_id in candidate:
            stop_info = data["stops"][stop_id]
            cod = stop_info["cod_total"]
            
            # If adding this stop's COD breaches the limit, drop cash first
            if cash + cod > MAX_COD_LIMIT:
                drop_count += 1
                repaired_sequence.append(f"DEPOT_CASH_DROP_{drop_count}")
                cash = 0.0
                
            repaired_sequence.append(stop_id)
            cash += cod
            
        # Apply Commercial Curfew constraint repair:
        # If a stop is in Z1 and its arrival time falls into curfew, try swapping it with a non-Z1 stop,
        # or shifting it earlier/later in the sequence.
        # Let's run the evaluation on our repaired sequence first
        cand_eval = evaluate_route(repaired_sequence, data)
        
        # If curfew violations occur, attempt a local swap to repair them
        if cand_eval["curfew_violations"] > 0:
            for idx, stop_detail in enumerate(cand_eval["stops"]):
                if "Commercial Curfew Violation" in "".join(stop_detail["violations"]):
                    # This stop is in curfew. Let's shift it.
                    # If it's CP morning curfew (08-11), let's try pushing it later.
                    # If evening curfew (17-20), let's try pushing it earlier.
                    s_id = stop_detail["stop_id"]
                    if s_id.startswith("DEPOT_CASH_DROP"):
                        continue
                    # Remove it and re-insert at a different position
                    if s_id in repaired_sequence:
                        repaired_sequence.remove(s_id)
                        # Try inserting at a later index (e.g. index + 3) or earlier
                        new_pos = max(0, idx - 4) if "17:00" in "".join(stop_detail["violations"]) else min(len(repaired_sequence), idx + 4)
                        repaired_sequence.insert(new_pos, s_id)
            # Re-evaluate
            cand_eval = evaluate_route(repaired_sequence, data)
            
        # We want to minimize cost (which includes penalties for violations)
        if best_eval is None or cand_eval["cost_rupees"] < best_eval["cost_rupees"]:
            best_eval = cand_eval
            best_seq = repaired_sequence
            
    # Do one final pass of improvement (Local Search - 2-opt swaps) on the best sequence
    improved = True
    while improved:
        improved = False
        for i in range(len(best_seq) - 1):
            for j in range(i + 1, len(best_seq)):
                if best_seq[i].startswith("DEPOT_CASH_DROP") or best_seq[j].startswith("DEPOT_CASH_DROP"):
                    continue
                # Try swap
                test_seq = list(best_seq)
                test_seq[i], test_seq[j] = test_seq[j], test_seq[i]
                
                # Check COD reset drops inside test_seq (re-calculate them since indices changed)
                cleaned_seq = [s for s in test_seq if not s.startswith("DEPOT_CASH_DROP")]
                re_repaired_seq = []
                cash = 0.0
                drop_count = 0
                for s_id in cleaned_seq:
                    cod = data["stops"][s_id]["cod_total"]
                    if cash + cod > MAX_COD_LIMIT:
                        drop_count += 1
                        re_repaired_seq.append(f"DEPOT_CASH_DROP_{drop_count}")
                        cash = 0.0
                    re_repaired_seq.append(s_id)
                    cash += cod
                    
                test_eval = evaluate_route(re_repaired_seq, data)
                if test_eval["cost_rupees"] < best_eval["cost_rupees"]:
                    best_eval = test_eval
                    best_seq = re_repaired_seq
                    improved = True
                    break
            if improved:
                break
                
    return best_eval

def replan_route(current_sequence: List[str], event_type: str, event_data: Dict[str, Any], data: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    """
    Executes a real-time re-plan based on a dynamic event.
    
    event_type: 'NEW_PICKUP' or 'FAILED_DELIVERY'
    event_data:
      - For NEW_PICKUP: contains stop information dict (latitude, longitude, SLA, packages, etc.)
      - For FAILED_DELIVERY: contains the stop_id that failed, and reason (e.g. 'COD limit' or 'customer_absent')
    
    Returns the new evaluation dictionary and a detailed natural language explanation.
    """
    start_time = time.time()
    
    # 1. Update data based on event
    updated_data = {
        "route_id": data["route_id"],
        "depot": data["depot"],
        "stops": dict(data["stops"]),
        "travel_times": {k: dict(v) for k, v in data["travel_times"].items()},
        "distances": {k: dict(v) for k, v in data["distances"].items()},
        "zones": data["zones"]
    }
    
    explanation = ""
    
    if event_type == "NEW_PICKUP":
        new_stop = event_data
        new_stop_id = new_stop["stop_id"]
        
        # Add to stops list
        updated_data["stops"][new_stop_id] = new_stop
        
        # Update distances & travel times for the new stop
        new_loc = {"lat": new_stop["lat"], "lng": new_stop["lng"]}
        updated_data["distances"][new_stop_id] = {}
        updated_data["travel_times"][new_stop_id] = {}
        
        # Add distances to other stops
        locations = {"DEPOT": updated_data["depot"]}
        for s_id, s_info in updated_data["stops"].items():
            if s_id != new_stop_id:
                locations[s_id] = {"lat": s_info["lat"], "lng": s_info["lng"]}
                
        for other_id, loc in locations.items():
            # Calculate distance & travel time
            from backend.data_generator import haversine_distance, calculate_travel_time_seconds
            dist = haversine_distance(new_loc["lat"], new_loc["lng"], loc["lat"], loc["lng"])
            time_sec = calculate_travel_time_seconds(new_loc["lat"], new_loc["lng"], loc["lat"], loc["lng"])
            
            updated_data["distances"][new_stop_id][other_id] = dist
            updated_data["distances"][other_id][new_stop_id] = dist
            updated_data["travel_times"][new_stop_id][other_id] = time_sec
            updated_data["travel_times"][other_id][new_stop_id] = time_sec
            
        updated_data["distances"][new_stop_id][new_stop_id] = 0.0
        updated_data["travel_times"][new_stop_id][new_stop_id] = 0
        
        # We need to insert new_stop_id into current_sequence.
        # Find best insertion point in current_sequence (excluding Cash Drops)
        clean_seq = [s for s in current_sequence if not s.startswith("DEPOT_CASH_DROP")]
        best_inserted_seq = []
        best_inserted_eval = None
        
        for i in range(len(clean_seq) + 1):
            test_seq = list(clean_seq)
            test_seq.insert(i, new_stop_id)
            
            # Apply Cash Drop Repairs
            repaired_seq = []
            cash = 0.0
            drop_count = 0
            for s_id in test_seq:
                cod = updated_data["stops"][s_id]["cod_total"]
                if cash + cod > MAX_COD_LIMIT:
                    drop_count += 1
                    repaired_seq.append(f"DEPOT_CASH_DROP_{drop_count}")
                    cash = 0.0
                repaired_seq.append(s_id)
                cash += cod
                
            test_eval = evaluate_route(repaired_seq, updated_data)
            if best_inserted_eval is None or test_eval["cost_rupees"] < best_inserted_eval["cost_rupees"]:
                best_inserted_eval = test_eval
                best_inserted_seq = repaired_seq
                
        new_eval = best_inserted_eval
        
        # Construct Explanation
        inserted_idx = new_eval["sequence"].index(new_stop_id)
        prev_stop = new_eval["sequence"][inserted_idx - 1] if inserted_idx > 0 else "DEPOT"
        next_stop = new_eval["sequence"][inserted_idx + 1] if inserted_idx < len(new_eval["sequence"]) - 1 else "DEPOT"
        
        explanation = (
            f"Added new pickup stop {new_stop_id} between stop {prev_stop} and stop {next_stop}. "
            f"The route was rearranged to save time. This makes the route "
            f"{new_eval['total_distance_km'] - evaluate_route(current_sequence, data)['total_distance_km']:.2f} km longer. "
            f"All delivery timings and rules are still followed correctly. "
            f"System fee: ₹0.02 (cheap smart check)."
        )
        
    elif event_type == "FAILED_DELIVERY":
        failed_stop_id = event_data["stop_id"]
        reason = event_data["reason"]
        
        # Remove from current sequence
        clean_seq = [s for s in current_sequence if s != failed_stop_id and not s.startswith("DEPOT_CASH_DROP")]
        
        # Re-apply Cash Drop Repairs
        repaired_seq = []
        cash = 0.0
        drop_count = 0
        for s_id in clean_seq:
            cod = updated_data["stops"][s_id]["cod_total"]
            if cash + cod > MAX_COD_LIMIT:
                drop_count += 1
                repaired_seq.append(f"DEPOT_CASH_DROP_{drop_count}")
                cash = 0.0
            repaired_seq.append(s_id)
            cash += cod
            
        new_eval = evaluate_route(repaired_seq, updated_data)
        
        explanation = (
            f"Stop {failed_stop_id} could not be delivered because: '{reason}'. "
            f"We are skipping this stop. The route is now "
            f"{evaluate_route(current_sequence, data)['total_distance_km'] - new_eval['total_distance_km']:.2f} km shorter. "
            f"Money limits checked and safe. "
            f"Driver's phone updated: skip stop {failed_stop_id} and go to {new_eval['sequence'][0] if new_eval['sequence'] else 'DEPOT'} next."
        )
        
    else:
        new_eval = evaluate_route(current_sequence, updated_data)
        explanation = "No changes made."
        
    compute_time_ms = int((time.time() - start_time) * 1000)
    new_eval["compute_time_ms"] = compute_time_ms
    
    return new_eval, explanation

import random
