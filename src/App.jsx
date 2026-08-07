import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { 
  TrendingUp, 
  MapPin, 
  Navigation, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  User, 
  DollarSign, 
  ShieldAlert, 
  Truck, 
  Plus, 
  X, 
  Check, 
  Layers, 
  Clock, 
  FileText
} from 'lucide-react';
import './App.css';

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
  
  // Leaflet Map Ref
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);

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
  }, []);

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

  // 2. Leaflet Map setup
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    // Initialize map if not already done
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([28.5204, 77.2818], 11);

      // Add Light themed map tiles (CartoDB Voyager)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(mapRef.current);
      
      // Add zoom control in top right
      L.control.zoom({ position: 'topright' }).addTo(mapRef.current);
      
      // Layer group for routing markers/polylines
      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);

      // Handle user clicking on the map to add a custom waypoint stop
      mapRef.current.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setClickedCoords({ lat, lng });
        setShowAddStopModal(true);
      });
    }

    return () => {
      // Clean up map container on unmount
    };
  }, []);

  // 3. Draw Route on map whenever solvedRoute or routeData changes
  useEffect(() => {
    if (!solvedRoute || !routeData || !layerGroupRef.current || !mapRef.current) return;
    
    // Clear existing layer markers
    layerGroupRef.current.clearLayers();
    
    const latlngs = [];
    const depotLoc = [routeData.depot.lat, routeData.depot.lng];
    latlngs.push(depotLoc);
    
    // Custom glowing icon for Okhla Depot
    const depotIcon = L.divIcon({
      className: 'custom-map-marker depot-marker',
      html: `<div class="marker-glow depot"></div><div class="marker-core depot">H</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    
    L.marker(depotLoc, { icon: depotIcon })
      .addTo(layerGroupRef.current)
      .bindPopup(`<b>Okhla Central Hub (DEPOT)</b><br/>Status: Active<br/>COD Cash Drop Point`);

    // Draw active stops
    solvedRoute.stops.forEach((stop, index) => {
      // Find stop coordinates
      let stopLoc, stopName, zone, codText, labelText;
      let markerColor = 'delivery';
      
      if (stop.stop_id.startsWith('DEPOT_CASH_DROP')) {
        stopLoc = depotLoc;
        stopName = `Depot Cash Drop-off (${stop.stop_id})`;
        markerColor = 'cash_drop';
        labelText = '₹';
      } else {
        const stopInfo = routeData.stops[stop.stop_id];
        stopLoc = [stopInfo.lat, stopInfo.lng];
        stopName = `Stop ${stop.stop_id}`;
        zone = stopInfo.zone_name;
        codText = stopInfo.cod_total > 0 ? `COD Amount: ₹${stopInfo.cod_total}` : 'Prepaid';
        labelText = (index + 1).toString();
        
        markerColor = 'white';

        // Override color if driver has completed this delivery
        const completedInfo = driverCompletedStops[stop.stop_id];
        if (completedInfo) {
          markerColor = completedInfo.status === 'DELIVERED' ? 'completed' : 'failed';
        }
      }
      
      latlngs.push(stopLoc);
      
      const customIcon = L.divIcon({
        className: `custom-map-marker ${markerColor}-marker`,
        html: `<div class="marker-glow ${markerColor}"></div><div class="marker-core ${markerColor}">${labelText}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker(stopLoc, { icon: customIcon }).addTo(layerGroupRef.current);
      
      // Popup binding
      const popupHtml = `
        <div style="font-family: Outfit, sans-serif; font-size: 13px;">
          <h4 style="margin:0 0 5px 0; color:#fff;">${stopName}</h4>
          ${zone ? `<div style="color:#94a3b8; font-size:11px;">Zone: ${zone}</div>` : ''}
          <div style="margin: 5px 0;">Sequence Position: <b>#${index + 1}</b></div>
          <div>ETA: <b>${stop.arrival_time}</b></div>
          <div>Service: <b>${stop.start_time} - ${stop.departure_time}</b></div>
          ${codText ? `<div style="color:#10b981; font-weight:600; margin-top:2px;">${codText}</div>` : ''}
          ${stop.violations.length > 0 ? `
            <div style="color:#ef4444; font-weight:700; margin-top:5px; font-size:11px;">
              ⚠️ ${stop.violations.join(', ')}
            </div>
          ` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);
    });
    
    // Construct sequential coordinate coordinates for segment-by-segment styling
    const seqCoords = [depotLoc];
    solvedRoute.stops.forEach(stop => {
      if (stop.stop_id.startsWith('DEPOT_CASH_DROP')) {
        seqCoords.push(depotLoc);
      } else {
        const info = routeData.stops[stop.stop_id];
        if (info) {
          seqCoords.push([info.lat, info.lng]);
        }
      }
    });
    seqCoords.push(depotLoc);

    // Save to state for UI diagnostic overlay
    setDebugCoords(seqCoords);

    // Determine active segment index based on animation state
    const activeSegIdx = isAnimating ? driverCurrentIndex - 1 : driverCurrentIndex;

    // Draw route using continuous path polylines for maximum rendering stability
    // 1. Traveled Completed Path (slate black)
    if (activeSegIdx > 0) {
      const completedCoords = seqCoords.slice(0, activeSegIdx + 1);
      L.polyline(completedCoords, {
        color: '#0f172a',
        weight: 5.5,
        opacity: 1.0,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layerGroupRef.current);
    }

    // 2. Active Leg (dashed blinking cyan)
    if (activeSegIdx >= 0 && activeSegIdx < seqCoords.length - 1) {
      const activeLegCoords = [seqCoords[activeSegIdx], seqCoords[activeSegIdx + 1]];
      L.polyline(activeLegCoords, {
        color: '#22d3ee',
        weight: 5.0,
        opacity: 1.0,
        dashArray: '6, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layerGroupRef.current);
    }

    // 3. Future Path (indigo/pink)
    if (activeSegIdx < seqCoords.length - 1) {
      const futureCoords = seqCoords.slice(activeSegIdx + 1);
      // Connect future path to the active leg end coordinate
      futureCoords.unshift(seqCoords[activeSegIdx + 1]);
      
      const futureColor = activeSolver === 'naive' ? '#f43f5e' : '#818cf8';
      L.polyline(futureCoords, {
        color: futureColor,
        weight: 3.0,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layerGroupRef.current);
    }

    // Fit map bounds to show the entire route
    try {
      const bounds = L.latLngBounds(latlngs);
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    } catch (e) {
      console.warn("Could not fit map bounds:", e);
    }

  }, [solvedRoute, routeData, activeSolver, driverCurrentIndex, vehicleCoords, vehicleBearing]);

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
      
      // Load pending approval drawer for supervisor
      setPendingReplan({
        event_type: 'NEW_PICKUP',
        event_data: nextAvailable,
        evaluation: result.evaluation,
        explanation: result.explanation,
        cost: result.cost_per_compute_rupees
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

  const approveReplan = () => {
    if (!pendingReplan) return;
    
    let updatedRouteData = routeData;
    if (pendingReplan.event_type === 'NEW_PICKUP') {
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
  const handleAddCustomStop = async () => {
    if (!clickedCoords) return;
    
    const customStopId = `ST_MAP_${Math.floor(Math.random() * 900) + 100}`;
    const [start, end] = customStopWindow.split('-');
    
    const newStop = {
      stop_id: customStopId,
      lat: clickedCoords.lat,
      lng: clickedCoords.lng,
      zone_id: "Z3",
      zone_name: "Custom Map Waypoint",
      time_window: { start, end },
      service_time: 450,
      type: "DELIVERY",
      packages: [{
        package_id: `PKG_${customStopId}_0`,
        weight: 3.0,
        volume: 6000,
        payment_type: parseFloat(customStopCOD) > 0 ? "COD" : "PREPAID",
        cod_amount: parseFloat(customStopCOD) || 0.0
      }],
      cod_total: parseFloat(customStopCOD) || 0.0
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
        explanation: `Added new custom stop ${customStopId} via map click at Lat: ${clickedCoords.lat.toFixed(4)}, Lng: ${clickedCoords.lng.toFixed(4)}. Cash: ₹${parseFloat(customStopCOD).toLocaleString()} | SLA: ${customStopWindow}.`,
        cost: result.cost_per_compute_rupees
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
      {/* HEADER SECTION */}
      <header>
        <div className="brand-section">
          <Truck className="text-indigo-500" size={28} style={{color: '#6366f1'}} />
          <div>
            <h1 className="brand-logo">RouteMind</h1>
            <div style={{fontSize: '9px', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '-2px'}}>SIMPLE ROUTE PLANNING FOR DELIVERY PARTNERS</div>
          </div>
          <span className="brand-tag">Last-Mile Plan</span>
        </div>
        
        {/* KPI TELEMETRY SUMMARY */}
        <div className="system-status">
          <div className="status-indicator">
            <span>System Route Fee:</span>
            <span style={{color: '#00d2ff', fontWeight: 700}}>₹{apiCostLog.toFixed(3)}</span>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${isDriverOffline ? 'offline' : 'online'}`}></span>
            <span>Driver's Phone connection: <b>{isDriverOffline ? 'DISCONNECTED (NO NET)' : 'CONNECTED (OK)'}</b></span>
          </div>
          <button className="btn btn-secondary btn-mini" style={{width: 'auto'}} onClick={() => setShowConfirmReset(true)}>
            Start Over
          </button>
        </div>
      </header>

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
          <span style={{fontSize: '16px'}}>🚚</span>
          <span>{liveAlert}</span>
          <X 
            size={14} 
            style={{marginLeft: '1rem', color: 'var(--text-muted)', cursor: 'pointer'}} 
            onClick={() => setLiveAlert(null)} 
          />
        </div>
      )}

      {/* DASHBOARD CONTENT GRID */}
      <div className="dashboard-grid">
        
        {/* PANEL 1: CONTROL CENTER & COMPLETED KPI METRICS */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title"><TrendingUp size={18} style={{color: '#6366f1'}} /> Route Planner (Pick a Plan)</h2>
          </div>
          
          <div className="control-group">
            <label style={{fontSize: '0.8rem', color: '#94a3b8'}}>Choose how to plan the route:</label>
            <div className="solver-select-group">
              <button 
                className={`solver-btn ${activeSolver === 'naive' ? 'active' : ''}`}
                onClick={() => handleSolverChange('naive')}
              >
                Old Way (Distance Only)
              </button>
              <button 
                className={`solver-btn ${activeSolver === 'ortools' ? 'active' : ''}`}
                onClick={() => handleSolverChange('ortools')}
              >
                Standard Computer Plan
              </button>
              <button 
                className={`solver-btn ${activeSolver === 'routemind' ? 'active' : ''}`}
                onClick={() => handleSolverChange('routemind')}
              >
                RouteMind Smart Plan (Safety & Cash First)
              </button>
            </div>
          </div>

          {solvedRoute && (
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Route Cost (INR)</span>
                <span className="kpi-value cost">₹{solvedRoute.cost_rupees.toLocaleString()}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Total Distance</span>
                <span className="kpi-value distance">{solvedRoute.total_distance_km} km</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Work Time</span>
                <span className="kpi-value time">{(solvedRoute.total_time_min / 60).toFixed(1)} hrs</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Rules Broken</span>
                <span className={`kpi-value ${solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations > 0 ? 'text-rose-500' : 'text-emerald-500'}`} style={{color: solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations > 0 ? '#ef4444' : '#10b981'}}>
                  {solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations}
                </span>
              </div>
            </div>
          )}

          {/* Solver Comparison Chart Widget */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem'}}>
            <label style={{fontSize: '0.8rem', color: '#94a3b8'}}>Cost Comparison (Lower is Cheaper):</label>
            <div className="comparison-container">
              {['naive', 'ortools', 'routemind'].map(s => {
                const cost = comparison[s]?.cost_rupees || 0;
                const maxCost = Math.max(
                  comparison['naive']?.cost_rupees || 1,
                  comparison['ortools']?.cost_rupees || 1,
                  comparison['routemind']?.cost_rupees || 1
                );
                const widthPercent = (cost / maxCost) * 100;
                return (
                  <div key={s} className="comparison-row">
                    <span className="comparison-label">{s === 'naive' ? 'Old Way' : s === 'ortools' ? 'Standard' : 'RouteMind'}</span>
                    <div className="comparison-bar-container">
                      <div className={`comparison-bar ${s}`} style={{width: `${widthPercent}%`}}></div>
                    </div>
                    <span className="comparison-value">₹{Math.round(cost)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Indian Constraint Tracker */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem'}}>
            <label style={{fontSize: '0.8rem', color: '#94a3b8'}}>Safety & Money Rules Status:</label>
            <div className="constraint-list">
              <div className="constraint-item">
                <div className="constraint-info">
                  <DollarSign size={14} style={{color: '#10b981'}} />
                  <span>Cash carry limit (Max ₹50,000)</span>
                </div>
                <span className={`badge-status ${solvedRoute?.cod_violations === 0 ? 'pass' : 'fail'}`}>
                  {solvedRoute?.cod_violations === 0 ? 'OK' : `${solvedRoute?.cod_violations} TOO HIGH`}
                </span>
              </div>
              <div className="constraint-item">
                <div className="constraint-info">
                  <ShieldAlert size={14} style={{color: '#fbbf24'}} />
                  <span>CP No-Entry peak timing</span>
                </div>
                <span className={`badge-status ${solvedRoute?.curfew_violations === 0 ? 'pass' : 'fail'}`}>
                  {solvedRoute?.curfew_violations === 0 ? 'OK' : `${solvedRoute?.curfew_violations} BLOCKED`}
                </span>
              </div>
              <div className="constraint-item">
                <div className="constraint-info">
                  <Clock size={14} style={{color: '#6366f1'}} />
                  <span>Customer delivery time slot</span>
                </div>
                <span className={`badge-status ${solvedRoute?.sla_violations === 0 ? 'pass' : 'fail'}`}>
                  {solvedRoute?.sla_violations === 0 ? 'OK' : `${solvedRoute?.sla_violations} LATE`}
                </span>
              </div>
            </div>
          </div>
          
          {/* SIMULATOR TRIGGERS */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem'}}>
            <label style={{fontSize: '0.8rem', color: '#94a3b8'}}>Simulate a Problem (Click to test):</label>
            <button 
              className="btn btn-primary"
              onClick={simulateNewPickup}
              disabled={isSolving || isDriverOffline}
            >
              <Plus size={16} /> Add a Return Package Pickup (Dynamic)
            </button>
            
            {/* Show fail trigger for first uncompleted stop */}
            {solvedRoute && (
              <button 
                className="btn btn-danger"
                disabled={isSolving || solvedRoute.sequence.length === 0}
                onClick={() => {
                  const targetStop = solvedRoute.stops.find(
                    s => !s.stop_id.startsWith('DEPOT') && !driverCompletedStops[s.stop_id]
                  );
                  if (targetStop) {
                    simulateFailedDelivery(targetStop.stop_id, "Customer Unavailable & Closed Premises");
                  } else {
                    alert("No active delivery stops left to fail!");
                  }
                }}
              >
                <AlertTriangle size={16} /> Mark Next Stop as Failed (No-Show / Curfew)
              </button>
            )}
          </div>
        </div>

        {/* PANEL 2: MAP VISUALIZATION & LIVE SEQUENCE TIMELINE */}
        <div className="dashboard-panel map-panel">
          <div className="panel-header">
            <h2 className="panel-title"><Navigation size={18} style={{color: '#00d2ff'}} /> Okhla Area Map View</h2>
            {isSolving && <span style={{fontSize: '0.8rem', color: '#00d2ff', display: 'flex', alignItems: 'center', gap: '0.25rem'}}><RefreshCw size={12} className="animate-spin" /> Calculating new route...</span>}
          </div>

          <div className="map-container-wrapper">
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
            
            {solvedRoute && (
              <div className="map-overlay-kpi">
                <div>Route Number: <span>ROUTE_NCR_01</span></div>
                <div>Delivered Packages: <span>{Object.keys(driverCompletedStops).length} / {solvedRoute.sequence.length}</span></div>
              </div>
            )}
          </div>

          {/* SIMULATION TELEMETRY LOGS */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.75rem'}}>
            <div style={{fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem'}}><FileText size={12} /> Activity Log (What happened):</div>
            {simulationLogs.slice().reverse().map((log, idx) => (
              <div key={idx} style={{color: log.includes('[SIM]') ? '#fbbf24' : log.includes('[Driver]') ? '#00d2ff' : '#94a3b8', fontStyle: log.includes('Offline') ? 'italic' : 'normal'}}>
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* PANEL 3: DRIVER COMPANION APP & ACTIVE STOP SEQUENCE */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title"><User size={18} style={{color: '#10b981'}} /> Driver Phone View (Mobile Screen)</h2>
            <button 
              className={`btn btn-mini ${isDriverOffline ? 'btn-danger' : 'btn-success'}`}
              style={{width: 'auto'}}
              onClick={toggleDriverOffline}
            >
              {isDriverOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
              {isDriverOffline ? 'No Internet' : 'Internet Active'}
            </button>
          </div>

          <div className="driver-preview">
            <div className="driver-phone-bar">
              <span>LTE Signal</span>
              <span>19:30</span>
              <span>84% Battery 🔋</span>
            </div>
            
            {/* Driver Notifications Overlay */}
            {driverNotifications.length > 0 && (
              <div style={{background: 'rgba(99, 102, 241, 0.95)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.75rem', color: '#fff', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', zIndex: 10}}>
                <div style={{fontWeight: 700, display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span>🔔 Route Changed by Office</span>
                  <X size={14} className="cursor-pointer" onClick={() => dismissNotification(driverNotifications[0].id)} />
                </div>
                <div>{driverNotifications[0].msg}</div>
              </div>
            )}

            <div className="driver-app-content">
              {isDriverOffline && (
                <div style={{background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--color-danger)', color: '#ef4444', borderRadius: '8px', padding: '0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600}}>
                  <WifiOff size={14} /> No Internet: Using Saved Route (Offline)
                </div>
              )}
              
              {solvedRoute && (
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.6rem'}}>
                  <div style={{fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8'}}>Stops List (Today's Route)</div>
                  
                  {solvedRoute.stops.map((stop, index) => {
                    const statusInfo = driverCompletedStops[stop.stop_id];
                    const isCompleted = !!statusInfo;
                    const isActive = index === driverCurrentIndex;
                    
                    let cardClass = "driver-route-card";
                    if (isActive) cardClass += " active";
                    
                    let title = "";
                    let subtitle = "";
                    let codAmount = 0;
                    
                    if (stop.stop_id.startsWith('DEPOT_CASH_DROP')) {
                      title = `Go to Office: Deposit Collected Cash`;
                      subtitle = `Go back to Okhla office to empty cash bag`;
                    } else {
                      const stopInfo = routeData?.stops[stop.stop_id];
                      title = `Delivery Stop ${stop.stop_id}`;
                      subtitle = stopInfo ? `Area: ${stopInfo.zone_name} | Time Window: ${stopInfo.time_window.start} to ${stopInfo.time_window.end}` : '';
                      codAmount = stopInfo ? stopInfo.cod_total : 0;
                    }

                    return (
                      <div key={index} className={cardClass}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                            <span style={{fontWeight: 700}}>{index + 1}. {title.length > 22 ? title.substring(0, 19) + '...' : title}</span>
                            {!isCompleted && !stop.stop_id.startsWith('DEPOT_CASH_DROP') && (
                              <div style={{display: 'flex', gap: '0.2rem'}}>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleMoveStop(index, 'up'); }}
                                  disabled={index === 0 || solvedRoute.stops[index-1].stop_id.startsWith('DEPOT')}
                                  style={{padding: '2px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '9px'}}
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleMoveStop(index, 'down'); }}
                                  disabled={index === solvedRoute.stops.length - 1 || solvedRoute.stops[index+1].stop_id.startsWith('DEPOT')}
                                  style={{padding: '2px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '9px'}}
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                              </div>
                            )}
                          </div>
                          {isCompleted ? (
                            <span style={{color: statusInfo.status === 'DELIVERED' ? '#10b981' : '#ef4444', fontWeight: 700}}>
                              {statusInfo.status === 'DELIVERED' ? 'DELIVERED' : 'FAILED'} {statusInfo.synced ? '' : '☁️'}
                            </span>
                          ) : (
                            isActive && <span style={{color: '#6366f1', fontWeight: 700}}>NEXT STOP</span>
                          )}
                        </div>
                        <div style={{color: '#94a3b8', fontSize: '0.65rem'}}>{subtitle}</div>
                        <div>ETA: <b>{stop.arrival_time}</b></div>
                        {codAmount > 0 && <div style={{color: '#10b981', fontWeight: 600}}>COD: ₹{codAmount.toLocaleString()}</div>}
                        
                        {isActive && !isCompleted && (
                          <div className="driver-route-actions">
                            <button 
                              className="btn btn-success btn-mini" 
                              onClick={() => markStopStatus(stop.stop_id, 'DELIVERED')}
                            >
                              <Check size={10} /> Done (Delivered)
                            </button>
                            <button 
                              className="btn btn-danger btn-mini" 
                              onClick={() => markStopStatus(stop.stop_id, 'FAILED')}
                            >
                              <X size={10} /> Failed (Not Delivered)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* SUPERVISOR APPROVAL DRAWER */}
      {pendingReplan && (
        <div className="supervisor-drawer">
          <div className="drawer-details">
            <h3 className="drawer-title">
              <ShieldAlert size={22} style={{color: '#fbbf24'}} />
              Supervisor Panel: Confirm Route Changes
            </h3>
            
            <div className="drawer-explanation">
              <strong>Event:</strong> {pendingReplan.event_type === 'NEW_PICKUP' ? 'New Package Return Request' : `Failed Delivery at Stop ${pendingReplan.event_data.stop_id}`} <br/>
              <strong>Why the route changed:</strong> <br/>
              {pendingReplan.explanation}
            </div>

            <div style={{display: 'flex', gap: '2rem', fontSize: '0.8rem', marginTop: '0.25rem'}}>
              <div>
                Old Cost: <span style={{textDecoration: 'line-through', color: '#64748b'}}>₹{solvedRoute.cost_rupees.toLocaleString()}</span>
              </div>
              <div>
                New Cost: <span style={{color: '#00d2ff', fontWeight: 700}}>₹{pendingReplan.evaluation.cost_rupees.toLocaleString()}</span>
              </div>
              <div>
                Distance change: <span style={{color: pendingReplan.evaluation.total_distance_km > solvedRoute.total_distance_km ? '#ef4444' : '#10b981', fontWeight: 700}}>
                  {(pendingReplan.evaluation.total_distance_km - solvedRoute.total_distance_km).toFixed(2)} km
                </span>
              </div>
              <div>
                Rules saved: <span style={{color: '#10b981', fontWeight: 700}}>
                  {solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations - 
                  (pendingReplan.evaluation.sla_violations + pendingReplan.evaluation.cod_violations + pendingReplan.evaluation.curfew_violations)}
                </span>
              </div>
            </div>
          </div>

          <div className="drawer-actions">
            <button className="btn btn-primary" onClick={approveReplan}>
              Approve & Send to Driver's Phone
            </button>
            <button className="btn btn-secondary" onClick={declineReplan}>
              Cancel Changes
            </button>
          </div>
        </div>
      )}

      {/* MODAL / CONFIRMATION FOR RESET */}
      {showConfirmReset && (
        <div style={{position: 'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.8)', zIndex: 9999, display:'flex', justifyContent:'center', alignItems:'center'}}>
          <div style={{background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'16px', padding:'2rem', maxWidth:'400px', display:'flex', flexDirection:'column', gap:'1.5rem', textAlign:'center'}}>
            <h3 style={{fontSize: '1.25rem', fontWeight: 800}}>Reset and Start Over?</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>This will reset all data, clear driver progress, and restart the simulation.</p>
            <div style={{display:'flex', gap:'1rem'}}>
              <button className="btn btn-primary" onClick={resetEntireSimulation}>Start Over</button>
              <button className="btn btn-secondary" onClick={() => setShowConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR ADDING CUSTOM STOP VIA MAP CLICK */}
      {showAddStopModal && clickedCoords && (
        <div style={{position: 'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.5)', zIndex: 9999, display:'flex', justifyContent:'center', alignItems:'center'}}>
          <div style={{background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'16px', padding:'1.5rem 2rem', maxWidth:'420px', display:'flex', flexDirection:'column', gap:'1.2rem', color: 'var(--text-main)'}}>
            <h3 style={{fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)'}}>📍 Add Custom Stop Here?</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>You clicked on: <br/><b>Latitude:</b> {clickedCoords.lat.toFixed(6)} <br/><b>Longitude:</b> {clickedCoords.lng.toFixed(6)}</p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem'}}>
              <label>COD Cash to collect (INR):</label>
              <input 
                type="number" 
                value={customStopCOD}
                onChange={(e) => setCustomStopCOD(e.target.value)}
                style={{padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)'}}
              />
            </div>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem'}}>
              <label>Delivery Time Slot:</label>
              <select 
                value={customStopWindow} 
                onChange={(e) => setCustomStopWindow(e.target.value)}
                style={{padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)'}}
              >
                <option value="09:00:00-13:00:00">Morning (09:00 AM - 01:00 PM)</option>
                <option value="13:00:00-17:00:00">Afternoon (01:00 PM - 05:00 PM)</option>
                <option value="09:00:00-19:00:00">All Day (09:00 AM - 07:00 PM)</option>
              </select>
            </div>

            <div style={{display:'flex', gap:'1rem', marginTop: '0.5rem'}}>
              <button className="btn btn-primary" onClick={handleAddCustomStop}>Add Stop to Route</button>
              <button className="btn btn-secondary" onClick={() => { setShowAddStopModal(false); setClickedCoords(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
