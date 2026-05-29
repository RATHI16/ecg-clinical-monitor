import React, { useMemo, useRef, useEffect, useState } from 'react'

const FEATURE_DEFS = [
  { key: 'amplitude', label: 'Amplitude', unit: 'mV', group: 'morphology', max: 500 },
  { key: 'mean_value', label: 'Mean', unit: 'mV', group: 'morphology', max: 300 },
  { key: 'rms_value', label: 'RMS', unit: 'mV', group: 'morphology', max: 400 },
  { key: 'std_dev', label: 'Std Dev', unit: 'mV', group: 'morphology', max: 200 },
  { key: 'num_peaks', label: 'Peaks', unit: '', group: 'morphology', max: 5 },
  { key: 'zero_crossings', label: 'Zero Cross', unit: '', group: 'morphology', max: 10 },
  { key: 'area', label: 'Area', unit: '', group: 'morphology', max: 5000 },
  { key: 'peak_position', label: 'Peak Pos', unit: '%', group: 'morphology', max: 100 },
  { key: 'symmetry', label: 'Symmetry', unit: '%', group: 'morphology', max: 200 },
  { key: 'pos_slope', label: '+Slope', unit: '', group: 'morphology', max: 100 },
  { key: 'neg_slope', label: '-Slope', unit: '', group: 'morphology', max: 100 },
  { key: 'energy', label: 'Energy', unit: '', group: 'morphology', max: 50000 },
  { key: 'rr_current', label: 'RR Curr', unit: 'ms', group: 'rhythm', max: 2000 },
  { key: 'rr_previous', label: 'RR Prev', unit: 'ms', group: 'rhythm', max: 2000 },
  { key: 'rr_delta', label: 'RR Delta', unit: 'ms', group: 'rhythm', max: 500 },
  { key: 'rr_mean', label: 'RR Mean', unit: 'ms', group: 'rhythm', max: 2000 },
  { key: 'rr_std', label: 'RR Std', unit: 'ms', group: 'rhythm', max: 200 },
  { key: 'rr_cv', label: 'RR CV', unit: '%', group: 'rhythm', max: 50 },
  { key: 'rr_range', label: 'RR Range', unit: 'ms', group: 'rhythm', max: 500 },
  { key: 'rr_irregularity', label: 'Irregularity', unit: '', group: 'rhythm', max: 100 }
]

function computeClientFeatures(ecgData, metrics) {
  const pWave = ecgData.pWave
  const recent = pWave.slice(-375)

  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0
  let maxIdx = 0
  for (let i = 0; i < recent.length; i++) {
    const v = recent[i]
    if (v < min) min = v
    if (v > max) { max = v; maxIdx = i }
    sum += v
    sumSq += v * v
  }
  const n = recent.length || 1
  const mean = sum / n
  const amplitude = max - min
  const rms = Math.sqrt(sumSq / n)
  const variance = (sumSq / n) - (mean * mean)
  const std_dev = Math.sqrt(Math.max(0, variance))

  let zeroCross = 0
  for (let i = 1; i < recent.length; i++) {
    if ((recent[i] - mean) * (recent[i - 1] - mean) < 0) zeroCross++
  }

  let numPeaks = 0
  const peakThresh = min + (amplitude * 0.7)
  for (let i = 1; i < recent.length - 1; i++) {
    if (recent[i] > peakThresh && recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) numPeaks++
  }

  let maxPosSlope = 0, maxNegSlope = 0
  for (let i = 1; i < recent.length; i++) {
    const slope = recent[i] - recent[i - 1]
    if (slope > maxPosSlope) maxPosSlope = slope
    if (slope < maxNegSlope) maxNegSlope = slope
  }

  const peakPos = recent.length > 0 ? Math.round((maxIdx / recent.length) * 100) : 50
  const area = Math.abs(sum)
  const energy = sumSq

  const riseTime = maxIdx || 1
  const fallTime = (recent.length - maxIdx) || 1
  const symmetry = Math.round((riseTime / fallTime) * 100)

  const rrCurr = metrics.r2rInterval || 0
  const rrHist = rrHistoryRef.current
  if (rrCurr > 200 && rrCurr < 3000 && rrCurr !== rrHist[rrHist.length - 1]) {
    rrHist.push(rrCurr)
    if (rrHist.length > 8) rrHist.shift()
  }

  let rrMean = 0, rrStd = 0, rrCv = 0, rrRange = 0, rrIrreg = 0
  const rrPrev = rrHist.length >= 2 ? rrHist[rrHist.length - 2] : 0
  const rrDelta = Math.abs(rrCurr - rrPrev)

  if (rrHist.length >= 2) {
    const rrSum = rrHist.reduce((a, b) => a + b, 0)
    rrMean = Math.round(rrSum / rrHist.length)
    const rrVar = rrHist.reduce((a, b) => a + (b - rrMean) ** 2, 0) / rrHist.length
    rrStd = Math.round(Math.sqrt(rrVar))
    rrCv = rrMean > 0 ? Math.round((rrStd * 100) / rrMean) : 0
    rrRange = Math.max(...rrHist) - Math.min(...rrHist)
    if (rrHist.length >= 3) {
      let sd1Sum = 0
      for (let i = 1; i < rrHist.length; i++) {
        sd1Sum += (rrHist[i] - rrHist[i - 1]) ** 2
      }
      rrIrreg = Math.round(Math.sqrt(sd1Sum / (2 * (rrHist.length - 1))))
    }
  }

  return {
    amplitude: Math.round(amplitude),
    mean_value: Math.round(mean),
    rms_value: Math.round(rms),
    std_dev: Math.round(std_dev),
    num_peaks: numPeaks,
    zero_crossings: zeroCross,
    area: Math.round(area),
    peak_position: peakPos,
    symmetry: symmetry,
    pos_slope: maxPosSlope,
    neg_slope: Math.abs(maxNegSlope),
    energy: Math.round(energy),
    rr_current: rrCurr,
    rr_previous: rrPrev,
    rr_delta: rrDelta,
    rr_mean: rrMean,
    rr_std: rrStd,
    rr_cv: rrCv,
    rr_range: rrRange,
    rr_irregularity: rrIrreg
  }
}

