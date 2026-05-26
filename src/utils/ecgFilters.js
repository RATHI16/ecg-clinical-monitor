// Digital filters matching the SAME54 firmware implementation

// 50Hz FIR notch filter coefficients (matched to firmware)
const FIR_50HZ_TAPS = [
  -0.0033, -0.0046, -0.0067, -0.0083, -0.0082, -0.0054, 0.0,
  0.0072, 0.0148, 0.0210, 0.0236, 0.0210, 0.0148, 0.0072,
  0.0, -0.0054, -0.0082, -0.0083, -0.0067, -0.0046, -0.0033
]

// 60Hz FIR notch filter coefficients
const FIR_60HZ_TAPS = [
  -0.0029, -0.0041, -0.0060, -0.0075, -0.0075, -0.0049, 0.0,
  0.0066, 0.0136, 0.0193, 0.0217, 0.0193, 0.0136, 0.0066,
  0.0, -0.0049, -0.0075, -0.0075, -0.0060, -0.0041, -0.0029
]

export class ECGFilter {
  constructor() {
    this.buffer50Hz = new Array(FIR_50HZ_TAPS.length).fill(0)
    this.buffer60Hz = new Array(FIR_60HZ_TAPS.length).fill(0)
    this.offsetBuffer = new Array(256).fill(0)
    this.offsetIndex = 0
    this.offsetSum = 0
  }

  offsetCorrection(sample) {
    this.offsetSum -= this.offsetBuffer[this.offsetIndex]
    this.offsetBuffer[this.offsetIndex] = sample
    this.offsetSum += sample
    this.offsetIndex = (this.offsetIndex + 1) % this.offsetBuffer.length
    return sample - Math.round(this.offsetSum / this.offsetBuffer.length)
  }

  filter50Hz(sample) {
    this.buffer50Hz.shift()
    this.buffer50Hz.push(sample)
    let output = 0
    for (let i = 0; i < FIR_50HZ_TAPS.length; i++) {
      output += this.buffer50Hz[i] * FIR_50HZ_TAPS[i]
    }
    return Math.round(output)
  }

  filter60Hz(sample) {
    this.buffer60Hz.shift()
    this.buffer60Hz.push(sample)
    let output = 0
    for (let i = 0; i < FIR_60HZ_TAPS.length; i++) {
      output += this.buffer60Hz[i] * FIR_60HZ_TAPS[i]
    }
    return Math.round(output)
  }

  toMillivolts(sample) {
    return (sample * 33000) / 20480
  }

  reset() {
    this.buffer50Hz.fill(0)
    this.buffer60Hz.fill(0)
    this.offsetBuffer.fill(0)
    this.offsetIndex = 0
    this.offsetSum = 0
  }
}

export function calculateSNR(rawSignal, filteredSignal) {
  if (rawSignal.length !== filteredSignal.length || rawSignal.length === 0) return 0

  let signalPower = 0
  let noisePower = 0
  const len = rawSignal.length

  for (let i = 0; i < len; i++) {
    signalPower += filteredSignal[i] * filteredSignal[i]
    const noise = rawSignal[i] - filteredSignal[i]
    noisePower += noise * noise
  }

  signalPower /= len
  noisePower /= len

  if (noisePower === 0) return 100
  return 10 * Math.log10(signalPower / noisePower)
}
