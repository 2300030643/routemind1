import React from 'react';

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
  if (!show || !clickedCoords) return null;

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
        color: 'var(--text-main)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)' }}>
          📍 Add Custom Stop Here?
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          You clicked on: <br />
          <b>Latitude:</b> {clickedCoords.lat.toFixed(6)} <br />
          <b>Longitude:</b> {clickedCoords.lng.toFixed(6)}
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <label>COD Cash to collect (INR):</label>
          <input 
            type="number" 
            value={customStopCOD}
            onChange={(e) => setCustomStopCOD(e.target.value)}
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

        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={onAdd}>Add Stop to Route</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
