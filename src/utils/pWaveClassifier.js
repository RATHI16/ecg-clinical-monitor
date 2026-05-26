// P-Wave ML Classifier — exact port of p_wave_ml_model.c + p_wave_ml_features.c

export const P_WAVE_CLASS = {
  NORMAL: 0,
  PEAKED: 1,
  BIFID: 2,
  INVERTED: 3,
  ABSENT: 4,
  AFIB_PATTERN: 5
}

export const P_WAVE_CLASS_LABELS = {
  [P_WAVE_CLASS.NORMAL]: 'Normal P-Wave',
  [P_WAVE_CLASS.PEAKED]: 'Peaked P-Wave',
  [P_WAVE_CLASS.BIFID]: 'Bifid P-Wave',
  [P_WAVE_CLASS.INVERTED]: 'Inverted P-Wave',
  [P_WAVE_CLASS.ABSENT]: 'P-Wave Absent',
  [P_WAVE_CLASS.AFIB_PATTERN]: 'AFib Pattern'
}

const P_WAVE_ABSENT_AMPLITUDE = 10
const P_WAVE_ABSENT_STDDEV = 3
const P_WAVE_PEAKED_SLOPE_RATIO = 80
const P_WAVE_AFIB_RR_CV = 15
const P_WAVE_AFIB_RR_IRREG = 30
const P_WAVE_INVERTED_PEAK_POS_LOW = 15
const P_WAVE_INVERTED_PEAK_POS_HIGH = 85
const P_WAVE_BIFID_MIN_PEAKS = 2
const P_WAVE_AFIB_ZERO_CROSS = 4
const P_WAVE_AFIB_PEAKS = 2
const RR_HISTORY_LENGTH = 8
const BASE_LINE_NORMAL = 2

function isqrt32(val) {
  if (val <= 0) return 0
  let guess = 1
  while (guess * guess < val) guess <<= 1
  let lo = guess >> 1
  let hi = guess
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (mid * mid === val) return mid
    if (mid * mid < val) lo = mid + 1
    else hi = mid - 1
  }
  return hi
}

export function extractFeatures(buffer, startIndex, count, bufferLength) {
  const features = {
    amplitude: 0, mean_value: 0, rms_value: 0, std_dev: 0,
    num_peaks: 0, zero_crossings: 0, area: 0,
    peak_position_pct: 0, symmetry_index: 0,
    max_pos_slope: 0, max_neg_slope: 0, energy: 0,
    rr_current: 0, rr_previous: 0, rr_delta: 0,
    rr_mean: 0, rr_std: 0, rr_cv: 0, rr_range: 0, rr_irregularity: 0
  }

  if (count <= 0) return features

  let minVal = 32767
  let maxVal = -32768
  let sum = 0
  let sumSq = 0
  let peakIndexInWindow = 0

  let idx = startIndex
  for (let i = 0; i < count; i++) {
    const val = buffer[idx]
    sum += val
    if (val > maxVal) { maxVal = val; peakIndexInWindow = i }
    if (val < minVal) minVal = val
    idx = (idx + 1) % bufferLength
  }

  const mean = Math.round(sum / count)
  features.amplitude = maxVal - minVal
  features.mean_value = mean
  features.area = sum

  let varSum = 0
  let zeroCrossings = 0
  let numPeaks = 0
  let maxPosSlope = 0
  let maxNegSlope = 0
  let prevVal = 0
  let prevAboveMean = 0

  const threshold70 = minVal + Math.round((7 * (maxVal - minVal)) / 10)
  let inPeakRegion = 0

  idx = startIndex
  for (let i = 0; i < count; i++) {
    const val = buffer[idx]
    const diffFromMean = val - mean
    varSum += diffFromMean * diffFromMean
    sumSq += val * val

    const aboveMean = val >= mean ? 1 : 0
    if (i > 0) {
      if (aboveMean !== prevAboveMean) zeroCrossings++
      const slope = val - prevVal
      if (slope > maxPosSlope) maxPosSlope = slope
      if (slope < maxNegSlope) maxNegSlope = slope
    }
    prevAboveMean = aboveMean

    if (val >= threshold70) {
      if (!inPeakRegion) { numPeaks++; inPeakRegion = 1 }
    } else {
      inPeakRegion = 0
    }

    prevVal = val
    idx = (idx + 1) % bufferLength
  }

  features.std_dev = isqrt32(Math.round(varSum / count))
  features.rms_value = isqrt32(Math.round(sumSq / count))
  features.zero_crossings = zeroCrossings
  features.num_peaks = numPeaks
  features.energy = sumSq
  features.max_pos_slope = maxPosSlope
  features.max_neg_slope = maxNegSlope
  features.peak_position_pct = Math.round((peakIndexInWindow * 100) / count)

  const riseTime = peakIndexInWindow
  const fallTime = count - peakIndexInWindow
  features.symmetry_index = fallTime > 0 ? Math.round((riseTime * 100) / fallTime) : 100

  return features
}

