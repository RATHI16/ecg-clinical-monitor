import React, { useState } from 'react'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatFileSize(samples) {
  const bytes = samples * 10
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function RecordingPanel({
  activePatient,
  recordings,
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onDeleteRecording,
  onExportCSV,
  onExportJSON,
  onExportAll
}) {
  const [label, setLabel] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const handleStart = () => {
    onStartRecording(label || undefined)
    setLabel('')
  }

  return (
    <div className="recording-panel">
      <div className="rp-header">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
          Recordings
        </h3>
        {activePatient && recordings.length > 0 && (
          <button className="rp-export-all-btn" onClick={onExportAll} title="Export all recordings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export All
          </button>
        )}
      </div>

      {activePatient ? (
        <>
          <div className="rp-controls">
            {!isRecording ? (
              <div className="rp-start-group">
                <input
                  type="text"
                  className="rp-label-input"
                  placeholder="Recording label (optional)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                />
                <button className="rp-record-btn" onClick={handleStart}>
                  <span className="rp-record-dot" />
                  Record
                </button>
              </div>
            ) : (
              <div className="rp-active-recording">
                <div className="rp-recording-indicator">
                  <span className="rp-recording-dot" />
                  <span className="rp-recording-label">Recording</span>
                  <span className="rp-recording-time">{formatDuration(recordingDuration)}</span>
                </div>
                <button className="rp-stop-btn" onClick={onStopRecording}>
                  <span className="rp-stop-square" />
                  Stop
                </button>
              </div>
            )}
          </div>

          <div className="rp-list">
            {recordings.length === 0 && !isRecording && (
              <div className="rp-empty">No recordings yet for this patient</div>
            )}
            {recordings.map(rec => (
              <div key={rec.id} className="rp-item">
                <div
                  className="rp-item-main"
                  onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                >
                  <div className="rp-item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
                    </svg>
                  </div>
                  <div className="rp-item-info">
                    <span className="rp-item-label">{rec.label}</span>
                    <span className="rp-item-meta">
                      {formatDate(rec.timestamp)} · {formatDuration(Math.floor(rec.duration / 1000))} · {rec.totalSamples.toLocaleString()} samples
                    </span>
                  </div>
                  <span className="rp-item-size">{formatFileSize(rec.totalSamples)}</span>
                </div>

                {expandedId === rec.id && (
                  <div className="rp-item-actions">
                    <button
                      className="rp-action-btn export-csv"
                      onClick={() => onExportCSV(rec.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                      </svg>
                      CSV
                    </button>
                    <button
                      className="rp-action-btn export-json"
                      onClick={() => onExportJSON(rec.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                      </svg>
                      JSON
                    </button>
                    <button
                      className="rp-action-btn delete"
                      onClick={() => onDeleteRecording(rec.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rp-no-patient">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Select a patient to start recording</span>
        </div>
      )}
    </div>
  )
}
