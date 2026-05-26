import React from 'react'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function PatientCard({ isConnected, activePatient, isRecording, recordingDuration }) {
  return (
    <div className="card patient-card">
      <div className="card-header">
        <span className="card-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
        <h3>Patient Info</h3>
        {isRecording && (
          <span className="recording-badge">
            <span className="rec-dot" />
            REC {formatDuration(recordingDuration)}
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="patient-info-grid">
          <div className="patient-field">
            <label>Name</label>
            <span>{activePatient?.name || 'No patient selected'}</span>
          </div>
          <div className="patient-field">
            <label>ID</label>
            <span>{activePatient?.id?.slice(0, 8) || '--'}</span>
          </div>
          <div className="patient-field">
            <label>Age / Gender</label>
            <span>
              {activePatient ? `${activePatient.age || '--'}${activePatient.gender ? ' / ' + activePatient.gender : ''}` : '--'}
            </span>
          </div>
          <div className="patient-field">
            <label>Status</label>
            <span className={`status-tag ${isRecording ? 'recording' : isConnected ? 'active' : 'inactive'}`}>
              {isRecording ? 'Recording' : isConnected ? 'Live Monitor' : 'Standby'}
            </span>
          </div>
        </div>

        {activePatient?.notes && (
          <div className="patient-notes">
            <label>Notes</label>
            <span>{activePatient.notes}</span>
          </div>
        )}

        <div className="device-info">
          <div className="device-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <rect x="9" y="9" width="6" height="6"/>
              <line x1="9" y1="1" x2="9" y2="4"/>
              <line x1="15" y1="1" x2="15" y2="4"/>
              <line x1="9" y1="20" x2="9" y2="23"/>
              <line x1="15" y1="20" x2="15" y2="23"/>
              <line x1="20" y1="9" x2="23" y2="9"/>
              <line x1="20" y1="14" x2="23" y2="14"/>
              <line x1="1" y1="9" x2="4" y2="9"/>
              <line x1="1" y1="14" x2="4" y2="14"/>
            </svg>
            <span>ATSAME54P20A</span>
          </div>
          <div className="device-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
            </svg>
            <span>Microchip AFE</span>
          </div>
        </div>
      </div>
    </div>
  )
}