export function classify(features) {
  let confidence = 50

  // 1. ABSENT check
  if (features.amplitude < P_WAVE_ABSENT_AMPLITUDE || features.std_dev < P_WAVE_ABSENT_STDDEV) {
    confidence = features.amplitude < (P_WAVE_ABSENT_AMPLITUDE / 2) ? 90 : 60
    return { class: P_WAVE_CLASS.ABSENT, confidence }
  }

  // 2. INVERTED check
  if (features.peak_position_pct < P_WAVE_INVERTED_PEAK_POS_LOW ||
      features.peak_position_pct > P_WAVE_INVERTED_PEAK_POS_HIGH) {
    const negMag = -features.max_neg_slope
    if (negMag > features.max_pos_slope) {
      let ratio = features.max_pos_slope > 0
        ? Math.round((negMag * 100) / features.max_pos_slope)
        : 200
      confidence = ratio > 150 ? 85 : 55
      return { class: P_WAVE_CLASS.INVERTED, confidence }
    }
  }

  // 3. AFIB check (RR variability + morphology)
  if (features.rr_previous > 0 &&
      features.rr_cv > P_WAVE_AFIB_RR_CV &&
      features.rr_irregularity > P_WAVE_AFIB_RR_IRREG) {
    if (features.zero_crossings > P_WAVE_AFIB_ZERO_CROSS ||
        features.num_peaks > P_WAVE_AFIB_PEAKS) {
      confidence = features.rr_cv > (P_WAVE_AFIB_RR_CV * 2) ? 90 : 65
      return { class: P_WAVE_CLASS.AFIB_PATTERN, confidence }
    }
  }

  // 4. BIFID check
  if (features.num_peaks === P_WAVE_BIFID_MIN_PEAKS) {
    confidence = 70
    return { class: P_WAVE_CLASS.BIFID, confidence }
  }

  if (features.num_peaks > P_WAVE_BIFID_MIN_PEAKS) {
    if (features.rr_previous > 0 && features.rr_cv > P_WAVE_AFIB_RR_CV) {
      confidence = 65
      return { class: P_WAVE_CLASS.AFIB_PATTERN, confidence }
    }
    confidence = 50
    return { class: P_WAVE_CLASS.BIFID, confidence }
  }

  // 5. PEAKED check
  const slopeSum = features.max_pos_slope + (-features.max_neg_slope)
  const slopeRatio = features.amplitude > 0
    ? Math.round((slopeSum * 100) / features.amplitude)
    : 0
  if (slopeRatio > P_WAVE_PEAKED_SLOPE_RATIO) {
    confidence = slopeRatio > (P_WAVE_PEAKED_SLOPE_RATIO + 40) ? 85 : 60
    return { class: P_WAVE_CLASS.PEAKED, confidence }
  }

  // 6. NORMAL (default)
  confidence = 75
  return { class: P_WAVE_CLASS.NORMAL, confidence }
}

