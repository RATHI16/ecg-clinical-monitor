import React, { useRef, useEffect, useState, useCallback } from 'react'

const GRID_COLOR = 'rgba(0, 200, 200, 0.06)'
const GRID_COLOR_MAJOR = 'rgba(0, 200, 200, 0.12)'
const TRACE_COLORS = {
  raw: '#00e5ff',
  filtered: '#00e676',
  mV: '#76ff03',
  pWave: '#ff9100',
  pWaveThreshold: '#ff1744'
}

export default function ECGChart({ ecgData, filter, onFilterChange }) {
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const [activeTrace, setActiveTrace] = useState('filtered')
  const [showPWave, setShowPWave] = useState(true)
  const [speed, setSpeed] = useState(25) // mm/s
  const [gain, setGain] = useState(10) // mm/mV

  const drawGrid = useCallback((ctx, width, height) => {
    const smallGrid = 5
    const largeGrid = 25

    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 0.5
    for (let x = 0; x < width; x += smallGrid) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y < height; y += smallGrid) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    ctx.strokeStyle = GRID_COLOR_MAJOR
    ctx.lineWidth = 0.8
    for (let x = 0; x < width; x += largeGrid) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y < height; y += largeGrid) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }, [])

  const drawTrace = useCallback((ctx, data, width, height, color, lineWidth = 2) => {
    if (!data || data.length === 0) return

    const len = data.length
    const visibleSamples = Math.min(len, Math.floor(width * 2))
    const startIdx = len - visibleSamples

    // Auto-scale
    let min = Infinity, max = -Infinity
    for (let i = startIdx; i < len; i++) {
      if (data[i] < min) min = data[i]
      if (data[i] > max) max = data[i]
    }
    const range = max - min || 1
    const padding = range * 0.1
    const scaleMin = min - padding
    const scaleMax = max + padding
    const scaleRange = scaleMax - scaleMin

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Add glow effect
    ctx.shadowColor = color
    ctx.shadowBlur = 4

    for (let i = 0; i < visibleSamples; i++) {
      const x = (i / visibleSamples) * width
      const y = height - ((data[startIdx + i] - scaleMin) / scaleRange) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }, [])

  const drawScaleBar = useCallback((ctx, width, height) => {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)'
    ctx.font = '11px JetBrains Mono, monospace'

    // Time scale
    ctx.fillText(`${speed} mm/s`, width - 80, height - 10)

    // Voltage calibration bar
    const barHeight = 50
    const barX = 15
    const barY = height / 2 - barHeight / 2

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(barX, barY)
    ctx.lineTo(barX, barY + barHeight)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(barX - 4, barY)
    ctx.lineTo(barX + 4, barY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(barX - 4, barY + barHeight)
    ctx.lineTo(barX + 4, barY + barHeight)
    ctx.stroke()

    ctx.fillText('1 mV', barX + 8, barY + barHeight / 2 + 4)
  }, [speed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const render = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      const width = rect.width
      const height = rect.height

      // Clear
      ctx.fillStyle = '#0a0e1a'
      ctx.fillRect(0, 0, width, height)

      // Draw grid
      drawGrid(ctx, width, height)

      // Draw main ECG trace
      const mainData = activeTrace === 'raw' ? ecgData.raw :
                       activeTrace === 'mV' ? ecgData.mV : ecgData.filtered
      drawTrace(ctx, mainData, width, height * 0.65, TRACE_COLORS[activeTrace])

      // Draw P-wave trace in lower section
      if (showPWave) {
        ctx.save()
        ctx.translate(0, height * 0.65)
        const pHeight = height * 0.35

        ctx.fillStyle = 'rgba(10, 14, 26, 0.8)'
        ctx.fillRect(0, 0, width, pHeight)

        // Separator line
        ctx.strokeStyle = 'rgba(0, 200, 200, 0.2)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(width, 0)
        ctx.stroke()

        // P-wave label
        ctx.fillStyle = 'rgba(255, 145, 0, 0.8)'
        ctx.font = '10px JetBrains Mono, monospace'
        ctx.fillText('P-WAVE ANALYSIS', 10, 14)

        drawTrace(ctx, ecgData.pWave, width, pHeight, TRACE_COLORS.pWave, 1.5)
        drawTrace(ctx, ecgData.pWaveThreshold, width, pHeight, TRACE_COLORS.pWaveThreshold, 1)

        ctx.restore()
      }

      // Scale bar
      drawScaleBar(ctx, width, showPWave ? height * 0.65 : height)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [ecgData, activeTrace, showPWave, drawGrid, drawTrace, drawScaleBar])

  return (
    <div className="ecg-chart-container">
      <div className="ecg-chart-toolbar">
        <div className="trace-selector">
          <button
            className={`trace-btn ${activeTrace === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTrace('raw')}
            style={{ '--btn-color': TRACE_COLORS.raw }}
          >
            Raw
          </button>
          <button
            className={`trace-btn ${activeTrace === 'filtered' ? 'active' : ''}`}
            onClick={() => setActiveTrace('filtered')}
            style={{ '--btn-color': TRACE_COLORS.filtered }}
          >
            Filtered
          </button>
          <button
            className={`trace-btn ${activeTrace === 'mV' ? 'active' : ''}`}
            onClick={() => setActiveTrace('mV')}
            style={{ '--btn-color': TRACE_COLORS.mV }}
          >
            mV
          </button>
        </div>

        <div className="filter-selector">
          <span className="filter-label">Notch:</span>
          <button
            className={`filter-btn ${filter === 0 ? 'active' : ''}`}
            onClick={() => onFilterChange(0)}
          >
            OFF
          </button>
          <button
            className={`filter-btn ${filter === 1 ? 'active' : ''}`}
            onClick={() => onFilterChange(1)}
          >
            50Hz
          </button>
          <button
            className={`filter-btn ${filter === 2 ? 'active' : ''}`}
            onClick={() => onFilterChange(2)}
          >
            60Hz
          </button>
        </div>

        <div className="chart-controls">
          <button
            className={`pwave-toggle ${showPWave ? 'active' : ''}`}
            onClick={() => setShowPWave(!showPWave)}
          >
            P-Wave
          </button>
          <select
            className="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={12.5}>12.5 mm/s</option>
            <option value={25}>25 mm/s</option>
            <option value={50}>50 mm/s</option>
          </select>
        </div>
      </div>

      <canvas ref={canvasRef} className="ecg-canvas" />

      <div className="ecg-chart-legend">
        <span className="legend-item" style={{ color: TRACE_COLORS[activeTrace] }}>
          ● Lead II
        </span>
        {showPWave && (
          <>
            <span className="legend-item" style={{ color: TRACE_COLORS.pWave }}>
              ● P-Wave
            </span>
            <span className="legend-item" style={{ color: TRACE_COLORS.pWaveThreshold }}>
              ● Threshold
            </span>
          </>
        )}
      </div>
    </div>
  )
}
