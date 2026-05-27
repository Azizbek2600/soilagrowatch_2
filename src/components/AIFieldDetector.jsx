import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import './AIFieldDetector.css'

export default function AIFieldDetector({ instanceRef, onClose, onConfirm }) {
  const [step,     setStep]     = useState('input') // input | loading | result | notfound
  const [lat,      setLat]      = useState('')
  const [lng,      setLng]      = useState('')
  const [locating, setLocating] = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState(null)
  const previewRef = useRef(null)

  function clearPreview() {
    if (previewRef.current && instanceRef?.current) {
      try { instanceRef.current.removeLayer(previewRef.current) } catch {}
      previewRef.current = null
    }
  }

  // Cleanup preview layer on unmount
  useEffect(() => () => clearPreview(), []) // eslint-disable-line

  // Escape closes modal
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function handleLocate() {
    if (!navigator.geolocation) { setError("Geolokatsiya qo'llab-quvvatlanmaydi"); return }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => { setError("Joylashuv aniqlanmadi"); setLocating(false) },
      { timeout: 8000 }
    )
  }

  async function handleDetect() {
    const la = parseFloat(lat)
    const lo = parseFloat(lng)
    if (isNaN(la) || isNaN(lo)) { setError("To'g'ri koordinat kiriting"); return }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) {
      setError("Koordinatlar diapazoni noto'g'ri"); return
    }

    setError('')
    setStep('loading')
    clearPreview()

    try {
      const res  = await fetch('/api/detect-field', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lat: la, lng: lo }),
        signal:  AbortSignal.timeout(55000),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Server xatosi')

      if (!data.found) {
        setResult(data)
        setStep('notfound')
        return
      }

      setResult(data)
      setStep('result')

      // Preview polygon on the main map
      if (instanceRef?.current && data.polygon?.length) {
        const latlngs = data.polygon.map(([lo, la]) => [la, lo])
        const layer   = L.polygon(latlngs, {
          color: '#22c55e', fillColor: '#22c55e',
          fillOpacity: 0.2, weight: 2.5, dashArray: '7 4',
        }).addTo(instanceRef.current)
        previewRef.current = layer
        instanceRef.current.fitBounds(layer.getBounds(), { padding: [50, 50] })
      }
    } catch (err) {
      setError(err.name === 'TimeoutError' ? "So'rov vaqti tugadi. Qaytadan urining." : err.message)
      setStep('input')
    }
  }

  function handleConfirm() {
    if (!result?.polygon) return
    clearPreview()
    onConfirm({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [result.polygon] },
        properties: { area_ha: result.area_ha, ndvi_avg: result.ndvi_avg, source: 'AI' },
      }],
    })
  }

  function handleRetry() {
    clearPreview()
    setResult(null)
    setError('')
    setStep('input')
  }

  return (
    <div className="afd-backdrop" onClick={onClose}>
      <div className="afd-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="afd-header">
          <div className="afd-title">
            <i className="ti ti-sparkles afd-sparkle" />
            AI Dala Aniqlash
          </div>
          <button className="afd-close" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ── INPUT ── */}
        {step === 'input' && (
          <div className="afd-body">
            <p className="afd-desc">
              Koordinat kiriting — AI dalangizni avtomatik topadi
            </p>

            <div className="afd-grid">
              <div className="afd-field">
                <label className="afd-label">Kenglik (Latitude)</label>
                <input
                  className="afd-input"
                  type="number" step="0.0001" placeholder="41.2995"
                  value={lat}
                  onChange={e => { setLat(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleDetect()}
                />
              </div>
              <div className="afd-field">
                <label className="afd-label">Uzunlik (Longitude)</label>
                <input
                  className="afd-input"
                  type="number" step="0.0001" placeholder="69.2401"
                  value={lng}
                  onChange={e => { setLng(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleDetect()}
                />
              </div>
            </div>

            <button className="afd-locate-btn" onClick={handleLocate} disabled={locating}>
              {locating
                ? <><span className="afd-dot" /> Aniqlanmoqda...</>
                : <><i className="ti ti-current-location" /> Joriy joylashuvimdan foydalanish</>
              }
            </button>

            {error && (
              <div className="afd-error">
                <i className="ti ti-alert-circle" /> {error}
              </div>
            )}

            <button
              className="afd-detect-btn"
              onClick={handleDetect}
              disabled={!lat || !lng}
            >
              <i className="ti ti-sparkles" /> Dalani Top
            </button>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div className="afd-body afd-loading">
            <div className="afd-pulse-ring">
              <span />
              <span />
              <span />
            </div>
            <div className="afd-loading-title">AI dalani qidiryapti...</div>
            <div className="afd-loading-sub">
              Sentinel-2 sun'iy yo'ldosh ma'lumotlari tahlil qilinmoqda
              <br />Taxminan 20–40 soniya
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === 'result' && result && (
          <div className="afd-body">
            <div className="afd-found-badge">
              <i className="ti ti-circle-check" /> Dala topildi!
            </div>

            <div className="afd-stats">
              <div className="afd-stat">
                <span className="afd-stat-val">{Number(result.area_ha).toFixed(2)}</span>
                <span className="afd-stat-lbl">ga maydon</span>
              </div>
              <div className="afd-stat-sep" />
              <div className="afd-stat">
                <span className="afd-stat-val afd-stat-val--green">
                  {Number(result.ndvi_avg).toFixed(3)}
                </span>
                <span className="afd-stat-lbl">NDVI o'rtacha</span>
              </div>
            </div>

            <p className="afd-confirm-q">Bu dala to'g'rimi?</p>

            <div className="afd-actions">
              <button className="afd-btn afd-btn--primary" onClick={handleConfirm}>
                <i className="ti ti-check" /> Ha, tahlil qil
              </button>
              <button className="afd-btn afd-btn--ghost" onClick={handleRetry}>
                <i className="ti ti-refresh" /> Yo'q, qaytadan
              </button>
            </div>
          </div>
        )}

        {/* ── NOT FOUND ── */}
        {step === 'notfound' && (
          <div className="afd-body afd-notfound">
            <i className="ti ti-map-off afd-notfound-icon" />
            <div className="afd-notfound-title">Dala topilmadi</div>
            <div className="afd-notfound-sub">{result?.message}</div>
            <button className="afd-btn afd-btn--ghost afd-btn--full" onClick={handleRetry}>
              <i className="ti ti-refresh" /> Qaytadan urinish
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
