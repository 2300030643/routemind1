import React, { useState, useEffect } from 'react';

export default function AddStopModal({
  show,
  clickedCoords,
  customStopCOD,
  customStopWindow,
  setCustomStopCOD,
  setCustomStopWindow,
  onAdd,
  onCancel
}) {
  const [selectedZone, setSelectedZone] = useState('Z3');
  const [validationError, setValidationError] = useState('');

  // 1. Haversine Closest Zone Suggestion Heuristic
  useEffect(() => {
    if (show && clickedCoords) {
      setValidationError('');
      
      const zones = [
        { id: 'Z1', lat: 28.6304, lng: 77.2177 }, // CP
        { id: 'Z2', lat: 28.5244, lng: 77.2066 }, // Saket
        { id: 'Z3', lat: 28.5889, lng: 77.0578 }  // Dwarka
      ];
      
      let minDistance = Infinity;
      let closestZoneId = 'Z3';
      
      const R = 6371; // Earth radius in km
      zones.forEach(z => {
        const dLat = ((z.lat - clickedCoords.lat) * Math.PI) / 180;
        const dLng = ((z.lng - clickedCoords.lng) * Math.PI) / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(clickedCoords.lat * Math.PI / 180) * 
          Math.cos(z.lat * Math.PI / 180) * 
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;
        
        if (dist < minDistance) {
          minDistance = dist;
          closestZoneId = z.id;
        }
      });
      
      setSelectedZone(closestZoneId);
    }
  }, [show, clickedCoords]);

  if (!show || !clickedCoords) return null;

  // 2. Validate input variables
  const handleValidateAndSubmit = () => {
    const codVal = parseFloat(customStopCOD);
    if (isNaN(codVal) || codVal < 0) {
      setValidationError('❌ COD Cash collection must be a positive number or zero.');
      return;
    }
    if (codVal > 50000) {
      setValidationError('⚠️ COD Cash exceeds driver safety limit of ₹50,000!');
      return;
    }
    
    setValidationError('');
    // Trigger callback with values
    onAdd(codVal, customStopWindow, selectedZone);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '1.5rem 2rem',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem',
        color: 'var(--text-main)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)' }}>
          📍 Add Custom Stop Here?
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          You clicked on: <br />
          <b>Latitude:</b> {clickedCoords.lat.toFixed(6)} <br />
          <b>Longitude:</b> {clickedCoords.lng.toFixed(6)}
        </p>

        {validationError && (
          <div style={{
            fontSize: '0.75rem',
            color: '#ef4444',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            padding: '0.5rem',
            borderRadius: '6px',
            fontWeight: 600
          }}>
            {validationError}
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <label>COD Cash to collect (INR):</label>
          <input 
            type="number" 
            value={customStopCOD}
            onChange={(e) => {
              setCustomStopCOD(e.target.value);
              setValidationError('');
            }}
            placeholder="e.g. 5000"
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-main)'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <label>Delivery Time Slot:</label>
          <select 
            value={customStopWindow} 
            onChange={(e) => setCustomStopWindow(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-main)'
            }}
          >
            <option value="09:00:00-13:00:00">Morning (09:00 AM - 01:00 PM)</option>
            <option value="13:00:00-17:00:00">Afternoon (01:00 PM - 05:00 PM)</option>
            <option value="09:00:00-19:00:00">All Day (09:00 AM - 07:00 PM)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <label>Zone Assignment (Suggested Nearest):</label>
          <select 
            value={selectedZone} 
            onChange={(e) => setSelectedZone(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-main)'
            }}
          >
            <option value="Z1">Connaught Place (Z1 - Curfew Zone)</option>
            <option value="Z2">Saket / South Delhi (Z2 - Residential Zone)</option>
            <option value="Z3">Dwarka / West Delhi (Z3 - Suburban Zone)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={handleValidateAndSubmit}>Add Stop to Route</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
