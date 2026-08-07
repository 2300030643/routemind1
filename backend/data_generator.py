import math
import random
from typing import Dict, List, Any

# Delhi NCR Depot Coordinates (Okhla Industrial Area)
DEPOT_LAT = 28.5204
DEPOT_LNG = 77.2818

# Speed in Delhi NCR traffic (km/h)
AVG_SPEED_KMH = 20.0

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    r = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return r * c

def calculate_travel_time_seconds(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """Calculate travel time in seconds between two locations."""
    dist = haversine_distance(lat1, lng1, lat2, lng2)
    # Travel time in hours = distance / speed, convert to seconds
    time_sec = int((dist / AVG_SPEED_KMH) * 3600)
    # Add a minimum of 2 minutes travel time for close stops to represent urban stop-and-go
    return max(time_sec, 120)

def generate_route_data(num_stops: int = 15) -> Dict[str, Any]:
    """Generates a route with stops and manifests following the Amazon routing schema."""
    local_random = random.Random(42)  # Local instance for thread-safe reproducibility
    
    # Zone definitions
    # Z1: Connaught Place (Commercial Zone - strict timing ban 08:00-11:00 & 17:00-20:00 for commercial trucks)
    # Z2: Saket / South Delhi (Residential - no timing ban, high COD rate)
    # Z3: Dwarka / West Delhi (Suburban - standard windows)
    
    zones = {
        "Z1": {"name": "Connaught Place (Commercial Curfew Zone)", "curfew_windows": [("08:00", "11:00"), ("17:00", "20:00")]},
        "Z2": {"name": "Saket / South Delhi (Residential Zone)", "curfew_windows": []},
        "Z3": {"name": "Dwarka / West Delhi (Suburban)", "curfew_windows": []}
    }
    
    # Lat/Lng boundaries around Delhi centered on Okhla
    # Z1: North-West of Okhla (around CP: lat 28.6304, lng 77.2177)
    # Z2: West of Okhla (around Saket: lat 28.5244, lng 77.2066)
    # Z3: Far West (Dwarka: lat 28.5889, lng 77.0578)
    
    stops = {}
    
    # Let's generate stops
    for i in range(1, num_stops + 1):
        stop_id = f"ST_{i:02d}"
        
        # Decide zone
        if i % 3 == 0:
            zone_id = "Z1"
            # CP area coordinates
            lat = DEPOT_LAT + 0.05 + local_random.uniform(-0.015, 0.015)
            lng = DEPOT_LNG - 0.06 + local_random.uniform(-0.015, 0.015)
        elif i % 3 == 1:
            zone_id = "Z2"
            # Saket area coordinates
            lat = DEPOT_LAT + local_random.uniform(-0.015, 0.015)
            lng = DEPOT_LNG - 0.07 + local_random.uniform(-0.015, 0.015)
        else:
            zone_id = "Z3"
            # Dwarka / West Delhi coordinates
            lat = DEPOT_LAT + 0.06 + local_random.uniform(-0.02, 0.02)
            lng = DEPOT_LNG - 0.18 + local_random.uniform(-0.02, 0.02)
            
        # Delivery Window SLA
        # 1: Morning (09:00 - 13:00)
        # 2: Afternoon (13:00 - 17:00)
        # 3: Evening/All Day (09:00 - 19:00)
        rand_window = local_random.choice([1, 2, 3])
        if rand_window == 1:
            time_window = {"start": "09:00:00", "end": "13:00:00"}
        elif rand_window == 2:
            time_window = {"start": "13:00:00", "end": "17:00:00"}
        else:
            time_window = {"start": "09:00:00", "end": "19:00:00"}
            
        # Package manifests at this stop
        num_packages = local_random.randint(1, 3)
        packages = []
        stop_cod_total = 0.0
        
        for p in range(num_packages):
            p_id = f"PKG_{stop_id}_{p}"
            weight = round(local_random.uniform(0.5, 10.0), 2)  # kg
            volume = round(local_random.uniform(1000, 20000), 2)  # cm^3
            
            # Cash on delivery distribution (40% probability for Z2 residential, 20% for others)
            is_cod = local_random.random() < (0.4 if zone_id == "Z2" else 0.2)
            payment_type = "COD" if is_cod else "PREPAID"
            cod_amount = round(local_random.uniform(1000.0, 15000.0), 2) if is_cod else 0.0
            stop_cod_total += cod_amount
            
            packages.append({
                "package_id": p_id,
                "weight": weight,
                "volume": volume,
                "payment_type": payment_type,
                "cod_amount": cod_amount
            })
            
        stops[stop_id] = {
            "stop_id": stop_id,
            "lat": lat,
            "lng": lng,
            "zone_id": zone_id,
            "zone_name": zones[zone_id]["name"],
            "time_window": time_window,
            "service_time": local_random.randint(300, 600),  # 5-10 mins in seconds
            "packages": packages,
            "cod_total": stop_cod_total
        }
        
    # Generate static travel time matrix between all stops (including depot)
    locations = {"DEPOT": {"lat": DEPOT_LAT, "lng": DEPOT_LNG}}
    for stop_id, stop_info in stops.items():
        locations[stop_id] = {"lat": stop_info["lat"], "lng": stop_info["lng"]}
        
    travel_times = {}
    distances = {}
    for id1, loc1 in locations.items():
        travel_times[id1] = {}
        distances[id1] = {}
        for id2, loc2 in locations.items():
            dist = haversine_distance(loc1["lat"], loc1["lng"], loc2["lat"], loc2["lng"])
            time_sec = calculate_travel_time_seconds(loc1["lat"], loc1["lng"], loc2["lat"], loc2["lng"])
            distances[id1][id2] = dist
            travel_times[id1][id2] = time_sec
            
    return {
        "route_id": "ROUTE_NCR_LASTMILE_001",
        "depot": {"stop_id": "DEPOT", "lat": DEPOT_LAT, "lng": DEPOT_LNG},
        "stops": stops,
        "travel_times": travel_times,
        "distances": distances,
        "zones": zones
    }

def get_dynamic_pool() -> List[Dict[str, Any]]:
    """Returns a set of potential dynamic stops (new pickups, customer returns, etc.) that can be inserted."""
    random.seed(999)  # Replicable dynamic stops
    pool = []
    
    # 1. A new middle-mile/reverse-logistics pickup in Dwarka (Z3)
    pool.append({
        "stop_id": "DY_PICKUP_01",
        "lat": DEPOT_LAT + 0.04,
        "lng": DEPOT_LNG - 0.12,
        "zone_id": "Z3",
        "zone_name": "Dwarka / West Delhi (Suburban)",
        "time_window": {"start": "12:00:00", "end": "16:00:00"},
        "service_time": 450,
        "type": "PICKUP",  # This is a dynamic customer return pickup
        "packages": [{
            "package_id": "PKG_DY_01",
            "weight": 4.5,
            "volume": 8000,
            "payment_type": "PREPAID",
            "cod_amount": 0.0
        }],
        "cod_total": 0.0
    })
    
    # 2. A commercial pickup in Connaught Place (Z1)
    pool.append({
        "stop_id": "DY_PICKUP_02",
        "lat": DEPOT_LAT + 0.055,
        "lng": DEPOT_LNG - 0.055,
        "zone_id": "Z1",
        "zone_name": "Connaught Place (Commercial Curfew Zone)",
        "time_window": {"start": "11:30:00", "end": "16:30:00"},
        "service_time": 600,
        "type": "PICKUP",
        "packages": [{
            "package_id": "PKG_DY_02",
            "weight": 2.0,
            "volume": 3000,
            "payment_type": "PREPAID",
            "cod_amount": 0.0
        }],
        "cod_total": 0.0
    })
    
    return pool

if __name__ == "__main__":
    data = generate_route_data(10)
    print(f"Generated route with {len(data['stops'])} stops.")
    print("Stops list:", list(data['stops'].keys()))
    print("Depot Location:", data['depot'])
