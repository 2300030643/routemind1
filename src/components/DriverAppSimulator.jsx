import React from 'react';
import { 
  User, 
  Wifi, 
  WifiOff, 
  X, 
  Check 
} from 'lucide-react';

export default function DriverAppSimulator({
  solvedRoute,
  routeData,
  driverCurrentIndex,
  driverCompletedStops,
  isDriverOffline,
  driverNotifications,
  onToggleOffline,
  onDismissNotification,
  onMarkStopStatus,
  onMoveStop
}) {
  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <User size={18} style={{ color: '#10b981' }} /> Driver Phone View (Mobile Screen)
        </h2>
        <button 
          className={`btn btn-mini ${isDriverOffline ? 'btn-danger' : 'btn-success'}`}
          style={{ width: 'auto' }}
          onClick={onToggleOffline}
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
          <div style={{
            background: 'rgba(99, 102, 241, 0.95)',
            padding: '0.75rem',
            borderRadius: '10px',
            fontSize: '0.75rem',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            zIndex: 10
          }}>
            <div style={{
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>🔔 Route Changed by Office</span>
              <X 
                size={14} 
                className="cursor-pointer" 
                onClick={() => onDismissNotification(driverNotifications[0].id)} 
              />
            </div>
            <div>{driverNotifications[0].msg}</div>
          </div>
        )}

        <div className="driver-app-content">
          {isDriverOffline && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--color-danger)',
              color: '#ef4444',
              borderRadius: '8px',
              padding: '0.5rem',
              fontSize: '0.7rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600
            }}>
              <WifiOff size={14} /> No Internet: Using Saved Route (Offline)
            </div>
          )}
          
          {solvedRoute && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8' }}>Stops List (Today's Route)</div>
              
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
                  subtitle = stopInfo ? `Area: ${stopInfo.zone_name} | Time: ${stopInfo.time_window.start} to ${stopInfo.time_window.end}` : '';
                  codAmount = stopInfo ? stopInfo.cod_total : 0;
                }

                return (
                  <div key={index} className={cardClass}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 700 }}>
                          {index + 1}. {title.length > 22 ? title.substring(0, 19) + '...' : title}
                        </span>
                        {!isCompleted && !stop.stop_id.startsWith('DEPOT_CASH_DROP') && (
                          <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onMoveStop(index, 'up'); }}
                              disabled={index === 0 || solvedRoute.stops[index - 1].stop_id.startsWith('DEPOT')}
                              style={{
                                padding: '2px 4px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '4px',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '9px'
                              }}
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onMoveStop(index, 'down'); }}
                              disabled={index === solvedRoute.stops.length - 1 || solvedRoute.stops[index + 1].stop_id.startsWith('DEPOT')}
                              style={{
                                padding: '2px 4px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '4px',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '9px'
                              }}
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        )}
                      </div>
                      {isCompleted ? (
                        <span style={{ color: statusInfo.status === 'DELIVERED' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                          {statusInfo.status === 'DELIVERED' ? 'DELIVERED' : 'FAILED'} {statusInfo.synced ? '' : '☁️'}
                        </span>
                      ) : (
                        isActive && <span style={{ color: '#6366f1', fontWeight: 700 }}>NEXT STOP</span>
                      )}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{subtitle}</div>
                    <div>ETA: <b>{stop.arrival_time}</b></div>
                    {codAmount > 0 && <div style={{ color: '#10b981', fontWeight: 600 }}>COD: ₹{codAmount.toLocaleString()}</div>}
                    
                    {isActive && !isCompleted && (
                      <div className="driver-route-actions">
                        <button 
                          className="btn btn-success btn-mini" 
                          onClick={() => onMarkStopStatus(stop.stop_id, 'DELIVERED')}
                        >
                          <Check size={10} /> Done (Delivered)
                        </button>
                        <button 
                          className="btn btn-danger btn-mini" 
                          onClick={() => onMarkStopStatus(stop.stop_id, 'FAILED')}
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
  );
}
