import React, { useState, useEffect } from 'react'

export default function Header({
  isConnected,
  isDemo,
  mode,
  onModeSwitch,
  onConnect,
  onDisconnect,
  onToggleSidebar,
  sidebarOpen
}) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="header">
      <div className="header-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar} title="Toggle panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </>
            )}
          </svg>
        </button>
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="rgba(0, 229, 255, 0.1)" stroke="rgba(0, 229, 255, 0.3)" strokeWidth="1"/>
            <path d="M4 16 L8 16 L10 10 L13 22 L16 8 L19 24 L22 12 L24 16 L28 16"
              stroke="#00e5ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <div className="logo-text">
            <h1>ECG Clinical Monitor</h1>
            <span className="logo-subtitle">ATSAME54 | Pan-Tompkins | ML P-Wave</span>
          </div>
        </div>
      </div>

      <div className="header-center">
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'demo' ? 'active' : ''}`}
            onClick={() => onModeSwitch('demo')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            Demo
          </button>
          <button
            className={`mode-btn ${mode === 'live' ? 'active' : ''}`}
            onClick={() => onModeSwitch('live')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            Live
          </button>
        </div>

        <div className="header-badges">
          <span className="badge badge-info">Lead II</span>
          <span className="badge badge-info">1000 Hz</span>
          {isDemo && <span className="badge badge-demo">DEMO</span>}
          {isConnected && mode === 'live' && <span className="badge badge-live">LIVE</span>}
        </div>
      </div>

      <div className="header-right">
        <div className="clock">
          <span className="clock-time">{time.toLocaleTimeString()}</span>
          <span className="clock-date">{time.toLocaleDateString()}</span>
        </div>

        <button
          className={`connect-btn ${isConnected ? 'connected' : ''}`}
          onClick={isConnected ? onDisconnect : onConnect}
        >
          <span className={`status-dot ${isConnected ? 'active' : ''}`} />
          {isConnected ? 'Disconnect' : 'Connect Device'}
        </button>
      </div>
    </header>
  )
}