export class PWaveAnalyzer {
  constructor() {
    this.rrHistory = new Array(RR_HISTORY_LENGTH).fill(0)
    this.rrHistoryIndex = 0
    this.rrHistoryCount = 0
    this.rrPrevInterval = 0
  }

  updateRR(rrInterval, features) {
    features.rr_current = rrInterval
    features.rr_previous = this.rrPrevInterval

    const delta = Math.abs(rrInterval - this.rrPrevInterval)
    features.rr_delta = delta

    this.rrHistory[this.rrHistoryIndex] = rrInterval
    this.rrHistoryIndex = (this.rrHistoryIndex + 1) % RR_HISTORY_LENGTH
    if (this.rrHistoryCount < RR_HISTORY_LENGTH) this.rrHistoryCount++

    this.rrPrevInterval = rrInterval

    if (this.rrHistoryCount < 2) {
      features.rr_mean = rrInterval
      features.rr_std = 0
      features.rr_cv = 0
      features.rr_range = 0
      features.rr_irregularity = 0
      return
    }

    let rrSum = 0, rrMin = 32767, rrMax = 0
    for (let i = 0; i < this.rrHistoryCount; i++) {
      rrSum += this.rrHistory[i]
      if (this.rrHistory[i] < rrMin) rrMin = this.rrHistory[i]
      if (this.rrHistory[i] > rrMax) rrMax = this.rrHistory[i]
    }

    const rrMean = Math.round(rrSum / this.rrHistoryCount)
    features.rr_mean = rrMean
    features.rr_range = rrMax - rrMin

    let rrVarSum = 0, sd1Sum = 0
    for (let i = 0; i < this.rrHistoryCount; i++) {
      const d = this.rrHistory[i] - rrMean
      rrVarSum += d * d
    }
    for (let i = 1; i < this.rrHistoryCount; i++) {
      const successiveDiff = this.rrHistory[i] - this.rrHistory[i - 1]
      sd1Sum += successiveDiff * successiveDiff
    }

    features.rr_std = isqrt32(Math.round(rrVarSum / this.rrHistoryCount))
    features.rr_irregularity = isqrt32(Math.round(sd1Sum / (2 * (this.rrHistoryCount - 1))))
    features.rr_cv = rrMean > 0 ? Math.round((features.rr_std * 100) / rrMean) : 0
  }

  // Detect P-wave crossings (firmware logic from QRS_algorithm.c lines 282-352)
  detectCrossings(buffer, startIndex, count, bufferLength) {
    let min = 32767, max = -32768
    let idx = startIndex
    for (let i = 0; i < count; i++) {
      if (buffer[idx] > max) max = buffer[idx]
      if (buffer[idx] < min) min = buffer[idx]
      idx = (idx + 1) % bufferLength
    }

    const threshold = min + Math.round((8 * (max - min)) / 10)

    let crossingCount = 0
    let state = 0 // 0=PRIME, 1=FINDING_CROSSING, 2=SCROLL_CROSSING
    idx = startIndex
    for (let i = 0; i < count; i++) {
      const val = buffer[idx]
      switch (state) {
        case 0: // PRIME - wait for signal below threshold
          if (val <= threshold) state = 1
          break
        case 1: // FINDING_CROSSING
          if (val > threshold) { crossingCount++; state = 2 }
          break
        case 2: // SCROLL_CROSSING - wait for below
          if (val <= threshold) state = 1
          break
      }
      idx = (idx + 1) % bufferLength
    }

    const totalCrossings = crossingCount + 1
    return {
      crossings: totalCrossings,
      threshold,
      abnormal: totalCrossings !== BASE_LINE_NORMAL ? 1 : 0,
      ok: totalCrossings === BASE_LINE_NORMAL ? 1 : 0
    }
  }

  reset() {
    this.rrHistory.fill(0)
    this.rrHistoryIndex = 0
    this.rrHistoryCount = 0
    this.rrPrevInterval = 0
  }
}
