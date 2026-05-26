import React, { useState, useEffect, useRef } from 'react'

export default function MetricsPanel({ metrics }) {
  const [pulseAnim, setPulseAnim] = useState(false)
  const prevBpmState = useRef(metrics.bpmState)

  useEffect(() => {
    if (metrics.bpmState !== prevBpmState.current && metrics.bpmState === 1) {
      setPulseAnim(true)
      const timer = setTimeout(() => setPulseAnim(false), 300)
      prevBpmState.current = metrics.bpmState
      return () => clearTimeout(timer)
    }
    prevBpmState.current = metrics.bpmState
  }, [metrics.bpmState])

  const getBPMStatus = (bpm) => {
    if (bpm === 0) return { label: 'NO SIGNAL', class: 'status-none' }
    if (bpm < 60) return { label: 'BRADYCARDIA', class: 'status-warning' }
    if (bpm > 100) return { label: 'TACHYCARDIA', class: 'status-danger' }
    return { label: 'NORMAL SINUS', class: 'status-normal' }
  }

  const status = getBPMStatus(metrics.bpm)

  return (
    <div className="card metrics-panel">
      <div className="card-header">
        <span className="card-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </span>
        <h3>Vital Signs</h3>
        <span className={`rhythm-badge ${status.class}`}>{status.label}</span>
      </div>
      <div className="card-body">
        <div className="bpm-display">
          <div className={`bpm-heart ${pulseAnim ? 'pulse' : ''}`}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <div className="bpm-value">
            <span className="bpm-number">{metrics.bpm || '--'}</span>
            <span className="bpm-unit">BPM</span>
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-item">
            <div className="metric-label">Average</div>
            <div className="metric-value">{metrics.bpmAverage || '--'}</div>
            <div className="metric-unit">bpm</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Min</div>
            <div className="metric-value metric-low">{metrics.bpmMin || '--'}</div>
            <div className="metric-unit">bpm</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Max</div>
            <div className="metric-value metric-high">{metrics.bpmMax || '--'}</div>
            <div className="metric-unit">bpm</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">R-R</div>
            <div className="metric-value">{metrics.r2rInterval || '--'}</div>
            <div className="metric-unit">ms</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">QRS Width</div>
            <div className="metric-value">{metrics.qrsWidth || '--'}</div>
            <div className="metric-unit">ms</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">QRS State</div>
            <div className={`metric-value ${metrics.bpmState ? 'metric-active' : ''}`}>
              {metrics.bpmState ? 'DETECT' : 'IDLE'}
            </div>
            <div className="metric-unit">state</div>
          </div>
        </div>
      </div>
    </div>
  )
}
