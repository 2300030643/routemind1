import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function SupervisorDrawer({
  pendingReplan,
  solvedRoute,
  onApprove,
  onDecline
}) {
  if (!pendingReplan) return null;

  return (
    <div className="supervisor-drawer">
      <div className="drawer-details">
        <h3 className="drawer-title">
          <ShieldAlert size={22} style={{ color: '#fbbf24' }} />
          Supervisor Panel: Confirm Route Changes
        </h3>
        
        <div className="drawer-explanation">
          <strong>Event:</strong> {pendingReplan.event_type === 'NEW_PICKUP' ? 'New Package Return Request' : `Failed Delivery at Stop ${pendingReplan.event_data.stop_id}`} <br/>
          <strong>Why the route changed:</strong> <br/>
          {pendingReplan.explanation}
        </div>

        {solvedRoute && (
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            <div>
              Old Cost: <span style={{ textDecoration: 'line-through', color: '#64748b' }}>₹{solvedRoute.cost_rupees.toLocaleString()}</span>
            </div>
            <div>
              New Cost: <span style={{ color: '#00d2ff', fontWeight: 700 }}>₹{pendingReplan.evaluation.cost_rupees.toLocaleString()}</span>
            </div>
            <div>
              Distance change: <span style={{ color: pendingReplan.evaluation.total_distance_km > solvedRoute.total_distance_km ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                {(pendingReplan.evaluation.total_distance_km - solvedRoute.total_distance_km).toFixed(2)} km
              </span>
            </div>
            <div>
              Rules saved: <span style={{ color: '#10b981', fontWeight: 700 }}>
                {solvedRoute.sla_violations + solvedRoute.cod_violations + solvedRoute.curfew_violations - 
                (pendingReplan.evaluation.sla_violations + pendingReplan.evaluation.cod_violations + pendingReplan.evaluation.curfew_violations)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="drawer-actions">
        <button className="btn btn-primary" onClick={onApprove}>
          Approve & Send to Driver's Phone
        </button>
        <button className="btn btn-secondary" onClick={onDecline}>
          Cancel Changes
        </button>
      </div>
    </div>
  );
}
