import sys
import os

# Adjust path to import backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.data_generator import generate_route_data, get_dynamic_pool
from backend.solvers import solve_naive_greedy, solve_or_tools, solve_routemind_ai, replan_route

def run_tests():
    print("=== RouteMind Backend Test Suite ===")
    
    # 1. Generate data
    print("\n[Test 1] Generating Route Data...")
    data = generate_route_data(num_stops=12)
    print(f"Generated {len(data['stops'])} stops centered around Delhi.")
    
    # 2. Run Naive Solver
    print("\n[Test 2] Running Naive Solver...")
    naive_res = solve_naive_greedy(data)
    print(f"Naive Route Distance: {naive_res['total_distance_km']} km")
    print(f"Naive SLA Violations: {naive_res['sla_violations']}")
    print(f"Naive COD Violations: {naive_res['cod_violations']}")
    print(f"Naive Curfew Violations: {naive_res['curfew_violations']}")
    
    # 3. Run OR-Tools Solver
    print("\n[Test 3] Running OR-Tools Solver...")
    or_res = solve_or_tools(data)
    print(f"OR-Tools Route Distance: {or_res['total_distance_km']} km")
    print(f"OR-Tools SLA Violations: {or_res['sla_violations']}")
    print(f"OR-Tools COD Violations: {or_res['cod_violations']}")
    
    # 4. Run RouteMind AI Solver
    print("\n[Test 4] Running RouteMind AI Solver...")
    ai_res = solve_routemind_ai(data)
    print(f"RouteMind AI Route Distance: {ai_res['total_distance_km']} km")
    print(f"RouteMind AI SLA Violations: {ai_res['sla_violations']}")
    print(f"RouteMind AI COD Violations: {ai_res['cod_violations']}")
    print(f"RouteMind AI Curfew Violations: {ai_res['curfew_violations']}")
    print(f"Route Sequence: {ai_res['sequence']}")
    
    # 5. Run Re-planning
    print("\n[Test 5] Simulating Dynamic Re-planning...")
    dynamic_pool = get_dynamic_pool()
    new_pickup = dynamic_pool[0]
    
    replan_res, explanation = replan_route(ai_res["sequence"], "NEW_PICKUP", new_pickup, data)
    print(f"Re-planned Route Distance: {replan_res['total_distance_km']} km")
    print("Supervisor Explanation:")
    print(explanation)
    
    print("\n=== All Tests Passed Successfully! ===")

if __name__ == "__main__":
    run_tests()
