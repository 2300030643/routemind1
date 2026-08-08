import React from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  ShieldAlert, 
  Clock, 
  Plus, 
  AlertTriangle 
} from 'lucide-react';

export default function KpiSummary({ 
  solvedRoute, 
  comparison, 
  activeSolver, 
  isSolving, 
  isDriverOffline, 
  driverCompletedStops, 
  onSolverChange, 
  onSimulatePickup, 
  onSimulateFail 
}) {
  const getNextStopIdToFail = () => {
    if (!solvedRoute) return null;
    const targetStop = solvedRoute.stops.find(
      s => !s.stop_id.startsWith('DEPOT') && !driverCompletedStops[s.stop_id]
    );
    return targetStop ? targetStop.stop_id : null;
  };

  const nextStopId = getNextStopIdToFail();

  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <TrendingUp size={18} style={{ color: '#6366f1' }} /> Route Planner (Pick a Plan)
        </h2>
      </div>
      
      <div className="control-group">
        <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Choose how to plan the route:</label>
        <div className="solver-select-group">
          <button 
            className={`solver-btn ${activeSolver === 'naive' ? 'active' : ''}`}
            onClick={() => onSolverChange('naive')}
          >
            Old Way (Distance Only)
          </button>
          <button 
            className={`solver-btn ${activeSolver === 'ortools' ? 'active' : ''}`}
            onClick={() => onSolverChange('ortools')}
          >
            Standard Computer Plan
          </button>
          <button 
            className={`solver-btn ${activeSolver === 'routemind' ? 'active' : ''}`}
            onClick={() => onSolverChange('routemind')}
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
            <span 
              className={`kpi-value ${solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
              style={{ color: solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations > 0 ? '#ef4444' : '#10b981' }}
            >
              {solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations}
            </span>
          </div>
        </div>
      )}

      {/* Solver Comparison Chart Widget */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Cost Comparison (Lower is Cheaper):</label>
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
                <span className="comparison-label">
                  {s === 'naive' ? 'Old Way' : s === 'ortools' ? 'Standard' : 'RouteMind'}
                </span>
                <div className="comparison-bar-container">
                  <div className={`comparison-bar ${s}`} style={{ width: `${widthPercent}%` }}></div>
                </div>
                <span className="comparison-value">₹{Math.round(cost)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Indian Constraint Tracker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
        <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Safety & Money Rules Status:</label>
        <div className="constraint-list">
          <div className="constraint-item">
            <div className="constraint-info">
              <DollarSign size={14} style={{ color: '#10b981' }} />
              <span>Cash carry limit (Max ₹50,000)</span>
            </div>
            <span className={`badge-status ${solvedRoute?.cod_violations === 0 ? 'pass' : 'fail'}`}>
              {solvedRoute?.cod_violations === 0 ? 'OK' : `${solvedRoute?.cod_violations} TOO HIGH`}
            </span>
          </div>
          <div className="constraint-item">
            <div className="constraint-info">
              <ShieldAlert size={14} style={{ color: '#fbbf24' }} />
              <span>CP No-Entry peak timing</span>
            </div>
            <span className={`badge-status ${solvedRoute?.curfew_violations === 0 ? 'pass' : 'fail'}`}>
              {solvedRoute?.curfew_violations === 0 ? 'OK' : `${solvedRoute?.curfew_violations} BLOCKED`}
            </span>
          </div>
          <div className="constraint-item">
            <div className="constraint-info">
              <Clock size={14} style={{ color: '#6366f1' }} />
              <span>Customer delivery time slot</span>
            </div>
            <span className={`badge-status ${solvedRoute?.sla_violations === 0 ? 'pass' : 'fail'}`}>
              {solvedRoute?.sla_violations === 0 ? 'OK' : `${solvedRoute?.sla_violations} LATE`}
            </span>
          </div>
        </div>
      </div>
      
      {/* SIMULATOR TRIGGERS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
        <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Simulate a Problem (Click to test):</label>
        <button 
          className="btn btn-primary"
          onClick={onSimulatePickup}
          disabled={isSolving || isDriverOffline}
        >
          <Plus size={16} /> Add a Return Package Pickup (Dynamic)
        </button>
        
        {solvedRoute && (
          <button 
            className="btn btn-danger"
            disabled={isSolving || !nextStopId}
            onClick={() => onSimulateFail(nextStopId, "Customer Unavailable & Closed Premises")}
          >
            <AlertTriangle size={16} /> Mark Next Stop as Failed (No-Show / Curfew)
          </button>
        )}
      </div>
    </div>
  );
}
