import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import { t } from '../i18n'
import './AIFieldDetector.css'

export default function AIFieldDetector({ instanceRef, onClose, onConfirm, lang }) {
  const [step,     setStep]     = useState('input') // input | loading | result | notfound
  const [lat,      setLat]      = useState('')
  const [lng,      setLng]      = useState('')
  const [locating, setLocating] = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState(null)
  const previewRef = useRef(null)
  const activeLang = lang ?? 'uz'

  function clearPreview() {
    if (previewRef.current && instanceRef?.current) {
      try { instanceRef.current.removeLayer(previewRef.current) } catch {}
      previewRef.current = null
    }
  }

  useEffect(() => () => clearPreview(), []) // eslint-disable-line

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function handleLocate() {
    if (!navigator.geolocation) { setError(t(activeLang, 'geoNotSupported')); return }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => { setError(t(activeLang, 'locationFailed')); setLocating(false) },
      { timeout: 8000 }
    )
  }

  async function handleDetect() {
    const la = parseFloat(lat)
    const lo = parseFloat(lng)
    if (isNaN(la) || isNaN(lo)) { setError(t(activeLang, 'invalidCoords')); return }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) {
      setError(t(activeLang, 'coordsOutOfRange')); return
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

      if (!res.ok) throw new Error(data.error || t(activeLang, 'serverError'))

      if (!data.found) {
        setResult(data)
        setStep('notfound')
        return
      }

      setResult(data)
      setStep('result')

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
      setError(err.name === 'TimeoutError' ? t(activeLang, 'requestTimeout') : err.message)
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
            {t(activeLang, 'aiDetectTitle')}
          </div>
          <button className="afd-close" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ── INPUT ── */}
        {step === 'input' && (
          <div className="afd-body">
            <p className="afd-desc">{t(activeLang, 'aiDetectDesc')}</p>

            <div className="afd-grid">
              <div className="afd-field">
                <label className="afd-label">{t(activeLang, 'latitudeLabel')}</label>
                <input
                  className="afd-input"
                  type="number" step="0.0001" placeholder="41.2995"
                  value={lat}
                  onChange={e => { setLat(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleDetect()}
                />
              </div>
              <div className="afd-field">
                <label className="afd-label">{t(activeLang, 'longitudeLabel')}</label>
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
                ? <><span className="afd-dot" /> {t(activeLang, 'locatingText')}</>
                : <><i className="ti ti-current-location" /> {t(activeLang, 'useCurrentLocation')}</>
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
              <i className="ti ti-sparkles" /> {t(activeLang, 'detectBtn')}
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
            <div className="afd-loading-title">{t(activeLang, 'aiSearching')}</div>
            <div className="afd-loading-sub">
              {t(activeLang, 'analyzingSatellite')}
              <br />{t(activeLang, 'approxTime')}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === 'result' && result && (
          <div className="afd-body">
            <div className="afd-found-badge">
              <i className="ti ti-circle-check" /> {t(activeLang, 'fieldFound')}
            </div>

            <div className="afd-stats">
              <div className="afd-stat">
                <span className="afd-stat-val">{Number(result.area_ha).toFixed(2)}</span>
                <span className="afd-stat-lbl">{t(activeLang, 'areaHaLabel')}</span>
              </div>
              <div className="afd-stat-sep" />
              <div className="afd-stat">
                <span className="afd-stat-val afd-stat-val--green">
                  {Number(result.ndvi_avg).toFixed(3)}
                </span>
                <span className="afd-stat-lbl">{t(activeLang, 'ndviAvgLabel')}</span>
              </div>
            </div>

            <p className="afd-confirm-q">{t(activeLang, 'isFieldCorrect')}</p>

            <div className="afd-actions">
              <button className="afd-btn afd-btn--primary" onClick={handleConfirm}>
                <i className="ti ti-check" /> {t(activeLang, 'confirmAnalyze')}
              </button>
              <button className="afd-btn afd-btn--ghost" onClick={handleRetry}>
                <i className="ti ti-refresh" /> {t(activeLang, 'noRetry')}
              </button>
            </div>
          </div>
        )}

        {/* ── NOT FOUND ── */}
        {step === 'notfound' && (
          <div className="afd-body afd-notfound">
            <i className="ti ti-map-off afd-notfound-icon" />
            <div className="afd-notfound-title">{t(activeLang, 'fieldNotFound')}</div>
            <div className="afd-notfound-sub">{result?.message}</div>
            <button className="afd-btn afd-btn--ghost afd-btn--full" onClick={handleRetry}>
              <i className="ti ti-refresh" /> {t(activeLang, 'retryBtn')}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
