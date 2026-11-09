import { type FormEvent, useEffect, useRef, useState } from 'react'
import { CODES } from './tag36h11'

type Detection = { id: number; corners: { x: number; y: number }[]; center: { x: number; y: number } }

const FRAME_MS = 125 // ~8 fps
const MAX_WIDTH = 960 // detector decimates anyway; smaller frames keep the main thread light

/** Ids that may fire now. Every sighting refreshes the clock, so a badge held in view fires once, not every 4s. */
export function freshIds(ids: number[], lastSeen: Map<number, number>, now: number, quietMs = 4000) {
  const unique = [...new Set(ids)]
  const fresh = unique.filter((id) => now - (lastSeen.get(id) ?? -Infinity) >= quietMs)
  unique.forEach((id) => lastSeen.set(id, now))
  return fresh
}

/** RGBA -> luma (BT.601, integer math). */
export function toGray(rgba: Uint8ClampedArray) {
  const gray = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8
  return gray
}

export const announcement = (ids: number[]) =>
  `Caught badge${ids.length > 1 ? 's' : ''} ${new Intl.ListFormat('en').format(ids.map(String))}`

let audio: AudioContext | undefined
function feedback() {
  navigator.vibrate?.(80)
  try {
    audio ??= new AudioContext()
    void audio.resume()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.1
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.12)
  } catch { /* audio is a nicety; never block a catch */ }
}

function drawOutlines(canvas: HTMLCanvasElement, found: Detection[]) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  Object.assign(ctx, { lineWidth: 4, strokeStyle: '#22c55e', fillStyle: '#22c55e', font: 'bold 24px system-ui', textAlign: 'center' })
  for (const { id, corners, center } of found) {
    ctx.beginPath()
    corners.forEach(({ x, y }) => ctx.lineTo(x, y))
    ctx.closePath()
    ctx.stroke()
    ctx.fillText(String(id), center.x, center.y + 8)
  }
}

export function Scanner({ onCatch }: { onCatch: (tagIds: number[]) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const latest = useRef(onCatch)
  latest.current = onCatch // keep the newest callback without restarting the camera
  const [error, setError] = useState<string>()
  const [said, setSaid] = useState('')
  const [manual, setManual] = useState('')

  // Only touches refs and state setters, so the effect's first-render copy stays correct.
  const fire = (ids: number[]) => {
    feedback()
    setSaid(announcement(ids))
    latest.current(ids)
  }

  useEffect(() => {
    const worker = new Worker('/apriltag/worker.js')
    const frame = document.createElement('canvas')
    const ctx = frame.getContext('2d', { willReadFrequently: true })!
    const lastSeen = new Map<number, number>()
    let stream: MediaStream | undefined
    let timer = 0
    let busy = false
    let stopped = false

    worker.onmessage = ({ data }: MessageEvent<Detection[]>) => {
      busy = false
      if (overlay.current) drawOutlines(overlay.current, data)
      const ids = freshIds(data.map((d) => d.id), lastSeen, Date.now())
      if (ids.length) fire(ids)
    }

    const tick = () => {
      const v = video.current
      if (busy || !v?.videoWidth) return // skip frames while the worker is still thinking
      const scale = Math.min(1, MAX_WIDTH / v.videoWidth)
      const width = Math.round(v.videoWidth * scale)
      const height = Math.round(v.videoHeight * scale)
      if (frame.width !== width || frame.height !== height) Object.assign(frame, { width, height })
      if (overlay.current && overlay.current.width !== width) Object.assign(overlay.current, { width, height })
      ctx.drawImage(v, 0, 0, width, height)
      const gray = toGray(ctx.getImageData(0, 0, width, height).data)
      busy = true
      worker.postMessage({ gray, width, height }, [gray.buffer])
    }

    // Wrapped in a promise so a missing mediaDevices (http, old browsers) lands in .catch too.
    Promise.resolve()
      .then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }))
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        video.current!.srcObject = s
        timer = window.setInterval(tick, FRAME_MS)
      })
      .catch((e: unknown) =>
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or type the badge number below.'
            : 'No camera available. Type the badge number below.',
        ),
      )

    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      worker.terminate()
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = Number(manual)
    if (!Number.isInteger(id) || id < 0 || id >= CODES.length) return
    fire([id])
    setManual('')
  }

  return (
    <section>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <video ref={video} autoPlay muted playsInline style={{ width: '100%', display: 'block' }} />
          <canvas ref={overlay} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>
      )}
      <form onSubmit={submit} style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'end' }}>
        <label>
          Enter badge number
          <input type="number" inputMode="numeric" min={0} max={CODES.length - 1} required value={manual}
            onChange={(e) => setManual(e.target.value)} style={{ display: 'block' }} />
        </label>
        <button type="submit">Catch</button>
      </form>
      <p aria-live="polite">{said}</p>
    </section>
  )
}
