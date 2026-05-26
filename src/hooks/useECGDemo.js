import { useState, useRef, useCallback, useEffect } from 'react'
import { ECG_SAMPLES } from '../utils/ecgSampleData'
import { PWaveAnalyzer, extractFeatures, classify } from '../utils/pWaveClassifier'

const ECG_BUFFER_SIZE = 2000
const SAMPLE_RATE = 1000
const PT_BUFFER_LENGTH = 16384
const P_WAVE_BUFFER_LENGTH = 16384
const MWI_WINDOW_SIZE = 50
const MWD_WINDOW_SIZE = 10
const BPM_BUFFER_LENGTH = 16

const QRS_RISING_EDGE_DELTA_X = 15
const QRS_PEAK_DELTA_X = 10
const QRS_FALLING_EDGE_DELTA_X = 5
const QRS_TIMEOUT_MULTIPLIER = 1

const BPM_PRIMING = 0
const BPM_FINDING_RISING = 1
const BPM_FINDING_PEAK = 2
const BPM_FINDING_FALLING = 3
const BPM_TIMEOUT_STATE = 4

function getBackIndex(index, delta) {
  return index >= delta ? index - delta : (PT_BUFFER_LENGTH - delta) + index
}

function getForwardIndex(index, delta) {
  const r = index + delta
  return r >= PT_BUFFER_LENGTH ? r - PT_BUFFER_LENGTH : r
}

function getCountDifference(current, previous) {
  return current >= previous
    ? current - previous
    : (PT_BUFFER_LENGTH - previous) + current
}

function createState() {
  return {
    sampleIndex: 0,
    sampleCount: 0,

    // Offset filter (256-sample DC removal)
    offsetBuffer: new Array(256).fill(0),
    offsetIdx: 0,
    offsetSum: 0,

    // Moving window differentiation (firmware: moving_window_differentiate)
    mwdBuffer: new Array(MWD_WINDOW_SIZE).fill(0),
    mwdIdx: 0,

    // Moving window integration (firmware: moving_window_integration)
    mwiBuffer: new Array(MWI_WINDOW_SIZE).fill(0),
    mwiIdx: 0,
    mwiSum: 0,

    // PT signal max filter (firmware: pt_signal_max_filter)
    ptMaxValue: 0,
    ptMaxDecayCounter: 0,

    // QRS detection (firmware: detect_qrs state machine)
    ptBuffer: new Float64Array(PT_BUFFER_LENGTH),
    ptIndex: 0,
    bpmState: BPM_PRIMING,
    prevRisingEdge: 0,
    prevPeak: 0,
    prevFallingEdge: 0,
    bpmTimeout: 0,
    r2rInterval: 0,
    currentBpm: 0,
    qrsWidth: 0,

    // BPM buffer (firmware: bpm_buffer)
    bpmBuffer: new Array(BPM_BUFFER_LENGTH).fill(0),
    bpmBufIdx: 0,
    bpmBufCount: 0,
    bpmBufSum: 0,

    // P-wave circular buffer (firmware: p_wave_buffer)
    pWaveBuffer: new Int16Array(P_WAVE_BUFFER_LENGTH),
    pWaveWriteIdx: 0,
    pWaveReadIdx: 0,
    pWaveReadCount: 0,
    pWaveThreshold: 0,
    pWaveCrossings: 0,
    pWaveAbnormal: 0,
    pWaveOk: 0,
    mlClass: 0,
    mlConfidence: 0,

    // P-wave analyzer with RR history
    pWaveAnalyzer: new PWaveAnalyzer(),

    // Signal quality
    noiseAccum: 0,
    qualitySamples: 0,
    quality: 95
  }
}

