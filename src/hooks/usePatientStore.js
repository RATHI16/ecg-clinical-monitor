import { useState, useEffect, useCallback, useRef } from 'react'

const DB_NAME = 'ECG_Clinical_DB'
const DB_VERSION = 1
const STORE_PATIENTS = 'patients'
const STORE_RECORDINGS = 'recordings'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains(STORE_PATIENTS)) {
        const patientStore = db.createObjectStore(STORE_PATIENTS, { keyPath: 'id' })
        patientStore.createIndex('name', 'name', { unique: false })
        patientStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        const recordingStore = db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' })
        recordingStore.createIndex('patientId', 'patientId', { unique: false })
        recordingStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function usePatientStore() {
  const [patients, setPatients] = useState([])
  const [activePatient, setActivePatient] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const dbRef = useRef(null)
  const recordBufferRef = useRef(null)
  const recordStartRef = useRef(null)
  const recordTimerRef = useRef(null)

  useEffect(() => {
    openDB().then(db => {
      dbRef.current = db
      loadPatients()
    })
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [])

  const loadPatients = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    const tx = db.transaction(STORE_PATIENTS, 'readonly')
    const store = tx.objectStore(STORE_PATIENTS)
    const request = store.getAll()
    request.onsuccess = () => {
      const sorted = request.result.sort((a, b) => b.createdAt - a.createdAt)
      setPatients(sorted)
    }
  }, [])

  const loadRecordings = useCallback(async (patientId) => {
    const db = dbRef.current
    if (!db) return
    const tx = db.transaction(STORE_RECORDINGS, 'readonly')
    const store = tx.objectStore(STORE_RECORDINGS)
    const index = store.index('patientId')
    const request = index.getAll(patientId)
    request.onsuccess = () => {
      const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp)
      setRecordings(sorted)
    }
  }, [])

  const addPatient = useCallback(async (patientData) => {
    const db = dbRef.current
    if (!db) return null
    const patient = {
      id: generateId(),
      name: patientData.name || 'Unknown',
      age: patientData.age || '',
      gender: patientData.gender || '',
      notes: patientData.notes || '',
      createdAt: Date.now()
    }
    const tx = db.transaction(STORE_PATIENTS, 'readwrite')
    const store = tx.objectStore(STORE_PATIENTS)
    store.add(patient)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    await loadPatients()
    return patient
  }, [loadPatients])

  const deletePatient = useCallback(async (patientId) => {
    const db = dbRef.current
    if (!db) return

    const tx = db.transaction([STORE_PATIENTS, STORE_RECORDINGS], 'readwrite')
    tx.objectStore(STORE_PATIENTS).delete(patientId)

    const recStore = tx.objectStore(STORE_RECORDINGS)
    const index = recStore.index('patientId')
    const request = index.getAllKeys(patientId)
    request.onsuccess = () => {
      request.result.forEach(key => recStore.delete(key))
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })

    if (activePatient?.id === patientId) {
      setActivePatient(null)
      setRecordings([])
    }
    await loadPatients()
  }, [activePatient, loadPatients])

  const selectPatient = useCallback((patient) => {
    setActivePatient(patient)
    if (patient) loadRecordings(patient.id)
    else setRecordings([])
  }, [loadRecordings])

  const startRecording = useCallback((label = '') => {
    if (!activePatient) return false
    recordBufferRef.current = {
      patientId: activePatient.id,
      label: label || `Recording ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      sampleRate: 1000,
      samples: {
        raw: [],
        filtered: [],
        mV: [],
        pWave: [],
        pWaveThreshold: []
      },
      metrics: [],
      pWaveEvents: [],
      mlClassifications: []
    }
    recordStartRef.current = Date.now()
    setIsRecording(true)
    setRecordingDuration(0)
    recordTimerRef.current = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - recordStartRef.current) / 1000))
    }, 1000)
    return true
  }, [activePatient])

  const addRecordingSample = useCallback((packet) => {
    if (!isRecording || !recordBufferRef.current) return
    const buf = recordBufferRef.current
    buf.samples.raw.push(packet.new_ecg_sample)
    buf.samples.filtered.push(packet.lp_FIR_sample)
    buf.samples.mV.push(packet.mV_Conversion)
    buf.samples.pWave.push(packet.p_wave_data)
    buf.samples.pWaveThreshold.push(packet.p_wave_threshold)

    if (packet.bpm_state === 1) {
      buf.metrics.push({
        t: Date.now() - buf.timestamp,
        bpm: packet.bpm,
        r2r: packet.R2R_interval,
        qrsW: packet.qrs_width
      })
    }

    if (packet.ml_p_wave_class > 0 || packet.p_wave_abnormal) {
      buf.pWaveEvents.push({
        t: Date.now() - buf.timestamp,
        class: packet.ml_p_wave_class,
        confidence: packet.ml_confidence,
        crossings: packet.p_wave_crossings,
        abnormal: packet.p_wave_abnormal
      })
    }
  }, [isRecording])

  const stopRecording = useCallback(async () => {
    if (!isRecording || !recordBufferRef.current) return null
    setIsRecording(false)
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }

    const recording = {
      ...recordBufferRef.current,
      id: generateId(),
      duration: Date.now() - recordStartRef.current,
      totalSamples: recordBufferRef.current.samples.raw.length
    }
    recordBufferRef.current = null

    const db = dbRef.current
    if (db) {
      const tx = db.transaction(STORE_RECORDINGS, 'readwrite')
      tx.objectStore(STORE_RECORDINGS).add(recording)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = reject
      })
      if (activePatient) loadRecordings(activePatient.id)
    }

    return recording
  }, [isRecording, activePatient, loadRecordings])

  const deleteRecording = useCallback(async (recordingId) => {
    const db = dbRef.current
    if (!db) return
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite')
    tx.objectStore(STORE_RECORDINGS).delete(recordingId)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    if (activePatient) loadRecordings(activePatient.id)
  }, [activePatient, loadRecordings])

  const getRecording = useCallback(async (recordingId) => {
    const db = dbRef.current
    if (!db) return null
    const tx = db.transaction(STORE_RECORDINGS, 'readonly')
    const request = tx.objectStore(STORE_RECORDINGS).get(recordingId)
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  }, [])

  const exportRecordingCSV = useCallback(async (recordingId) => {
    const recording = await getRecording(recordingId)
    if (!recording) return

    let csv = 'Time_ms,Raw_ADC,Filtered,mV_x100,P_Wave,P_Wave_Threshold\n'
    const sampleInterval = 1000 / recording.sampleRate
    for (let i = 0; i < recording.totalSamples; i++) {
      const t = Math.round(i * sampleInterval)
      csv += `${t},${recording.samples.raw[i]},${recording.samples.filtered[i]},${recording.samples.mV[i]},${recording.samples.pWave[i]},${recording.samples.pWaveThreshold[i]}\n`
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ECG_${activePatient?.name || 'unknown'}_${recording.label}_${new Date(recording.timestamp).toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [getRecording, activePatient])

  const exportRecordingJSON = useCallback(async (recordingId) => {
    const recording = await getRecording(recordingId)
    if (!recording) return

    const exportData = {
      patient: activePatient,
      recording: {
        id: recording.id,
        label: recording.label,
        timestamp: recording.timestamp,
        duration: recording.duration,
        sampleRate: recording.sampleRate,
        totalSamples: recording.totalSamples
      },
      samples: recording.samples,
      metrics: recording.metrics,
      pWaveEvents: recording.pWaveEvents,
      exportedAt: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ECG_${activePatient?.name || 'unknown'}_${recording.label}_${new Date(recording.timestamp).toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [getRecording, activePatient])

  const exportAllPatientData = useCallback(async () => {
    if (!activePatient) return
    const db = dbRef.current
    if (!db) return

    const tx = db.transaction(STORE_RECORDINGS, 'readonly')
    const index = tx.objectStore(STORE_RECORDINGS).index('patientId')
    const request = index.getAll(activePatient.id)

    request.onsuccess = () => {
      const allRecordings = request.result
      const exportData = {
        patient: activePatient,
        recordings: allRecordings.map(r => ({
          id: r.id,
          label: r.label,
          timestamp: r.timestamp,
          duration: r.duration,
          sampleRate: r.sampleRate,
          totalSamples: r.totalSamples,
          samples: r.samples,
          metrics: r.metrics,
          pWaveEvents: r.pWaveEvents
        })),
        exportedAt: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ECG_Patient_${activePatient.name}_AllData_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [activePatient])

  return {
    patients,
    activePatient,
    recordings,
    isRecording,
    recordingDuration,
    addPatient,
    deletePatient,
    selectPatient,
    startRecording,
    addRecordingSample,
    stopRecording,
    deleteRecording,
    getRecording,
    exportRecordingCSV,
    exportRecordingJSON,
    exportAllPatientData
  }
}
