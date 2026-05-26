import React, { useState } from 'react'

export default function PatientManager({
  patients,
  activePatient,
  onSelectPatient,
  onAddPatient,
  onDeletePatient
}) {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', age: '', gender: '', notes: '' })
  const [confirmDelete, setConfirmDelete] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    await onAddPatient(formData)
    setFormData({ name: '', age: '', gender: '', notes: '' })
    setShowForm(false)
  }

  const handleDelete = async (id) => {
    if (confirmDelete === id) {
      await onDeletePatient(id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  return (
    <div className="patient-manager">
      <div className="pm-header">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Patients
        </h3>
        <button className="pm-add-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? '×' : '+'}
        </button>
      </div>

      {showForm && (
        <form className="pm-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Patient Name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            autoFocus
          />
          <div className="pm-form-row">
            <input
              type="text"
              placeholder="Age"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            />
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            >
              <option value="">Gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
          <button type="submit" className="pm-submit-btn">Add Patient</button>
        </form>
      )}

      <div className="pm-list">
        {patients.length === 0 && (
          <div className="pm-empty">No patients added yet</div>
        )}
        {patients.map(patient => (
          <div
            key={patient.id}
            className={`pm-item ${activePatient?.id === patient.id ? 'active' : ''}`}
            onClick={() => onSelectPatient(patient)}
          >
            <div className="pm-item-avatar">
              {patient.name.charAt(0).toUpperCase()}
            </div>
            <div className="pm-item-info">
              <span className="pm-item-name">{patient.name}</span>
              <span className="pm-item-meta">
                {patient.age && `${patient.age}y`}
                {patient.gender && ` · ${patient.gender}`}
                {patient.notes && ` · ${patient.notes}`}
              </span>
            </div>
            <button
              className={`pm-delete-btn ${confirmDelete === patient.id ? 'confirm' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleDelete(patient.id) }}
              title={confirmDelete === patient.id ? 'Click again to confirm' : 'Delete patient'}
            >
              {confirmDelete === patient.id ? '!!' : '×'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
