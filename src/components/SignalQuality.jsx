import React, { useMemo } from 'react'

export default function SignalQuality({ quality, rawPacket }) {
  const qualityInfo = useMemo(() => {
    if (quality >= 90) return { label: 'Excellent', color: '#00e676', bars: 5 }
    if (quality >= 75) return { label: 'Good', color: '#76ff03', bars: 4 }
    if (quality >= 50) return { label: 'Fair', color: '#ffc107', bars: 3 }
    if (quality >= 25) return { label: 'Poor', color: '#ff9100', bars: 2 }
    return { label: 'Very Poor', color: '#ff1744', bars: 1 }
  }, [quality])

  const signalStats = useMemo(() => {
    if (!rawPacket) return null
    return {
      raw: rawPacket.new_ecg_sample,
      filtered: rawPacket.lp_FIR_sample,
      offset: rawPacket.new_ecg_sample_offset_corrected,
      mV: (rawPacket.mV_Conversion / 100).toFixed(1),
      integrated: rawPacket.integrated_sample,
      threshold: rawPacket.pt_threshold_signal
    }
  }, [rawPacket])

  return (
    <div className="card signal-quality-card">
      <div className="card-header">
        <span className="card-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 20h.01"/>
            <path d="M7 20v-4"/>
            <path d="M12 20v-8"/>
            <path d="M17 20V8"/>
            <path d="M22 4v16"/>
          </svg>
        </span>
        <h3>Signal Quality</h3>
      </div>
      <div className="card-body">
        <div className="quality-display">
          <div className="quality-bars">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`quality-bar ${i <= qualityInfo.bars ? 'active' : ''}`}
                style={{
                  height: `${i * 8 + 8}px`,
                  backgroundColor: i <= qualityInfo.bars ? qualityInfo.color : 'rgba(255,255,255,0.08)'
                }}
              />
            ))}
          </div>
          <div className="quality-info">
            <span className="quality-pct" style={{ color: qualityInfo.color }}>
              {quality}%
            </span>
            <span className="quality-label">{qualityInfo.label}</span>
          </div>
        </div>

        {signalStats && (
          <div className="signal-stats">
            <div className="stat-row">
              <span className="stat-label">Raw ADC</span>
              <span className="stat-value">{signalStats.raw}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Filtered</span>
              <span className="stat-value">{signalStats.filtered}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Voltage</span>
              <span className="stat-value">{signalStats.mV} mV</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">MWI Output</span>
              <span className="stat-value">{signalStats.integrated}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">PT Threshold</span>
              <span className="stat-value">{signalStats.threshold}</span>
            </div>
          </div>
        )}

        <div className="signal-pipeline">
          <div className="pipeline-label">Signal Pipeline</div>
          <div className="pipeline-flow">
            <span className="pipeline-node">ADC</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node">Offset</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node">FIR</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node">Diff</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node">Sq</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node">MWI</span>
            <span className="pipeline-arrow">→</span>
            <span className="pipeline-node active">QRS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