let rrHistoryRef = { current: [] }

export default function MLFeaturesDashboard({ ecgData, metrics, pWaveAnalysis }) {
  const [features, setFeatures] = useState({})
  const updateCounter = useRef(0)

  useEffect(() => {
    updateCounter.current++
    if (updateCounter.current % 10 !== 0) return
    const f = computeClientFeatures(ecgData, metrics)
    setFeatures(f)
  }, [ecgData, metrics])

  const morphFeatures = FEATURE_DEFS.filter(d => d.group === 'morphology')
  const rhythmFeatures = FEATURE_DEFS.filter(d => d.group === 'rhythm')

  return (
    <div className="card ml-features-card">
      <div className="card-header">
        <span className="card-icon ml-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
          </svg>
        </span>
        <h3>ML Feature Vector</h3>
        <span className="ml-badge inference">20 FEATURES</span>
      </div>
      <div className="card-body ml-features-body">
        <div className="features-section">
          <div className="features-section-title">P-Wave Morphology</div>
          <div className="features-grid">
            {morphFeatures.map(def => {
              const val = features[def.key] || 0
              const pct = Math.min(100, Math.abs(val) / def.max * 100)
              return (
                <div key={def.key} className="feature-item">
                  <div className="feature-header">
                    <span className="feature-label">{def.label}</span>
                    <span className="feature-value">
                      {val}{def.unit && <span className="feature-unit">{def.unit}</span>}
                    </span>
                  </div>
                  <div className="feature-bar">
                    <div
                      className="feature-bar-fill morph-bar"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="features-section">
          <div className="features-section-title">RR Interval / Rhythm</div>
          <div className="features-grid">
            {rhythmFeatures.map(def => {
              const val = features[def.key] || 0
              const pct = Math.min(100, Math.abs(val) / def.max * 100)
              return (
                <div key={def.key} className="feature-item">
                  <div className="feature-header">
                    <span className="feature-label">{def.label}</span>
                    <span className="feature-value">
                      {val}{def.unit && <span className="feature-unit">{def.unit}</span>}
                    </span>
                  </div>
                  <div className="feature-bar">
                    <div
                      className="feature-bar-fill rhythm-bar"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="features-pipeline">
          <div className="pipeline-label">Classification Pipeline</div>
          <div className="pipeline-flow">
            <div className="pipeline-step active">ADC</div>
            <div className="pipeline-arrow">&rarr;</div>
            <div className="pipeline-step active">FIR</div>
            <div className="pipeline-arrow">&rarr;</div>
            <div className="pipeline-step active">Pan-Tompkins</div>
            <div className="pipeline-arrow">&rarr;</div>
            <div className="pipeline-step active">P-Wave Extract</div>
            <div className="pipeline-arrow">&rarr;</div>
            <div className="pipeline-step highlight">ML Classify</div>
          </div>
        </div>
      </div>
    </div>
  )
}
