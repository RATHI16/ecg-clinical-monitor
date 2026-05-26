// Pan-Tompkins QRS Detection Algorithm (JavaScript implementation)
// Mirrors the SAME54 firmware PT_algorithm

const MWI_WINDOW_SIZE = 50
const MWD_WINDOW_SIZE = 10

export class PanTompkinsDetector {
  constructor(sampleRate = 1000) {
    this.sampleRate = sampleRate
    this.mwdBuffer = new Array(MWD_WINDOW_SIZE).fill(0)
    this.mwdIndex = 0
    this.mwiBuffer = new Array(MWI_WINDOW_SIZE).fill(0)
    this.mwiIndex = 0
    this.mwiSum = 0

    // Adaptive thresholds
    this.signalPeak = 0
    this.noisePeak = 0
    this.threshold1 = 0
    this.threshold2 = 0

    // R-R interval tracking
    this.rrIntervals = []
    this.lastRPeak = 0
    this.sampleCount = 0

    // QRS detection state
    this.qrsDetected = false
    this.refractoryPeriod = Math.round(0.2 * sampleRate)
    this.lastQRSTime = -this.refractoryPeriod
  }

  differentiate(sample) {
    this.mwdBuffer[this.mwdIndex] = sample
    this.mwdIndex = (this.mwdIndex + 1) % MWD_WINDOW_SIZE

    let sum = 0
    for (let i = 0; i < MWD_WINDOW_SIZE - 1; i++) {
      const idx1 = (this.mwdIndex + i) % MWD_WINDOW_SIZE
      const idx2 = (this.mwdIndex + i + 1) % MWD_WINDOW_SIZE
      sum += this.mwdBuffer[idx2] - this.mwdBuffer[idx1]
    }
    return Math.round(sum / MWD_WINDOW_SIZE)
  }

  square(sample) {
    return sample * sample
  }

  integrate(sample) {
    this.mwiSum -= this.mwiBuffer[this.mwiIndex]
    this.mwiBuffer[this.mwiIndex] = sample
    this.mwiSum += sample
    this.mwiIndex = (this.mwiIndex + 1) % MWI_WINDOW_SIZE
    return Math.round(this.mwiSum / MWI_WINDOW_SIZE)
  }

  processSample(filteredSample) {
    this.sampleCount++
    const diff = this.differentiate(filteredSample)
    const squared = this.square(diff)
    const integrated = this.integrate(squared)

    this.qrsDetected = false

    if (this.sampleCount - this.lastQRSTime > this.refractoryPeriod) {
      if (integrated > this.threshold1) {
        this.signalPeak = 0.125 * integrated + 0.875 * this.signalPeak
        this.qrsDetected = true
        this.lastQRSTime = this.sampleCount

        const rrInterval = this.sampleCount - this.lastRPeak
        if (this.lastRPeak > 0 && rrInterval > 0) {
          this.rrIntervals.push(rrInterval)
          if (this.rrIntervals.length > 8) this.rrIntervals.shift()
        }
        this.lastRPeak = this.sampleCount
      } else {
        this.noisePeak = 0.125 * integrated + 0.875 * this.noisePeak
      }
    }

    this.threshold1 = this.noisePeak + 0.25 * (this.signalPeak - this.noisePeak)
    this.threshold2 = 0.5 * this.threshold1

    return {
      differentiated: diff,
      squared,
      integrated,
      threshold: Math.round(this.threshold1),
      qrsDetected: this.qrsDetected,
      rrInterval: this.rrIntervals.length > 0 ? this.rrIntervals[this.rrIntervals.length - 1] : 0
    }
  }

  getBPM() {
    if (this.rrIntervals.length === 0) return 0
    const avgRR = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length
    return Math.round((60 * this.sampleRate) / avgRR)
  }

  getRRIntervals() {
    return [...this.rrIntervals]
  }

  reset() {
    this.mwdBuffer.fill(0)
    this.mwiBuffer.fill(0)
    this.mwdIndex = 0
    this.mwiIndex = 0
    this.mwiSum = 0
    this.signalPeak = 0
    this.noisePeak = 0
    this.threshold1 = 0
    this.threshold2 = 0
    this.rrIntervals = []
    this.lastRPeak = 0
    this.sampleCount = 0
    this.lastQRSTime = -this.refractoryPeriod
  }
}
