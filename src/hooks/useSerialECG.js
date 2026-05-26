import { useState, useRef, useCallback, useEffect } from 'react'

const BAUD_RATE = 921600
const FRAME_START = 0x03
const FRAME_END = 0xFC
const PACKET_SIZE = 49
const ECG_BUFFER_SIZE = 2000

function parsePacket(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset)
  let offset = 0

  const startFrame = view.getUint8(offset); offset += 1
  if (startFrame !== FRAME_START) return null

  const new_ecg_sample = view.getInt16(offset, true); offset += 2
  const new_ecg_sample_offset_corrected = view.getInt16(offset, true); offset += 2
  const lp_FIR_sample = view.getInt16(offset, true); offset += 2
  const lp_IIR_sample = view.getInt16(offset, true); offset += 2
  const mV_Conversion = view.getInt16(offset, true); offset += 2
  const differentiated_sample = view.getInt16(offset, true); offset += 2
  const squared_sample = view.getUint32(offset, true); offset += 4
  const integrated_sample = view.getUint32(offset, true); offset += 4
  const pt_threshold_signal = view.getUint32(offset, true); offset += 4
  const bpm_state = view.getUint8(offset); offset += 1
  const R2R_interval = view.getInt16(offset, true); offset += 2
  const bpm = view.getInt16(offset, true); offset += 2
  const bpm_average = view.getInt16(offset, true); offset += 2
  const bpm_min = view.getInt16(offset, true); offset += 2
  const bpm_max = view.getInt16(offset, true); offset += 2
  const qrs_width = view.getInt16(offset, true); offset += 2
  const p_wave_data = view.getInt16(offset, true); offset += 2
  const p_wave_threshold = view.getInt16(offset, true); offset += 2
  const p_wave_crossings = view.getUint8(offset); offset += 1
  const p_wave_abnormal = view.getUint8(offset); offset += 1
  const p_wave_ok = view.getUint8(offset); offset += 1
  const ml_p_wave_class = view.getUint8(offset); offset += 1
  const ml_confidence = view.getUint8(offset); offset += 1
  const ml_data_collection = view.getUint8(offset); offset += 1
  const endFrame = view.getUint8(offset); offset += 1

  if (endFrame !== FRAME_END) return null

  return {
    new_ecg_sample,
    new_ecg_sample_offset_corrected,
    lp_FIR_sample,
    lp_IIR_sample,
    mV_Conversion,
    differentiated_sample,
    squared_sample,
    integrated_sample,
    pt_threshold_signal,
    bpm_state,
    R2R_interval,
    bpm,
    bpm_average,
    bpm_min,
    bpm_max,
    qrs_width,
    p_wave_data,
    p_wave_threshold,
    p_wave_crossings,
    p_wave_abnormal,
    p_wave_ok,
    ml_p_wave_class,
    ml_confidence,
    ml_data_collection
  }
}

