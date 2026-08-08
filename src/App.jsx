import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  X, 
  Check, 
  Clock, 
  FileText
} from 'lucide-react';
import './App.css';

// Import Modular Components
import Header from './components/Header';
import KpiSummary from './components/KpiSummary';
import RouteMap from './components/RouteMap';
import DriverAppSimulator from './components/DriverAppSimulator';
import SupervisorDrawer from './components/SupervisorDrawer';
import ResetModal from './components/ResetModal';
import AddStopModal from './components/AddStopModal';

const calculateBearing = (lat1, lng1, lat2, lng2) => {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
};

export default function App() {
  // App States
  const [routeData, setRouteData] = useState(null);
  const [activeSolver, setActiveSolver] = useState('naive');
  const [solvedRoute, setSolvedRoute] = useState(null);
  const [isSolving, setIsSolving] = useState(false);
  const [comparison, setComparison] = useState({
    naive: null,
    ortools: null,
    routemind: null
  });
  
  // Dynamic Events & Re-planning
  const [dynamicPool, setDynamicPool] = useState([]);
  const [usedDynamicStops, setUsedDynamicStops] = useState([]);
  const [pendingReplan, setPendingReplan] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [simulationLogs, setSimulationLogs] = useState([
    "Operations initialized at 08:00 AM.",
    "Vehicles checked and loaded at Okhla Depot."
  ]);
  
  // Driver Simulator States
  const [isDriverOffline, setIsDriverOffline] = useState(false);
  const [driverCurrentIndex, setDriverCurrentIndex] = useState(0);
  const [driverOfflineQueue, setDriverOfflineQueue] = useState([]);
  const [driverCompletedStops, setDriverCompletedStops] = useState({});
  const [driverNotifications, setDriverNotifications] = useState([]);
  
  // UI helpers
  const [selectedStopDetails, setSelectedStopDetails] = useState(null);
  const [apiCostLog, setApiCostLog] = useState(0.0);
  const [debugCoords, setDebugCoords] = useState([]);
  const [vehicleCoords, setVehicleCoords] = useState(null);
  const [vehicleBearing, setVehicleBearing] = useState(0);
  const [liveAlert, setLiveAlert] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [clickedCoords, setClickedCoords] = useState(null);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [customStopCOD, setCustomStopCOD] = useState("5000");
  const [customStopWindow, setCustomStopWindow] = useState("09:00:00-18:00:00");
  

  const [debugLogs, setDebugLogs] = useState([]);
  
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      setDebugLogs(prev => [...prev, { type: 'error', text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }]);
      originalError.apply(console, args);
    };
    console.warn = (...args) => {
      setDebugLogs(prev => [...prev, { type: 'warn', text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }]);
      originalWarn.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  // 1. Initial Load of Route Data & Solver Pool
  useEffect(() => {
    fetchRouteData();
    fetchDynamicPool();
    fetchHistoryLogs();
  }, []);

  const fetchHistoryLogs = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/history');
      const data = await res.json();
      setHistoryLogs(data);
    } catch (err) {
      console.error("Error loading audit history logs:", err);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch('http://127.0.0.1:5000/api/history/clear', { method: 'POST' });
      fetchHistoryLogs();
      setSimulationLogs(prev => [...prev, "[Supervisor] Flushed persistent audit database history."]);
    } catch (err) {
      console.error("Error flushing history database:", err);
    }
  };

  const fetchRouteData = async (numStops = 15) => {
    try {
      setIsSolving(true);
      const res = await fetch(`http://127.0.0.1:5000/api/route-data?stops=${numStops}`);
      const data = await res.json();
      setRouteData(data);
      
      // Calculate all three solvers for comparison metrics
      await runAllSolvers(data);
      setIsSolving(false);
    } catch (err) {
      console.error("Error loading route data:", err);
      setIsSolving(false);
    }
  };

  const fetchDynamicPool = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/dynamic-pool');
      const data = await res.json();
      setDynamicPool(data);
    } catch (err) {
      console.error("Error fetching dynamic pool:", err);
    }
  };

  const runAllSolvers = async (data) => {
    try {
      const solvers = ['naive', 'ortools', 'routemind'];
      const results = {};
      
      for (const solver of solvers) {
        const res = await fetch('http://127.0.0.1:5000/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            solver_type: solver,
            problem_data: data 
          })
        });
        results[solver] = await res.json();
      }
      
      setComparison(results);
      // Select RouteMind as default solved route
      setSolvedRoute(results['routemind']);
      setActiveSolver('routemind');
      
      setApiCostLog(prev => prev + 0.08); // Add solver token costs (approx)
    } catch (err) {
      console.error("Error running solvers:", err);
    }
  };



  // 3.1. Animate vehicle tracking between stops
  useEffect(() => {
    if (!solvedRoute || !routeData) return;
    
    // Construct the sequence of coordinates
    const depotLoc = [routeData.depot.lat, routeData.depot.lng];
    const seqCoords = [depotLoc];
    solvedRoute.stops.forEach(stop => {
      if (stop.stop_id.startsWith('DEPOT_CASH_DROP')) {
        seqCoords.push(depotLoc);
      } else {
        const info = routeData.stops[stop.stop_id];
        if (info) seqCoords.push([info.lat, info.lng]);
      }
    });
    seqCoords.push(depotLoc);

    // If we are not actively animating, park the truck at the current stop coordinates
    if (!isAnimating) {
      const parkIdx = Math.min(driverCurrentIndex, seqCoords.length - 1);
      setVehicleCoords(seqCoords[parkIdx]);
      
      // Calculate heading angle to the next stop for correct parking alignment
      if (parkIdx < seqCoords.length - 1) {
        const bearing = calculateBearing(
          seqCoords[parkIdx][0], seqCoords[parkIdx][1],
          seqCoords[parkIdx + 1][0], seqCoords[parkIdx + 1][1]
        );
        setVehicleBearing(bearing);
      }
      return;
    }

    // Determine starting stop (last completed stop) and ending stop (current target stop)
    const prevIdx = driverCurrentIndex - 1;
    const nextIdx = driverCurrentIndex;
    
    if (prevIdx < 0 || nextIdx >= seqCoords.length) {
      setIsAnimating(false);
      return;
    }
    
    const startLoc = seqCoords[prevIdx];
    const endLoc = seqCoords[nextIdx];
    
    // Pan map view to center on the target destination stop at the start of transit
    if (mapRef.current) {
      mapRef.current.panTo(endLoc, { animate: true });
    }
    
    // Calculate heading angle
    const bearing = calculateBearing(startLoc[0], startLoc[1], endLoc[0], endLoc[1]);
    setVehicleBearing(bearing);
    
    // Animate coordinates transition
    let startTime = null;
    const duration = 2000; // 2 seconds animation transit between locations
    
    let animFrameId;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const t = Math.min(progress / duration, 1.0); // clamp t between 0 and 1
      
      const currentLat = startLoc[0] + t * (endLoc[0] - startLoc[0]);
      const currentLng = startLoc[1] + t * (endLoc[1] - startLoc[1]);
      
      setVehicleCoords([currentLat, currentLng]);
      
      if (t < 1.0) {
        animFrameId = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false); // Stop animating once we arrive
        
        // When the truck physically arrives at the target stop, apply the completion status!
        if (pendingDelivery) {
          const { stopId, status } = pendingDelivery;
          
          setDriverCompletedStops(prev => ({
            ...prev,
            [stopId]: { status, synced: true }
          }));
          
          setSimulationLogs(prev => [...prev, `[Driver Sync] Mark ${stopId} as ${status} (synced to dashboard).`]);
          
          // Show the floating live alert toast on arrival!
          let headingText = "";
          if (driverCurrentIndex < solvedRoute.stops.length) {
            const nextStop = solvedRoute.stops[driverCurrentIndex];
            const nextTitle = nextStop.stop_id.startsWith('DEPOT_CASH_DROP') 
              ? "Office Cash Deposit" 
              : `Stop ${nextStop.stop_id}`;
            headingText = `moving to ${nextTitle} (ETA: ${nextStop.arrival_time})`;
          } else {
            headingText = "returning to Okhla Depot (shift complete)";
          }
          
          const outcomeMsg = status === 'DELIVERED' 
            ? `✅ Stop ${stopId} is Delivered!` 
            : `⚠️ Stop ${stopId} bypass reported!`;
            
          setLiveAlert(`${outcomeMsg} The truck is now ${headingText}.`);
          
          // Auto-dismiss toast
          setTimeout(() => {
            setLiveAlert(null);
          }, 5000);
          
          setPendingDelivery(null); // Clear the pending delivery
        }
      }
    };
    
    animFrameId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [driverCurrentIndex, solvedRoute, routeData, isAnimating, pendingDelivery]);

  // 4. Handle Solver Selection Tab
  const handleSolverChange = (solver) => {
    setActiveSolver(solver);
    setSolvedRoute(comparison[solver]);
    setDriverCurrentIndex(0);
    setDriverCompletedStops({});
  };

  // 5. Trigger Simulations (failed delivery, new dynamic pickup)
  const simulateNewPickup = async () => {
    if (isDriverOffline) {
      // Queue action offline
      setDriverNotifications(prev => [
        ...prev, 
        { id: Date.now(), msg: "Cannot receive dynamic pickup: connection lost.", type: "offline" }
      ]);
      setSimulationLogs(prev => [...prev, "[Driver Offline] New pickup trigger failed: device unreachable."]);
      return;
    }
    
    // Find a dynamic stop from the pool that hasn't been used yet
    const nextAvailable = dynamicPool.find(s => !usedDynamicStops.includes(s.stop_id));
    if (!nextAvailable) {
      alert("All available dynamic stops in the pool have been dispatched!");
      return;
    }
    
    setIsSolving(true);
    try {
      // Call backend re-planning api
      const currentSeq = solvedRoute.sequence;
      const res = await fetch('http://127.0.0.1:5000/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_sequence: currentSeq,
          event_type: 'NEW_PICKUP',
          event_data: nextAvailable,
          problem_data: routeData
        })
      });
      const result = await res.json();
      
      setPendingReplan({
        event_type: 'NEW_PICKUP',
        event_data: nextAvailable,
        evaluation: result.evaluation,
        explanation: result.explanation,
        cost: result.cost_per_compute_rupees,
        updatedProblemData: result.updated_problem_data
      });
      
      setApiCostLog(prev => prev + result.cost_per_compute_rupees);
      setUsedDynamicStops(prev => [...prev, nextAvailable.stop_id]);
      setSimulationLogs(prev => [...prev, `[SIM] Dynamic Pickup Requested at ${nextAvailable.stop_id}. Sent to AI re-planner.`]);
    } catch (err) {
      console.error("Re-planning error:", err);
    }
    setIsSolving(false);
  };

  const simulateFailedDelivery = async (stopId, reason) => {
    if (!stopId) return;
    
    setIsSolving(true);
    try {
      const currentSeq = solvedRoute.sequence;
      const res = await fetch('http://127.0.0.1:5000/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_sequence: currentSeq,
          event_type: 'FAILED_DELIVERY',
          event_data: { stop_id: stopId, reason },
          problem_data: routeData
        })
      });
      const result = await res.json();
      
      setPendingReplan({
        event_type: 'FAILED_DELIVERY',
        event_data: { stop_id: stopId, reason },
        evaluation: result.evaluation,
        explanation: result.explanation,
        cost: result.cost_per_compute_rupees
      });
      
      setApiCostLog(prev => prev + result.cost_per_compute_rupees);
      setSimulationLogs(prev => [...prev, `[SIM] Failed Delivery reported at ${stopId} (${reason}). Calculating re-plan.`]);
    } catch (err) {
      console.error("Re-planning error:", err);
    }
    setIsSolving(false);
  };

  const approveReplan = async () => {
    if (!pendingReplan) return;
    
    // Save to local database
    try {
      const oldVio = (solvedRoute?.sla_violations || 0) + (solvedRoute?.cod_violations || 0) + (solvedRoute?.curfew_violations || 0);
      const newVio = (pendingReplan.evaluation?.sla_violations || 0) + (pendingReplan.evaluation?.cod_violations || 0) + (pendingReplan.evaluation?.curfew_violations || 0);
      const violationsSaved = oldVio - newVio;
      
      const costChange = (pendingReplan.evaluation?.cost_rupees || 0) - (solvedRoute?.cost_rupees || 0);
      const distanceChange = (pendingReplan.evaluation?.total_distance_km || 0) - (solvedRoute?.total_distance_km || 0);
      
      await fetch('http://127.0.0.1:5000/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: pendingReplan.event_type,
          event_time: new Date().toLocaleTimeString(),
          stop_id: pendingReplan.event_data.stop_id,
          explanation: pendingReplan.explanation,
          cost_change_rupees: parseFloat(costChange.toFixed(2)),
          distance_change_km: parseFloat(distanceChange.toFixed(2)),
          violations_saved: violationsSaved > 0 ? violationsSaved : 0
        })
      });
      fetchHistoryLogs();
    } catch (e) {
      console.error("Error saving approved replan to database:", e);
    }

    let updatedRouteData = routeData;
    if (pendingReplan.updatedProblemData) {
      updatedRouteData = pendingReplan.updatedProblemData;
      setRouteData(updatedRouteData);
    } else if (pendingReplan.event_type === 'NEW_PICKUP') {
      const newStop = pendingReplan.event_data;
      updatedRouteData = {
        ...routeData,
        stops: {
          ...routeData.stops,
          [newStop.stop_id]: newStop
        }
      };
      setRouteData(updatedRouteData);
    }
    
    const newRoute = pendingReplan.evaluation;
    
    // Re-run all solvers on the updated route data so all tabs are solved for the new stop
    runAllSolvers(updatedRouteData);
    
    setSolvedRoute(newRoute);
    setActiveSolver('routemind');
    
    setSimulationLogs(prev => [
      ...prev, 
      `[Supervisor] Approved re-plan for ${pendingReplan.event_type === 'NEW_PICKUP' ? 'New Pickup' : 'Failed Delivery'}.`
    ]);
    
    // Notify Driver App
    const notifyMsg = pendingReplan.event_type === 'NEW_PICKUP' 
      ? `Route updated: New reverse pickup ${pendingReplan.event_data.stop_id} inserted.`
      : `Route updated: Stop ${pendingReplan.event_data.stop_id} bypassed due to failure.`;
      
    setDriverNotifications(prev => [...prev, { id: Date.now(), msg: notifyMsg, type: "update" }]);
    
    // Clear pending approval
    setPendingReplan(null);
    setDriverCurrentIndex(0);
  };

  const declineReplan = () => {
    if (!pendingReplan) return;
    
    setSimulationLogs(prev => [
      ...prev, 
      `[Supervisor] Declined re-plan. Reverted to previous sequence.`
    ]);
    
    // Remove from used list if it was a new pickup
    if (pendingReplan.event_type === 'NEW_PICKUP') {
      setUsedDynamicStops(prev => prev.filter(id => id !== pendingReplan.event_data.stop_id));
    }
    
    setPendingReplan(null);
  };

  // 7. Driver Simulator Actions
  const toggleDriverOffline = () => {
    setIsDriverOffline(prev => !prev);
    const mode = !isDriverOffline ? "Offline (disconnected)" : "Online";
    setSimulationLogs(prev => [...prev, `[Driver] Mobile terminal status changed to: ${mode}.`]);
    
    // Sync offline queue if turning back online
    if (isDriverOffline) {
      syncOfflineQueue();
    }
  };

  const markStopStatus = (stopId, status) => {
    if (isDriverOffline) {
      // Queue changes locally
      setDriverOfflineQueue(prev => [...prev, { stopId, status, timestamp: new Date().toLocaleTimeString() }]);
      setDriverCompletedStops(prev => ({
        ...prev,
        [stopId]: { status, synced: false }
      }));
      setSimulationLogs(prev => [...prev, `[Driver Cache] Mark ${stopId} as ${status} (cached locally).`]);
    } else {
      // Immediate update
      setDriverCompletedStops(prev => ({
        ...prev,
        [stopId]: { status, synced: true }
      }));
      setSimulationLogs(prev => [...prev, `[Driver Sync] Mark ${stopId} as ${status} (synced to dashboard).`]);
      
      // Auto advance driver index
      if (driverCurrentIndex < solvedRoute.stops.length) {
        const nextIdx = driverCurrentIndex + 1;
        setDriverCurrentIndex(nextIdx);
        
        // Show a live floating toast pop-up detailing that the delivery is completed and where the truck is going next
        let headingText = "";
        if (nextIdx < solvedRoute.stops.length) {
          const nextStop = solvedRoute.stops[nextIdx];
          const nextTitle = nextStop.stop_id.startsWith('DEPOT_CASH_DROP') 
            ? "Office Cash Deposit" 
            : `Stop ${nextStop.stop_id}`;
          headingText = `moving to ${nextTitle} (ETA: ${nextStop.arrival_time})`;
          
          // Pan map to center on the target destination stop immediately
          const nextStopInfo = routeData.stops[nextStop.stop_id];
          if (nextStopInfo && mapRef.current) {
            mapRef.current.panTo([nextStopInfo.lat, nextStopInfo.lng], { animate: true });
          }
        } else {
          headingText = "returning to Okhla Depot (shift complete)";
          
          // Pan back to depot
          if (mapRef.current) {
            mapRef.current.panTo([routeData.depot.lat, routeData.depot.lng], { animate: true });
          }
        }
        
        const outcomeMsg = status === 'DELIVERED' 
          ? `✅ Stop ${stopId} is Delivered!` 
          : `⚠️ Stop ${stopId} bypass reported!`;
          
        setLiveAlert(`${outcomeMsg} The team is now ${headingText}.`);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setLiveAlert(null);
        }, 5000);
      }
    }
  };

  const syncOfflineQueue = () => {
    if (driverOfflineQueue.length === 0) return;
    
    // Simulating delay for sync
    setTimeout(() => {
      setDriverCompletedStops(prev => {
        const updated = { ...prev };
        driverOfflineQueue.forEach(item => {
          if (updated[item.stopId]) {
            updated[item.stopId].synced = true;
          }
        });
        return updated;
      });
      setSimulationLogs(prev => [
        ...prev, 
        `[Driver Sync] Synchronized ${driverOfflineQueue.length} offline status updates to the hub.`
      ]);
      setDriverOfflineQueue([]);
    }, 1500);
  };

  const dismissNotification = (id) => {
    setDriverNotifications(prev => prev.filter(n => n.id !== id));
  };

  // 8. Reset Simulation Helper
  const resetEntireSimulation = () => {
    setVehicleCoords(null);
    setVehicleBearing(0);
    setIsAnimating(false);
    setPendingDelivery(null);
    fetchRouteData();
    fetchDynamicPool();
    setUsedDynamicStops([]);
    setPendingReplan(null);
    setDriverCurrentIndex(0);
    setDriverOfflineQueue([]);
    setDriverCompletedStops({});
    setDriverNotifications([]);
    setApiCostLog(0.0);
    setSimulationLogs([
      "Operations reset to initial state.",
      "Okhla Central Hub reloaded static manifests."
    ]);
    setShowConfirmReset(false);
  };

  // 9. Add Custom Stop via Map Click Coordinates
  const handleAddCustomStop = async (codAmount, timeWindow, zoneId) => {
    if (!clickedCoords) return;
    
    const customStopId = `ST_MAP_${Math.floor(Math.random() * 900) + 100}`;
    const [start, end] = timeWindow.split('-');
    
    const zoneNames = {
      "Z1": "Connaught Place (Commercial Curfew Zone)",
      "Z2": "Saket / South Delhi (Residential Zone)",
      "Z3": "Dwarka / West Delhi (Suburban)"
    };
    
    const newStop = {
      stop_id: customStopId,
      lat: clickedCoords.lat,
      lng: clickedCoords.lng,
      zone_id: zoneId,
      zone_name: zoneNames[zoneId] || "Custom Map Waypoint",
      time_window: { start, end },
      service_time: 450,
      type: "DELIVERY",
      packages: [{
        package_id: `PKG_${customStopId}_0`,
        weight: 3.0,
        volume: 6000,
        payment_type: codAmount > 0 ? "COD" : "PREPAID",
        cod_amount: codAmount
      }],
      cod_total: codAmount
    };
    
    setIsSolving(true);
    try {
      const currentSeq = solvedRoute.sequence;
      const res = await fetch('http://127.0.0.1:5000/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_sequence: currentSeq,
          event_type: 'NEW_PICKUP',
          event_data: newStop,
          problem_data: routeData
        })
      });
      const result = await res.json();
      setPendingReplan({
        event_type: 'NEW_PICKUP',
        event_data: newStop,
        evaluation: result.evaluation,
        explanation: `Added new custom stop ${customStopId} via map click at Lat: ${clickedCoords.lat.toFixed(4)}, Lng: ${clickedCoords.lng.toFixed(4)}. Cash: ₹${codAmount.toLocaleString()} | SLA: ${timeWindow}.`,
        cost: result.cost_per_compute_rupees,
        updatedProblemData: result.updated_problem_data
      });
      
      setApiCostLog(prev => prev + result.cost_per_compute_rupees);
      setSimulationLogs(prev => [...prev, `[Map Click] Added custom stop ${customStopId} at (${clickedCoords.lat.toFixed(4)}, ${clickedCoords.lng.toFixed(4)}).`]);
      setShowAddStopModal(false);
      setClickedCoords(null);
    } catch (err) {
      console.error("Custom stop planning error:", err);
    }
    setIsSolving(false);
  };

  // 10. Manual Route Re-ordering (Move Stop Up/Down)
  const handleMoveStop = async (index, direction) => {
    if (!solvedRoute) return;
    const newSeq = [...solvedRoute.sequence];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newSeq.length) return;
    
    // Swap
    [newSeq[index], newSeq[targetIndex]] = [newSeq[targetIndex], newSeq[index]];
    
    setIsSolving(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sequence: newSeq,
          problem_data: routeData 
        })
      });
      const result = await res.json();
      
      setSolvedRoute(result);
      setComparison(prev => ({
        ...prev,
        routemind: result
      }));
      setActiveSolver('routemind');
      setSimulationLogs(prev => [...prev, `[Manual Re-order] Swapped stop positions ${index + 1} and ${targetIndex + 1}.`]);
    } catch (err) {
      console.error("Manual evaluation error:", err);
    }
    setIsSolving(false);
  };

  return (
    <div className="app-container">
      {/* GLASSMORPHIC LOADER OVERLAY */}
      {isSolving && (
        <div className="glass-loader-overlay">
          <div className="glass-loader-card">
            <div className="spinner-glow"></div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>RouteMind Optimizer</div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Re-calculating travel paths & safety regulations...</div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <Header 
        apiCostLog={apiCostLog}
        isDriverOffline={isDriverOffline}
        onStartOverClick={() => setShowConfirmReset(true)}
      />

      {/* FLOATING LIVE ALERT TOAST POP-UP */}
      {liveAlert && (
        <div style={{
          position: 'fixed',
          top: '5.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(10px)',
          border: '2px solid var(--color-success)',
          borderRadius: '12px',
          padding: '0.85rem 1.75rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.85rem',
          fontWeight: 650,
          color: 'var(--text-main)',
          animation: 'slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <span style={{ fontSize: '16px' }}>🚚</span>
          <span>{liveAlert}</span>
          <X 
            size={14} 
            style={{ marginLeft: '1rem', color: 'var(--text-muted)', cursor: 'pointer' }} 
            onClick={() => setLiveAlert(null)} 
          />
        </div>
      )}

      {/* DASHBOARD CONTENT GRID */}
      <div className="dashboard-grid">
        {/* PANEL 1: CONTROL CENTER & COMPLETED KPI METRICS */}
        <KpiSummary 
          solvedRoute={solvedRoute}
          comparison={comparison}
          activeSolver={activeSolver}
          isSolving={isSolving}
          isDriverOffline={isDriverOffline}
          driverCompletedStops={driverCompletedStops}
          onSolverChange={handleSolverChange}
          onSimulatePickup={simulateNewPickup}
          onSimulateFail={simulateFailedDelivery}
        />

        {/* PANEL 2: MAP VISUALIZATION & LIVE SEQUENCE TIMELINE */}
        <RouteMap 
          solvedRoute={solvedRoute}
          routeData={routeData}
          activeSolver={activeSolver}
          driverCurrentIndex={driverCurrentIndex}
          driverCompletedStops={driverCompletedStops}
          isAnimating={isAnimating}
          vehicleCoords={vehicleCoords}
          vehicleBearing={vehicleBearing}
          isSolving={isSolving}
          simulationLogs={simulationLogs}
          historyLogs={historyLogs}
          onClearHistory={handleClearHistory}
          onMapClick={(lat, lng) => {
            setClickedCoords({ lat, lng });
            setShowAddStopModal(true);
          }}
        />

        {/* PANEL 3: DRIVER COMPANION APP & ACTIVE STOP SEQUENCE */}
        <DriverAppSimulator 
          solvedRoute={solvedRoute}
          routeData={routeData}
          driverCurrentIndex={driverCurrentIndex}
          driverCompletedStops={driverCompletedStops}
          isDriverOffline={isDriverOffline}
          driverNotifications={driverNotifications}
          onToggleOffline={toggleDriverOffline}
          onDismissNotification={dismissNotification}
          onMarkStopStatus={markStopStatus}
          onMoveStop={handleMoveStop}
        />
      </div>

      {/* SUPERVISOR APPROVAL DRAWER */}
      <SupervisorDrawer 
        pendingReplan={pendingReplan}
        solvedRoute={solvedRoute}
        onApprove={approveReplan}
        onDecline={declineReplan}
      />

      {/* MODAL / CONFIRMATION FOR RESET */}
      <ResetModal 
        show={showConfirmReset}
        onConfirm={resetEntireSimulation}
        onCancel={() => setShowConfirmReset(false)}
      />

      {/* MODAL FOR ADDING CUSTOM STOP VIA MAP CLICK */}
      <AddStopModal 
        show={showAddStopModal}
        clickedCoords={clickedCoords}
        customStopCOD={customStopCOD}
        customStopWindow={customStopWindow}
        setCustomStopCOD={setCustomStopCOD}
        setCustomStopWindow={setCustomStopWindow}
        onAdd={handleAddCustomStop}
        onCancel={() => { setShowAddStopModal(false); setClickedCoords(null); }}
      />
    </div>
  );
}
