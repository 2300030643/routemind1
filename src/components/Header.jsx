import React from 'react';
import { Truck } from 'lucide-react';

export default function Header({ apiCostLog, isDriverOffline, onStartOverClick }) {
  return (
    <header>
      <div className="brand-section">
        <Truck className="text-indigo-500" size={28} style={{ color: '#6366f1' }} />
        <div>
          <h1 className="brand-logo">RouteMind</h1>
          <div style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '-2px' }}>
            SIMPLE ROUTE PLANNING FOR DELIVERY PARTNERS
          </div>
        </div>
        <span className="brand-tag">Last-Mile Plan</span>
      </div>

      <div className="system-status">
        <div className="status-indicator">
          <span>System Route Fee:</span>
          <span style={{ color: '#00d2ff', fontWeight: 700 }}>₹{apiCostLog.toFixed(3)}</span>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${isDriverOffline ? 'offline' : 'online'}`}></span>
          <span>Driver's Phone connection: <b>{isDriverOffline ? 'DISCONNECTED (NO NET)' : 'CONNECTED (OK)'}</b></span>
        </div>
        <button className="btn btn-secondary btn-mini" style={{ width: 'auto' }} onClick={onStartOverClick}>
          Start Over
        </button>
      </div>
    </header>
  );
}