export function useSerialECG() {
  const [isConnected, setIsConnected] = useState(false)
  const [debugLog, setDebugLog] = useState([])
  const [ecgData, setEcgData] = useState({
    raw: new Array(ECG_BUFFER_SIZE).fill(0),
    filtered: new Array(ECG_BUFFER_SIZE).fill(0),
    mV: new Array(ECG_BUFFER_SIZE).fill(0),
    pWave: new Array(ECG_BUFFER_SIZE).fill(0),
    pWaveThreshold: new Array(ECG_BUFFER_SIZE).fill(0),
    timestamps: new Array(ECG_BUFFER_SIZE).fill(0)
  })
  const [metrics, setMetrics] = useState({
    bpm: 0, bpmAverage: 0, bpmMin: 0, bpmMax: 0,
    r2rInterval: 0, qrsWidth: 0, bpmState: 0
  })
  const [pWaveAnalysis, setPWaveAnalysis] = useState({
    crossings: 0, abnormal: 0, ok: 0,
    mlClass: 0, mlConfidence: 0, mlDataCollection: 0
  })
  const [signalQuality, setSignalQuality] = useState(100)
  const [rawPacket, setRawPacket] = useState(null)

  const portRef = useRef(null)
  const readerRef = useRef(null)
  const readingRef = useRef(false)
  const bufferRef = useRef(new Uint8Array(0))
  const sampleCountRef = useRef(0)
  const lastQualityCalcRef = useRef(Date.now())
  const noiseCountRef = useRef(0)
  const parseLogRef = useRef({ parsed: 0, discarded: 0, lastLog: 0 })

  const addLog = useCallback((msg) => {
    setDebugLog(prev => [...prev.slice(-19), { time: new Date().toLocaleTimeString(), msg }])
  }, [])

  const processIncomingData = useCallback((newData) => {
    const existing = bufferRef.current
    const combined = new Uint8Array(existing.length + newData.length)
    combined.set(existing)
    combined.set(newData, existing.length)
    bufferRef.current = combined

    while (bufferRef.current.length >= PACKET_SIZE) {
      // Fast path: if already aligned (start=0x03, end=0xFC), parse directly
      if (bufferRef.current[0] === FRAME_START && bufferRef.current[PACKET_SIZE - 1] === FRAME_END) {
        const packetBytes = bufferRef.current.slice(0, PACKET_SIZE)
        const packet = parsePacket(packetBytes)
        if (packet) {
          parseLogRef.current.parsed++
          bufferRef.current = bufferRef.current.slice(PACKET_SIZE)
          sampleCountRef.current++

          setRawPacket(packet)
          setEcgData(prev => ({
            raw: [...prev.raw.slice(1), packet.new_ecg_sample],
            filtered: [...prev.filtered.slice(1), packet.lp_FIR_sample],
            mV: [...prev.mV.slice(1), packet.mV_Conversion],
            pWave: [...prev.pWave.slice(1), packet.p_wave_data],
            pWaveThreshold: [...prev.pWaveThreshold.slice(1), packet.p_wave_threshold],
            timestamps: [...prev.timestamps.slice(1), sampleCountRef.current]
          }))
          setMetrics({
            bpm: packet.bpm, bpmAverage: packet.bpm_average,
            bpmMin: packet.bpm_min, bpmMax: packet.bpm_max,
            r2rInterval: packet.R2R_interval, qrsWidth: packet.qrs_width,
            bpmState: packet.bpm_state
          })
          setPWaveAnalysis({
            crossings: packet.p_wave_crossings, abnormal: packet.p_wave_abnormal,
            ok: packet.p_wave_ok, mlClass: packet.ml_p_wave_class,
            mlConfidence: packet.ml_confidence, mlDataCollection: packet.ml_data_collection
          })

          const now2 = Date.now()
          if (Math.abs(packet.new_ecg_sample - packet.lp_FIR_sample) > 500) noiseCountRef.current++
          if (now2 - lastQualityCalcRef.current > 1000) {
            setSignalQuality(Math.max(0, Math.min(100, 100 - noiseCountRef.current * 2)))
            noiseCountRef.current = 0
            lastQualityCalcRef.current = now2
          }
          continue
        }
      }

      // Not aligned — scan for valid frame: 0x03 at [i] AND 0xFC at [i+48]
      let syncFound = false
      for (let i = 1; i < bufferRef.current.length - PACKET_SIZE + 1; i++) {
        if (bufferRef.current[i] === FRAME_START && bufferRef.current[i + PACKET_SIZE - 1] === FRAME_END) {
          parseLogRef.current.discarded += i
          bufferRef.current = bufferRef.current.slice(i)
          syncFound = true
          break
        }
      }
      if (!syncFound) {
        const keep = PACKET_SIZE - 1
        parseLogRef.current.discarded += bufferRef.current.length - keep
        bufferRef.current = bufferRef.current.slice(bufferRef.current.length - keep)
        break
      }
    }

    const now = Date.now()
    if (now - parseLogRef.current.lastLog > 2000) {
      parseLogRef.current.lastLog = now
      addLog(`PARSER: ${parseLogRef.current.parsed} pkts OK, ${parseLogRef.current.discarded} discarded`)
    }
  }, [addLog])

  const startReading = useCallback(async (port) => {
    readingRef.current = true
    let totalBytes = 0
    let chunkCount = 0
    addLog('Reading started...')
    while (port.readable && readingRef.current) {
      const reader = port.readable.getReader()
      readerRef.current = reader
      try {
        while (readingRef.current) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) {
            totalBytes += value.length
            chunkCount++
            if (chunkCount <= 3) {
              const hex = Array.from(value.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')
              addLog(`Chunk #${chunkCount}: ${value.length}B [${hex}]`)
            }
            if (chunkCount % 20000 === 0) {
              addLog(`Stats: ${totalBytes} bytes, ${chunkCount} chunks`)
            }
            processIncomingData(value)
          }
        }
      } catch (error) {
        addLog(`ERROR: ${error.name} - ${error.message}`)
      } finally {
        reader.releaseLock()
      }
    }
    addLog(`Stopped. Total: ${totalBytes} bytes`)
  }, [processIncomingData, addLog])

  const connect = useCallback(async () => {
    try {
      addLog('Requesting serial port...')
      const port = await navigator.serial.requestPort()
      addLog('Opening at 460800 baud...')
      await port.open({
        baudRate: BAUD_RATE,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
        bufferSize: 8192
      })
      portRef.current = port
      await port.setSignals({ dataTerminalReady: true, requestToSend: true })
      setIsConnected(true)
      const info = port.getInfo()
      addLog(`Connected! VID:${info.usbVendorId?.toString(16)} PID:${info.usbProductId?.toString(16)}`)
      startReading(port)
    } catch (error) {
      addLog(`FAILED: ${error.message}`)
      setIsConnected(false)
    }
  }, [startReading, addLog])

  const disconnect = useCallback(async () => {
    readingRef.current = false
    if (readerRef.current) {
      try { await readerRef.current.cancel() } catch (e) {}
      readerRef.current = null
    }
    if (portRef.current) {
      try { await portRef.current.close() } catch (e) {}
      portRef.current = null
    }
    setIsConnected(false)
  }, [])

  const sendCommand = useCallback(async (cmd) => {
    if (!portRef.current || !portRef.current.writable) return
    const writer = portRef.current.writable.getWriter()
    try {
      await writer.write(new Uint8Array([cmd]))
    } finally {
      writer.releaseLock()
    }
  }, [])

  useEffect(() => {
    return () => { disconnect() }
  }, [disconnect])

  return {
    connect, disconnect, sendCommand, isConnected,
    ecgData, metrics, pWaveAnalysis, signalQuality, rawPacket, debugLog
  }
}