export function useECGDemo() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeSampleId, setActiveSampleId] = useState('ideal_60bpm')
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
  const [signalQuality, setSignalQuality] = useState(95)
  const [rawPacket, setRawPacket] = useState(null)

  const intervalRef = useRef(null)
  const stateRef = useRef(null)
  const activeSampleRef = useRef(activeSampleId)
  activeSampleRef.current = activeSampleId

  const processBatch = useCallback(() => {
    const s = stateRef.current
    if (!s) return

    const sample = ECG_SAMPLES.find(x => x.id === activeSampleRef.current) || ECG_SAMPLES[0]
    const data = sample.data
    if (!data || data.length === 0) return

    let lastPacket = null
    let lastQrsDetected = false

    // Process 4 samples per tick (effective 1000Hz at 250Hz timer)
    for (let batch = 0; batch < 4; batch++) {
      const rawSample = data[s.sampleIndex]
      s.sampleIndex = (s.sampleIndex + 1) % data.length
      s.sampleCount++

      // === Offset correction (DC removal — firmware: offset_filter) ===
      s.offsetSum -= s.offsetBuffer[s.offsetIdx]
      s.offsetBuffer[s.offsetIdx] = rawSample
      s.offsetSum += rawSample
      s.offsetIdx = (s.offsetIdx + 1) % 256
      const offsetCorrected = rawSample - Math.round(s.offsetSum / 256)

      // === No notch filter (firmware: filterToUse=0, passthrough) ===
      const filtered = offsetCorrected

      // === mV conversion ===
      const mVValue = Math.round((filtered * 33000) / 20480)

      // === Insert into P-wave buffer (firmware: insert_data_to_p_wave_buffer) ===
      s.pWaveBuffer[s.pWaveWriteIdx] = filtered
      s.pWaveWriteIdx = (s.pWaveWriteIdx + 1) % P_WAVE_BUFFER_LENGTH

      // === Moving window differentiate (firmware: moving_window_differentiate) ===
      s.mwdBuffer[s.mwdIdx] = filtered
      const mwdPrevIdx = (s.mwdIdx + 1) % MWD_WINDOW_SIZE
      const differentiated = filtered - s.mwdBuffer[mwdPrevIdx]
      s.mwdIdx = (s.mwdIdx + 1) % MWD_WINDOW_SIZE

      // === Square (firmware: square_wave) ===
      const squared = differentiated * differentiated

      // === Moving window integration (firmware: moving_window_integration) ===
      s.mwiSum -= s.mwiBuffer[s.mwiIdx]
      s.mwiBuffer[s.mwiIdx] = squared
      s.mwiSum += squared
      s.mwiIdx = (s.mwiIdx + 1) % MWI_WINDOW_SIZE
      const integrated = Math.round(s.mwiSum / MWI_WINDOW_SIZE)

      // === PT signal max filter (firmware: pt_signal_max_filter) ===
      if (integrated > s.ptMaxValue) {
        s.ptMaxValue = integrated
        s.ptMaxDecayCounter = 0
      } else {
        s.ptMaxDecayCounter++
        // Decay after ~1 second of no new max
        if (s.ptMaxDecayCounter > SAMPLE_RATE) {
          s.ptMaxValue = Math.round(s.ptMaxValue * 0.999)
          if (s.ptMaxValue < 1) s.ptMaxValue = 1
        }
      }
      const ptThreshold = s.ptMaxValue

      // === QRS detection state machine (firmware: detect_qrs) ===
      s.ptBuffer[s.ptIndex] = integrated
      let qrsDetected = false

      // BPM timeout scaling (firmware lines 217-224)
      if (s.r2rInterval > 0 && s.bpmState !== BPM_PRIMING) {
        const currentGap = getCountDifference(s.ptIndex, s.prevPeak)
        if (currentGap > s.r2rInterval && s.r2rInterval > 0) {
          s.currentBpm = Math.round(60500 / currentGap)
        }
      }

      switch (s.bpmState) {
        case BPM_PRIMING:
          if (s.sampleCount > 300) s.bpmState = BPM_FINDING_RISING
          break

        case BPM_FINDING_RISING: {
          const prevIdx = getBackIndex(s.ptIndex, QRS_RISING_EDGE_DELTA_X)
          // firmware: (pt_input_buffer[pt_index] - pt_input_buffer[qrs_previous_index]) > (pt_threshold_signal >> 2)
          if ((s.ptBuffer[s.ptIndex] - s.ptBuffer[prevIdx]) > (ptThreshold >> 2)) {
            s.prevRisingEdge = prevIdx
            s.bpmState = BPM_FINDING_PEAK
          }
          break
        }

        case BPM_FINDING_PEAK: {
          const prevIdx = getBackIndex(s.ptIndex, QRS_PEAK_DELTA_X)
          const prevPrevIdx = getBackIndex(prevIdx, QRS_PEAK_DELTA_X)

          if (s.ptBuffer[prevIdx] > s.ptBuffer[s.ptIndex] &&
              s.ptBuffer[prevIdx] > s.ptBuffer[prevPrevIdx]) {
            // Verify it's the true local maximum
            let peakFound = true
            for (let k = 1; k < QRS_PEAK_DELTA_X; k++) {
              const negIdx = getBackIndex(prevIdx, k)
              const posIdx = getForwardIndex(prevIdx, k)
              if (s.ptBuffer[prevIdx] < s.ptBuffer[negIdx] ||
                  s.ptBuffer[prevIdx] < s.ptBuffer[posIdx]) {
                peakFound = false
                break
              }
            }

            if (peakFound) {
              qrsDetected = true
              s.r2rInterval = getCountDifference(s.ptIndex, s.prevPeak)

              // P-wave region: 3/8 of R-R, offset by processing delays
              const pWaveCount = Math.round(3 * (s.r2rInterval >> 3))
              const totalDelay = MWI_WINDOW_SIZE + (MWD_WINDOW_SIZE << 1)
              const pWaveStartPt = getBackIndex(s.ptIndex, pWaveCount + totalDelay)

              s.pWaveReadIdx = pWaveStartPt % P_WAVE_BUFFER_LENGTH
              s.pWaveReadCount = Math.min(pWaveCount, P_WAVE_BUFFER_LENGTH - 1)

              if (s.pWaveReadCount > 10 && s.r2rInterval > 200) {
                // P-wave crossing detection (firmware QRS_algorithm.c lines 282-352)
                const crossResult = s.pWaveAnalyzer.detectCrossings(
                  s.pWaveBuffer, s.pWaveReadIdx, s.pWaveReadCount, P_WAVE_BUFFER_LENGTH
                )
                s.pWaveCrossings = crossResult.crossings
                s.pWaveThreshold = crossResult.threshold
                s.pWaveAbnormal = crossResult.abnormal
                s.pWaveOk = crossResult.ok

                // ML feature extraction + classification
                const features = extractFeatures(
                  s.pWaveBuffer, s.pWaveReadIdx, s.pWaveReadCount, P_WAVE_BUFFER_LENGTH
                )
                s.pWaveAnalyzer.updateRR(s.r2rInterval, features)
                const result = classify(features)
                s.mlClass = result.class
                s.mlConfidence = result.confidence
              }

              // BPM calculation (firmware: get_bpm)
              if (s.r2rInterval > 0) {
                s.currentBpm = Math.round(60500 / s.r2rInterval)
              }

              // Insert BPM into averaging buffer
              if (s.bpmBufCount >= BPM_BUFFER_LENGTH) {
                s.bpmBufSum -= s.bpmBuffer[s.bpmBufIdx]
              } else {
                s.bpmBufCount++
              }
              s.bpmBuffer[s.bpmBufIdx] = s.currentBpm
              s.bpmBufSum += s.currentBpm
              s.bpmBufIdx = (s.bpmBufIdx + 1) % BPM_BUFFER_LENGTH

              s.prevPeak = s.ptIndex
              s.bpmState = BPM_FINDING_FALLING
            }
          }
          break
        }

        case BPM_FINDING_FALLING: {
          const prevIdx = getBackIndex(s.ptIndex, QRS_FALLING_EDGE_DELTA_X)
          if (s.ptBuffer[s.ptIndex] < (ptThreshold >> 3)) {
            if ((s.ptBuffer[prevIdx] - s.ptBuffer[s.ptIndex]) < (ptThreshold >> 4)) {
              s.prevFallingEdge = s.ptIndex
              s.qrsWidth = getCountDifference(s.prevFallingEdge, s.prevRisingEdge)
              s.bpmTimeout = s.qrsWidth * QRS_TIMEOUT_MULTIPLIER
              s.bpmState = BPM_TIMEOUT_STATE
            }
          }
          break
        }

        case BPM_TIMEOUT_STATE:
          s.bpmTimeout--
          if (s.bpmTimeout < 0) {
            s.bpmTimeout = 0
            s.bpmState = BPM_FINDING_RISING
          }
          break
      }

      s.ptIndex = (s.ptIndex + 1) % PT_BUFFER_LENGTH

      // P-wave display output (firmware: read_p_wave_buffer_to_output)
      let pWaveDisplay = 0
      let pWaveThreshDisplay = 0
      if (s.pWaveReadCount > 0) {
        pWaveDisplay = s.pWaveBuffer[s.pWaveReadIdx]
        pWaveThreshDisplay = s.pWaveThreshold
        s.pWaveReadCount--
        s.pWaveReadIdx = (s.pWaveReadIdx + 1) % P_WAVE_BUFFER_LENGTH
      }

      // Signal quality estimation
      s.qualitySamples++
      if (Math.abs(rawSample - filtered) > 200) s.noiseAccum++
      if (s.qualitySamples >= 1000) {
        s.quality = Math.max(0, Math.min(100, 100 - s.noiseAccum * 3))
        s.noiseAccum = 0
        s.qualitySamples = 0
      }

      lastQrsDetected = qrsDetected
      lastPacket = {
        rawSample, filtered, mVValue, differentiated, integrated, ptThreshold,
        pWaveDisplay, pWaveThreshDisplay, qrsDetected
      }
    }

    // Update React state once per batch (not per sample — performance)
    if (!lastPacket) return
    const s2 = stateRef.current

    // BPM stats
    const bpmAvg = s2.bpmBufCount > 0
      ? Math.round((s2.bpmBufSum + (BPM_BUFFER_LENGTH / 2)) / s2.bpmBufCount)
      : 0
    let bpmMin = 32767, bpmMax = 0
    for (let i = 0; i < BPM_BUFFER_LENGTH; i++) {
      if (s2.bpmBuffer[i] > 0 && s2.bpmBuffer[i] < bpmMin) bpmMin = s2.bpmBuffer[i]
      if (s2.bpmBuffer[i] > bpmMax) bpmMax = s2.bpmBuffer[i]
    }
    if (bpmMin === 32767) bpmMin = 0

    const packet = {
      new_ecg_sample: lastPacket.rawSample,
      new_ecg_sample_offset_corrected: lastPacket.filtered,
      lp_FIR_sample: lastPacket.filtered,
      lp_IIR_sample: lastPacket.filtered,
      mV_Conversion: lastPacket.mVValue,
      differentiated_sample: lastPacket.differentiated,
      squared_sample: lastPacket.differentiated * lastPacket.differentiated,
      integrated_sample: lastPacket.integrated,
      pt_threshold_signal: lastPacket.ptThreshold,
      bpm_state: lastQrsDetected ? 1 : 0,
      R2R_interval: s2.r2rInterval,
      bpm: s2.currentBpm,
      bpm_average: bpmAvg,
      bpm_min: bpmMin,
      bpm_max: bpmMax,
      qrs_width: s2.qrsWidth,
      p_wave_data: lastPacket.pWaveDisplay,
      p_wave_threshold: lastPacket.pWaveThreshDisplay,
      p_wave_crossings: s2.pWaveCrossings,
      p_wave_abnormal: s2.pWaveAbnormal,
      p_wave_ok: s2.pWaveOk,
      ml_p_wave_class: s2.mlClass,
      ml_confidence: s2.mlConfidence,
      ml_data_collection: 0
    }

    setRawPacket(packet)
    setSignalQuality(s2.quality)

    setEcgData(prev => ({
      raw: [...prev.raw.slice(4), lastPacket.rawSample, lastPacket.rawSample, lastPacket.rawSample, lastPacket.rawSample],
      filtered: [...prev.filtered.slice(4), lastPacket.filtered, lastPacket.filtered, lastPacket.filtered, lastPacket.filtered],
      mV: [...prev.mV.slice(4), lastPacket.mVValue, lastPacket.mVValue, lastPacket.mVValue, lastPacket.mVValue],
      pWave: [...prev.pWave.slice(4), lastPacket.pWaveDisplay, lastPacket.pWaveDisplay, lastPacket.pWaveDisplay, lastPacket.pWaveDisplay],
      pWaveThreshold: [...prev.pWaveThreshold.slice(4), lastPacket.pWaveThreshDisplay, lastPacket.pWaveThreshDisplay, lastPacket.pWaveThreshDisplay, lastPacket.pWaveThreshDisplay],
      timestamps: [...prev.timestamps.slice(4), s2.sampleCount-3, s2.sampleCount-2, s2.sampleCount-1, s2.sampleCount]
    }))

    setMetrics({
      bpm: s2.currentBpm,
      bpmAverage: bpmAvg,
      bpmMin: bpmMin,
      bpmMax: bpmMax,
      r2rInterval: s2.r2rInterval,
      qrsWidth: s2.qrsWidth,
      bpmState: lastQrsDetected ? 1 : 0
    })

    setPWaveAnalysis({
      crossings: s2.pWaveCrossings,
      abnormal: s2.pWaveAbnormal,
      ok: s2.pWaveOk,
      mlClass: s2.mlClass,
      mlConfidence: s2.mlConfidence,
      mlDataCollection: 0
    })
  }, [])

  const play = useCallback(() => {
    if (isPlaying) return
    if (!stateRef.current) stateRef.current = createState()
    setIsPlaying(true)
    intervalRef.current = setInterval(processBatch, 4)
  }, [isPlaying, processBatch])

  const pause = useCallback(() => {
    setIsPlaying(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    pause()
    stateRef.current = null
    setEcgData({
      raw: new Array(ECG_BUFFER_SIZE).fill(0),
      filtered: new Array(ECG_BUFFER_SIZE).fill(0),
      mV: new Array(ECG_BUFFER_SIZE).fill(0),
      pWave: new Array(ECG_BUFFER_SIZE).fill(0),
      pWaveThreshold: new Array(ECG_BUFFER_SIZE).fill(0),
      timestamps: new Array(ECG_BUFFER_SIZE).fill(0)
    })
    setMetrics({ bpm: 0, bpmAverage: 0, bpmMin: 0, bpmMax: 0, r2rInterval: 0, qrsWidth: 0, bpmState: 0 })
    setPWaveAnalysis({ crossings: 0, abnormal: 0, ok: 0, mlClass: 0, mlConfidence: 0, mlDataCollection: 0 })
    setSignalQuality(95)
  }, [pause])

  const selectSample = useCallback((sampleId) => {
    const wasPlaying = isPlaying
    if (isPlaying) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      setIsPlaying(false)
    }
    setActiveSampleId(sampleId)
    stateRef.current = createState()
    if (wasPlaying) {
      setTimeout(() => {
        setIsPlaying(true)
        intervalRef.current = setInterval(processBatch, 4)
      }, 50)
    }
  }, [isPlaying, processBatch])

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  return {
    isPlaying,
    activeSampleId,
    samples: ECG_SAMPLES,
    play,
    pause,
    stop,
    selectSample,
    ecgData,
    metrics,
    pWaveAnalysis,
    signalQuality,
    rawPacket
  }
}
