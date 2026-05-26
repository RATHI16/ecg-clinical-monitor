import React, { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import ECGChart from './components/ECGChart'
import PatientCard from './components/PatientCard'
import MetricsPanel from './components/MetricsPanel'
import AIStatus from './components/AIStatus'
import SignalQuality from './components/SignalQuality'
import PatientManager from './components/PatientManager'
import RecordingPanel from './components/RecordingPanel'
import DemoPanel from './components/DemoPanel'
import { useSerialECG } from './hooks/useSerialECG'
import { useECGDemo } from './hooks/useECGDemo'
import { usePatientStore } from './hooks/usePatientStore'

export default function App() {
  const [filter, setFilter] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mode, setMode] = useState('demo') // 'demo' | 'live'

  const serial = useSerialECG()
  const demo = useECGDemo()

  const {
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
    exportRecordingCSV,
    exportRecordingJSON,
    exportAllPatientData
  } = usePatientStore()

  // Active data source based on mode
  const ecgData = mode === 'live' ? serial.ecgData : demo.ecgData
  const metrics = mode === 'live' ? serial.metrics : demo.metrics
  const pWaveAnalysis = mode === 'live' ? serial.pWaveAnalysis : demo.pWaveAnalysis
  const signalQuality = mode === 'live' ? serial.signalQuality : demo.signalQuality
  const rawPacket = mode === 'live' ? serial.rawPacket : demo.rawPacket
  const isConnected = mode === 'live' ? serial.isConnected : demo.isPlaying

  // Feed incoming packets to recording buffer
  useEffect(() => {
    if (isRecording && rawPacket) {
      addRecordingSample(rawPacket)
    }
  }, [rawPacket, isRecording, addRecordingSample])

  // Auto-switch to live mode when serial connects
  useEffect(() => {
    if (serial.isConnected) {
      demo.pause()
      setMode('live')
    }
  }, [serial.isConnected])

  const handleConnect = useCallback(async () => {
    await serial.connect()
  }, [serial])

  const handleDisconnect = useCallback(async () => {
    await serial.disconnect()
    setMode('demo')
  }, [serial])

  const handleFilterChange = useCallback((filterType) => {
    setFilter(filterType)
  }, [])

  const handleModeSwitch = useCallback(async (newMode) => {
    if (newMode === 'demo') {
      if (serial.isConnected) {
        await serial.disconnect()
      }
      demo.play()
      setMode('demo')
    } else if (newMode === 'live') {
      demo.pause()
      if (!serial.isConnected) {
        try {
          await serial.connect()
        } catch (e) {
          demo.play()
          return
        }
      }
      setMode('live')
    }
  }, [serial, demo])

  return (
    <div className="app">
      <Header
        isConnected={serial.isConnected}
        isDemo={mode === 'demo' && demo.isPlaying}
        mode={mode}
        onModeSwitch={handleModeSwitch}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />
      <div className="main-layout">
        {sidebarOpen && (
          <aside className="sidebar">
            <DemoPanel
              samples={demo.samples}
              activeSampleId={demo.activeSampleId}
              isPlaying={demo.isPlaying}
              onSelectSample={demo.selectSample}
              onPlay={demo.play}
              onPause={demo.pause}
              onStop={demo.stop}
            />
            <PatientManager
              patients={patients}
              activePatient={activePatient}
              onSelectPatient={selectPatient}
              onAddPatient={addPatient}
              onDeletePatient={deletePatient}
            />
            <RecordingPanel
              activePatient={activePatient}
              recordings={recordings}
              isRecording={isRecording}
              recordingDuration={recordingDuration}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onDeleteRecording={deleteRecording}
              onExportCSV={exportRecordingCSV}
              onExportJSON={exportRecordingJSON}
              onExportAll={exportAllPatientData}
            />
          </aside>
        )}
        <main className="dashboard">
          {mode === 'live' && serial.debugLog.length > 0 && (
            <div style={{
              background: '#0a0e14',
              border: '1px solid #1a3a4a',
              borderRadius: '8px',
              padding: '8px 12px',
              margin: '0 0 8px 0',
              fontFamily: 'monospace',
              fontSize: '11px',
              maxHeight: '120px',
              overflowY: 'auto',
              color: '#00e5ff'
            }}>
              <div style={{ color: '#666', marginBottom: '4px' }}>SERIAL DEBUG LOG:</div>
              {serial.debugLog.map((entry, i) => (
                <div key={i} style={{ color: entry.msg.includes('ERROR') || entry.msg.includes('FAIL') ? '#ff1744' : '#aaa' }}>
                  <span style={{ color: '#555' }}>{entry.time}</span> {entry.msg}
                </div>
              ))}
            </div>
          )}
          <div className="dashboard-top">
            <ECGChart
              ecgData={ecgData}
              filter={filter}
              onFilterChange={handleFilterChange}
            />
          </div>
          <div className="dashboard-bottom">
            <PatientCard
              isConnected={isConnected}
              activePatient={activePatient}
              isRecording={isRecording}
              recordingDuration={recordingDuration}
            />
            <MetricsPanel metrics={metrics} />
            <AIStatus pWaveAnalysis={pWaveAnalysis} />
            <SignalQuality quality={signalQuality} rawPacket={rawPacket} />
          </div>
        </main>
      </div>
    </div>
  )
}
