import React, { useMemo } from 'react'

// Matches firmware p_wave_class_t enum exactly
const ML_CLASSES = {
  0: { label: 'Normal P-Wave', color: '#00e676', icon: '✓' },
  1: { label: 'Peaked P-Wave', color: '#ff9100', icon: '↑' },
  2: { label: 'Bifid P-Wave', color: '#ffc107', icon: '≈' },
  3: { label: 'Inverted P-Wave', color: '#e040fb', icon: '↓' },
  4: { label: 'P-Wave Absent', color: '#ff1744', icon: '−' },
  5: { label: 'AFib Pattern', color: '#ff1744', icon: '!' }
}

export default function AIStatus({ pWaveAnalysis }) {
  const classInfo = useMemo(() => {
    return ML_CLASSES[pWaveAnalysis.mlClass] || ML_CLASSES[0]
  }, [pWaveAnalysis.mlClass])

  const confidencePct = pWaveAnalysis.mlConfidence || 0
  const confidenceRadius = 36
  const confidenceCircumference = 2 * Math.PI * confidenceRadius
  const confidenceOffset = confidenceCircumference * (1 - confidencePct / 100)

  return (
    <div className="card ai-status-card">
      <div className="card-header">
        <span className="card-icon ai-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </span>
        <h3>AI Classification</h3>
        {pWaveAnalysis.mlDataCollection ? (
          <span className="ml-badge collecting">DATA COLLECT</span>
        ) : (
          <span className="ml-badge inference">INFERENCE</span>
        )}
      </div>
      <div className="card-body ai-body">
        <div className="ai-classification">
          <div className="ai-confidence-ring">
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle
                cx="45" cy="45" r={confidenceRadius}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="6"
              />
              <circle
                cx="45" cy="45" r={confidenceRadius}
                fill="none"
                stroke={classInfo.color}
                strokeWidth="6"
                strokeDasharray={confidenceCircumference}
                strokeDashoffset={confidenceOffset}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
              <text x="45" y="42" textAnchor="middle" fill="white" fontSize="16" fontWeight="700">
                {confidencePct}%
              </text>
              <text x="45" y="56" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">
                confidence
              </text>
            </svg>
          </div>

          <div className="ai-result">
            <div className="ai-class-label" style={{ color: classInfo.color }}>
              <span className="ai-class-icon">{classInfo.icon}</span>
              {classInfo.label}
            </div>
            <div className="ai-class-id">Class {pWaveAnalysis.mlClass}</div>
          </div>
        </div>

        <div className="pwave-metrics">
          <div className="pwave-metric">
            <span className="pwave-metric-label">Crossings</span>
            <span className="pwave-metric-value">{pWaveAnalysis.crossings}</span>
          </div>
          <div className="pwave-metric">
            <span className="pwave-metric-label">Normal</span>
            <span className="pwave-metric-value pwave-ok">{pWaveAnalysis.ok}</span>
          </div>
          <div className="pwave-metric">
            <span className="pwave-metric-label">Abnormal</span>
            <span className="pwave-metric-value pwave-abnormal">
              {pWaveAnalysis.abnormal}
            </span>
          </div>
        </div>

        <div className="ai-model-info">
          <div className="model-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            <span>On-Device ML | Pan-Tompkins + P-Wave</span>
          </div>
        </div>
      </div>
    </div>
  )
}
