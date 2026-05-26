import React from 'react'

const CONDITION_COLORS = {
  'Normal Sinus': '#00e676',
  'Atrial Fibrillation': '#ff1744',
  'Sinus Tachycardia': '#ff9100',
  'Noisy Signal (60Hz)': '#ffc107',
  'Muscle Artifact': '#ffc107',
  'Variable Rhythm': '#e040fb',
  'Irregular Rhythm': '#e040fb',
  'Premature Beats': '#ff9100'
}

export default function DemoPanel({
  samples,
  activeSampleId,
  isPlaying,
  onSelectSample,
  onPlay,
  onPause,
  onStop
}) {
  return (
    <div className="demo-panel">
      <div className="demo-header">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Patient Waveforms
        </h3>
        <div className="demo-controls">
          {!isPlaying ? (
            <button className="demo-play-btn" onClick={onPlay} title="Play">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </button>
          ) : (
            <button className="demo-pause-btn" onClick={onPause} title="Pause">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            </button>
          )}
          <button className="demo-stop-btn" onClick={onStop} title="Stop">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="demo-list">
        {samples.map(s => {
          const condColor = CONDITION_COLORS[s.condition] || '#00e5ff'
          return (
            <button
              key={s.id}
              className={`demo-item ${activeSampleId === s.id ? 'active' : ''}`}
              onClick={() => onSelectSample(s.id)}
              title={s.description}
            >
              <span className="demo-item-avatar">
                {s.name.split(' ')[1]}
              </span>
              <span className="demo-item-details">
                <span className="demo-item-name">{s.name}</span>
                <span className="demo-item-condition" style={{ color: condColor }}>
                  {s.condition}
                </span>
              </span>
              <span className="demo-item-meta">
                <span className="demo-item-bpm">{s.bpm} bpm</span>
                <span className="demo-item-duration">
                  {(s.data.length / 1000).toFixed(1)}s
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="demo-info">
        <span className="demo-info-text">
          Pre-recorded ECG data · 1000 Hz · Loops continuously
        </span>
      </div>
    </div>
  )
}
