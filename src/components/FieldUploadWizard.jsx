import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import shp from 'shpjs'
import { kml } from '@tmcw/togeojson'
import './FieldUploadWizard.css'

// ─── Pure JS geodesic area (m² → ha) ─────────────
function calcGeoJsonHa(geojson) {
  const R = 6371008.8
  let total = 0
  for (const f of (geojson.features || [])) {
    if (!f.geometry) continue
    const polys = f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates
      : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : []
    for (const poly of polys) {
      const ring = poly[0]
      let area = 0
      for (let i = 0; i < ring.length; i++) {
        const [lng1, lat1] = ring[i].map(x => x * Math.PI / 180)
        const [lng2, lat2] = ring[(i + 1) % ring.length].map(x => x * Math.PI / 180)
        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2))
      }
      total += Math.abs(area * R * R / 2)
    }
  }
  return total / 10000
}

function normaliseFc(raw) {
  if (!raw) return null
  if (Array.isArray(raw)) {
    return { type: 'FeatureCollection', features: raw.flatMap(r => r.features || []) }
  }
  if (raw.type === 'FeatureCollection') return raw
  if (raw.type === 'Feature') return { type: 'FeatureCollection', features: [raw] }
  if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: raw, properties: {} }] }
  }
  return null
}

// ─── Main component ───────────────────────────────
export default function FieldUploadWizard({ onClose, onConfirm }) {
  const [step,       setStep]       = useState(1)
  const [fileName,   setFileName]   = useState('')
  const [geojson,    setGeojson]    = useState(null)
  const [totalHa,    setTotalHa]    = useState(0)
  const [polyCount,  setPolyCount]  = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [error,      setError]      = useState(null)
  const [parsing,    setParsing]    = useState(false)

  const previewMapRef  = useRef(null)
  const mapInstanceRef = useRef(null)

  // Escape to close
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // ── Parse uploaded file ──────────────────────────
  const parseFile = useCallback(async (file) => {
    setError(null)
    setParsing(true)
    setFileName(file.name)
    const ext = file.name.split('.').pop().toLowerCase()

    try {
      let raw
      if (ext === 'geojson' || ext === 'json') {
        raw = JSON.parse(await file.text())
      } else if (ext === 'shp' || ext === 'zip') {
        raw = await shp(await file.arrayBuffer())
      } else if (ext === 'kml') {
        const dom = new DOMParser().parseFromString(await file.text(), 'text/xml')
        raw = kml(dom)
      } else {
        throw new Error("Qo'llab-quvvatlanmagan format (.geojson .shp .zip .kml)")
      }

      const fc = normaliseFc(raw)
      if (!fc) throw new Error("GeoJSON/FeatureCollection o'qib bo'lmadi")

      const polys = fc.features.filter(
        f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
      )
      if (!polys.length) throw new Error('Fayl ichida polygon geometriyasi topilmadi')

      const clean = { type: 'FeatureCollection', features: polys }
      setGeojson(clean)
      setPolyCount(polys.length)
      setTotalHa(calcGeoJsonHa(clean))
      setStep(2)
    } catch (e) {
      setError(e.message || "Fayl o'qishda xato")
    } finally {
      setParsing(false)
    }
  }, [])

  // ── Drag & drop handlers ─────────────────────────
  const onDragOver  = e => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = ()  => setIsDragging(false)
  const onDrop      = e => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) parseFile(f)
  }
  const onFileInput = e => { if (e.target.files[0]) parseFile(e.target.files[0]) }

  // ── Preview Leaflet map (step 2) ─────────────────
  useEffect(() => {
    if (step !== 2 || !previewMapRef.current || !geojson) return

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(previewMapRef.current, {
      zoomControl: true,
      attributionControl: false,
    })
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    ).addTo(map)

    const gjLayer = L.geoJSON(geojson, {
      style: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2.5 },
    }).addTo(map)

    const bounds = gjLayer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] })

    mapInstanceRef.current = map
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [step, geojson])

  // ── Step 3: confirm ──────────────────────────────
  function handleConfirm() {
    setStep(3)
    setTimeout(() => onConfirm(geojson), 900)
  }

  function resetToStep1() {
    setStep(1)
    setGeojson(null)
    setError(null)
    setFileName('')
  }

  return (
    <div className="wiz-backdrop" onClick={onClose}>
      <div className="wiz-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="wiz-header">
          <div className="wiz-title">
            <span className="wiz-title-icon">📁</span>
            Dala faylini yuklash
          </div>
          <button className="wiz-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Step bar ── */}
        <div className="wiz-steps">
          {['Yuklash', "Ko'rib chiqish", 'Tasdiqlash'].map((label, i) => {
            const n = i + 1
            return (
              <div key={n} className={`wiz-step${step > n ? ' wiz-step--past' : step === n ? ' wiz-step--active' : ''}`}>
                <div className="wiz-step-dot">{step > n ? '✓' : n}</div>
                <span className="wiz-step-label">{label}</span>
                {n < 3 && <div className="wiz-step-line"/>}
              </div>
            )
          })}
        </div>

        {/* ── Body ── */}
        <div className="wiz-body">

          {/* STEP 1 — Upload */}
          {step === 1 && (
            <div className="wiz-upload">
              <div
                className={`wiz-drop${isDragging ? ' wiz-drop--active' : ''}${parsing ? ' wiz-drop--parsing' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {parsing ? (
                  <>
                    <div className="wiz-spinner"/>
                    <span className="wiz-drop-title">Fayl tahlillanmoqda...</span>
                  </>
                ) : (
                  <>
                    <div className="wiz-drop-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <div className="wiz-drop-title">
                      {isDragging ? 'Qo\'yib yuboring...' : "Faylni bu yerga tashlang"}
                    </div>
                    <div className="wiz-drop-sub">yoki</div>
                    <label className="wiz-drop-btn">
                      Fayl tanlash
                      <input
                        type="file"
                        accept=".geojson,.json,.shp,.zip,.kml"
                        style={{ display: 'none' }}
                        onChange={onFileInput}
                      />
                    </label>
                    <div className="wiz-drop-formats">
                      .geojson &nbsp;·&nbsp; .shp &nbsp;·&nbsp; .zip &nbsp;·&nbsp; .kml
                    </div>
                  </>
                )}
              </div>
              {error && <div className="wiz-error">⚠️ {error}</div>}
            </div>
          )}

          {/* STEP 2 — Preview */}
          {step === 2 && (
            <div className="wiz-preview">
              <div ref={previewMapRef} className="wiz-preview-map"/>

              <div className="wiz-stats">
                <div className="wiz-stat">
                  <span className="wiz-stat-val">{polyCount}</span>
                  <span className="wiz-stat-lbl">Polygon</span>
                </div>
                <div className="wiz-stat">
                  <span className="wiz-stat-val">{totalHa.toFixed(2)}</span>
                  <span className="wiz-stat-lbl">Gektar</span>
                </div>
                <div className="wiz-stat wiz-stat--file">
                  <span className="wiz-stat-file-name">📄 {fileName}</span>
                </div>
              </div>

              <div className="wiz-preview-actions">
                <button className="wiz-btn wiz-btn--ghost" onClick={resetToStep1}>
                  ◀ Qayta yuklash
                </button>
                <button className="wiz-btn wiz-btn--primary" onClick={handleConfirm}>
                  Bu to'g'ri →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Success */}
          {step === 3 && (
            <div className="wiz-success">
              <div className="wiz-success-icon">✅</div>
              <div className="wiz-success-title">Muvaffaqiyatli!</div>
              <div className="wiz-success-sub">
                {polyCount} polygon Dala xaritasiga qo'shildi.<br/>
                GEE tahlil boshlanmoqda...
              </div>
              <div className="wiz-spinner wiz-spinner--large"/>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
