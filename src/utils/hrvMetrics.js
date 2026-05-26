// Heart Rate Variability (HRV) metrics computation
// Uses R-R intervals from the firmware or local QRS detector

export class HRVAnalyzer {
  constructor(maxIntervals = 300) {
    this.rrIntervals = []
    this.maxIntervals = maxIntervals
    this.sampleRate = 1000
  }

  addInterval(rrMs) {
    if (rrMs <= 0 || rrMs > 3000) return
    this.rrIntervals.push(rrMs)
    if (this.rrIntervals.length > this.maxIntervals) {
      this.rrIntervals.shift()
    }
  }

  getMeanRR() {
    if (this.rrIntervals.length === 0) return 0
    return this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length
  }

  getSDNN() {
    if (this.rrIntervals.length < 2) return 0
    const mean = this.getMeanRR()
    const variance = this.rrIntervals.reduce((sum, rr) => sum + (rr - mean) ** 2, 0) / (this.rrIntervals.length - 1)
    return Math.sqrt(variance)
  }

  getRMSSD() {
    if (this.rrIntervals.length < 2) return 0
    let sumSquaredDiff = 0
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i - 1]
      sumSquaredDiff += diff * diff
    }
    return Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1))
  }

  getPNN50() {
    if (this.rrIntervals.length < 2) return 0
    let count = 0
    for (let i = 1; i < this.rrIntervals.length; i++) {
      if (Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]) > 50) {
        count++
      }
    }
    return (count / (this.rrIntervals.length - 1)) * 100
  }

  getTriangularIndex() {
    if (this.rrIntervals.length < 10) return 0
    const binWidth = 7.8125
    const bins = {}
    let maxBinCount = 0

    for (const rr of this.rrIntervals) {
      const bin = Math.floor(rr / binWidth)
      bins[bin] = (bins[bin] || 0) + 1
      if (bins[bin] > maxBinCount) maxBinCount = bins[bin]
    }

    return this.rrIntervals.length / maxBinCount
  }

  getStressIndex() {
    const sdnn = this.getSDNN()
    if (sdnn === 0) return 0
    const meanRR = this.getMeanRR()
    return Math.round((1000 * 1000) / (2 * meanRR * sdnn))
  }

  getAllMetrics() {
    return {
      meanRR: Math.round(this.getMeanRR()),
      sdnn: Math.round(this.getSDNN() * 10) / 10,
      rmssd: Math.round(this.getRMSSD() * 10) / 10,
      pnn50: Math.round(this.getPNN50() * 10) / 10,
      triangularIndex: Math.round(this.getTriangularIndex() * 10) / 10,
      stressIndex: this.getStressIndex(),
      totalBeats: this.rrIntervals.length
    }
  }

  reset() {
    this.rrIntervals = []
  }
}

export function classifyHRV(metrics) {
  if (metrics.sdnn > 100) return { level: 'excellent', color: '#00e676' }
  if (metrics.sdnn > 50) return { level: 'good', color: '#00bcd4' }
  if (metrics.sdnn > 20) return { level: 'moderate', color: '#ffc107' }
  return { level: 'low', color: '#ff5252' }
}

export function detectArrhythmia(rrIntervals) {
  if (rrIntervals.length < 5) return { type: 'insufficient_data', confidence: 0 }

  const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length
  const cv = Math.sqrt(
    rrIntervals.reduce((sum, rr) => sum + (rr - mean) ** 2, 0) / rrIntervals.length
  ) / mean

  if (mean < 600) return { type: 'tachycardia', confidence: Math.min(100, Math.round((600 - mean) / 2)) }
  if (mean > 1200) return { type: 'bradycardia', confidence: Math.min(100, Math.round((mean - 1200) / 5)) }
  if (cv > 0.2) return { type: 'irregular', confidence: Math.min(100, Math.round(cv * 200)) }

  return { type: 'normal_sinus', confidence: Math.round((1 - cv) * 100) }
}
