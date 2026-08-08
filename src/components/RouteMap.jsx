import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, RefreshCw, FileText, Database, Trash2 } from 'lucide-react';

export default function RouteMap({
  solvedRoute,
  routeData,
  activeSolver,
  driverCurrentIndex,
  driverCompletedStops,
  isAnimating,
  vehicleCoords,
  vehicleBearing,
  isSolving,
  simulationLogs,
  historyLogs,
  onClearHistory,
  onMapClick
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([28.5204, 77.2818], 11);

      // CartoDB Voyager tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(mapRef.current);

      L.control.zoom({ position: 'topright' }).addTo(mapRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);

      // Handle map click events
      mapRef.current.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (onMapClick) {
          onMapClick(lat, lng);
        }
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Draw Route layer whenever routing state updates
  useEffect(() => {
    if (!solvedRoute || !routeData || !layerGroupRef.current || !mapRef.current) return;

    // Clear old layers
    layerGroupRef.current.clearLayers();

    const latlngs = [];
    const depotLoc = [routeData.depot.lat, routeData.depot.lng];
    latlngs.push(depotLoc);

    // Depot custom icon
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
      let stopLoc, stopName, zone, codText, labelText;
      let markerColor = 'delivery';

      if (stop.stop_id.startsWith('DEPOT_CASH_DROP')) {
        stopLoc = depotLoc;
        stopName = `Depot Cash Drop-off (${stop.stop_id})`;
        markerColor = 'cash_drop';
        labelText = '₹';
      } else {
        const stopInfo = routeData.stops[stop.stop_id];
        if (!stopInfo) return;

        stopLoc = [stopInfo.lat, stopInfo.lng];
        stopName = `Stop ${stop.stop_id}`;
        zone = stopInfo.zone_name;
        codText = stopInfo.cod_total > 0 ? `COD Amount: ₹${stopInfo.cod_total}` : 'Prepaid';
        labelText = (index + 1).toString();

        markerColor = 'white';

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

    // Construct sequential coordinates
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

    const activeSegIdx = isAnimating ? driverCurrentIndex - 1 : driverCurrentIndex;

    // 1. Traveled Completed Path
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

    // 2. Active Leg
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

    // 3. Future Path
    if (activeSegIdx < seqCoords.length - 1) {
      const futureCoords = seqCoords.slice(activeSegIdx + 1);
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

    // Fit map bounds to show the entire route on initial load/reset, otherwise pan to active stop
    if (driverCurrentIndex === 0 && !isAnimating) {
      try {
        const bounds = L.latLngBounds(latlngs);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      } catch (e) {
        console.warn("Could not fit map bounds:", e);
      }
    } else {
      try {
        if (driverCurrentIndex >= 0 && driverCurrentIndex < seqCoords.length) {
          const activeLoc = seqCoords[driverCurrentIndex];
          mapRef.current.panTo(activeLoc, { animate: true });
        }
      } catch (e) {
        console.warn("Could not pan map to active stop:", e);
      }
    }

  }, [solvedRoute, routeData, activeSolver, driverCurrentIndex, driverCompletedStops, isAnimating, vehicleCoords, vehicleBearing]);

  return (
    <div className="dashboard-panel map-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <Navigation size={18} style={{ color: '#00d2ff' }} /> Okhla Area Map View
        </h2>
        {isSolving && (
          <span style={{ fontSize: '0.8rem', color: '#00d2ff', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <RefreshCw size={12} className="animate-spin" /> Calculating new route...
          </span>
        )}
      </div>

      <div className="map-container-wrapper">
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        {solvedRoute && (
          <div className="map-overlay-kpi">
            <div>Route Number: <span>ROUTE_NCR_01</span></div>
            <div>Delivered Packages: <span>{Object.keys(driverCompletedStops).length} / {solvedRoute.stops.filter(s => !s.stop_id.startsWith('DEPOT')).length}</span></div>
          </div>
        )}
      </div>

      {/* DUAL TELEMETRY & AUDIT VIEW */}
      <div className="logs-dual-container">
        
        {/* Left: Activity Log */}
        <div className="logs-pane">
          <div className="pane-header">
            <span className="pane-title"><FileText size={12} /> Activity Log (Live console)</span>
          </div>
          <div className="pane-body">
            {simulationLogs && simulationLogs.slice().reverse().map((log, idx) => (
              <div key={idx} style={{
                color: log.includes('[SIM]') ? '#fbbf24' : log.includes('[Driver]') ? '#00d2ff' : '#94a3b8', 
                fontStyle: log.includes('Offline') ? 'italic' : 'normal',
                paddingBottom: '2px'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Persistent Audit DB Logs */}
        <div className="logs-pane">
          <div className="pane-header" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}>
            <span className="pane-title"><Database size={12} /> Audit History (JSON DB)</span>
            {historyLogs && historyLogs.length > 0 && (
              <button 
                onClick={onClearHistory}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f43f5e',
                  cursor: 'pointer',
                  fontSize: '9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: 0
                }}
                title="Clear Database history"
              >
                <Trash2 size={10} /> Clear
              </button>
            )}
          </div>
          <div className="pane-body">
            {historyLogs && historyLogs.length > 0 ? (
              historyLogs.slice().reverse().map((item, idx) => {
                const isFail = item.event_type === 'FAILED_DELIVERY';
                return (
                  <div key={idx} style={{ 
                    borderBottom: '1px solid rgba(255,255,255,0.05)', 
                    paddingBottom: '4px', 
                    marginBottom: '4px',
                    fontSize: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isFail ? '#ef4444' : '#10b981' }}>
                      <b>{isFail ? '❌ Bypassed Stop' : '📍 Added Stop'} {item.stop_id}</b>
                      <span>{item.event_time}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9px', lineHeight: '1.2' }}>{item.explanation}</div>
                    <div style={{ display: 'flex', gap: '8px', color: '#00d2ff', fontSize: '9px', marginTop: '2px' }}>
                      <span>Cost: {item.cost_change_rupees >= 0 ? `+₹${item.cost_change_rupees}` : `-₹${Math.abs(item.cost_change_rupees)}`}</span>
                      <span>Dist: {item.distance_change_km >= 0 ? `+${item.distance_change_km}km` : `-${Math.abs(item.distance_change_km)}km`}</span>
                      {item.violations_saved > 0 && <span style={{ color: '#10b981' }}>Saved: {item.violations_saved} rules</span>}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginTop: '1.5rem' }}>
                No database records. Approve a route change to audit.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
