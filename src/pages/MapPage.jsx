import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { useFields } from '../hooks/useFields'
import FieldListPanel    from '../components/panels/FieldListPanel'
import FieldDetailsPanel from '../components/panels/FieldDetailsPanel'
import MapControls       from '../components/map/MapControls'
import DrawInstructions  from '../components/map/DrawInstructions'
import DrawControl       from '../components/map/DrawControl'
import '../styles/leaflet-draw-custom.css'
import './MapPage.css'

// ── Tile sources ──
const TILES = {
  satellite: {
    url:  'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attr: '© Google',
    options: { subdomains: '0123', maxZoom: 21 },
  },
  street: {
    url:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap contributors',
  },
  terrain: {
    url:  'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '© OpenTopoMap contributors',
  },
}

const FIELD_STYLE = {
  color: '#2D5F3F', fillColor: '#2D5F3F',
  fillOpacity: 0.25, weight: 2.5, opacity: 1,
}
const FIELD_STYLE_ACTIVE = {
  color: '#F59E0B', fillColor: '#F59E0B',
  fillOpacity: 0.32, weight: 3, opacity: 1,
}

// ── Toast helper ──
let _toastId = 0
function makeToast(msg, type) {
  return { id: ++_toastId, msg, type }
}

export default function MapPage({ onTabChange }) {
  const mapElRef       = useRef(null)
  const mapRef         = useRef(null)
  const tileLayersRef  = useRef({})
  const fieldLayersRef = useRef({})
  const drawnRef       = useRef(null)
  const drawCtrlRef    = useRef(null)   // DrawControl instance

  const [basemap,       setBasemap]       = useState('satellite')
  const [overlays,      setOverlays]      = useState({ degradation: false, ndvi: false })
  const [panelLeft,     setPanelLeft]     = useState(true)
  const [selectedField, setSelectedField] = useState(null)

  // Draw flow: 'idle' | 'instructions' | 'drawing' | 'saving'
  const [drawStep,     setDrawStep]     = useState('idle')
  const [vertexCount,  setVertexCount]  = useState(0)
  const [drawnGeoJSON, setDrawnGeoJSON] = useState(null)
  const [drawnAreaHa,  setDrawnAreaHa]  = useState(0)
  const [fieldName,    setFieldName]    = useState('')
  const [saving,       setSaving]       = useState(false)

  // Toasts
  const [toasts, setToasts] = useState([])

  const { fields, loading, addField, deleteField } = useFields()

  // ─────────────────────────────────────────
  // Toast helper
  // ─────────────────────────────────────────
  const addToast = useCallback((msg, type = 'info') => {
    const t = makeToast(msg, type)
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
  }, [])

  // ─────────────────────────────────────────
  // Init Leaflet map (once)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return

    const map = L.map(mapElRef.current, {
      center: [42.85, 60.08],
      zoom: 12,
      zoomControl: false,
      preferCanvas: true,
    })

    const layerObjs = {}
    Object.entries(TILES).forEach(([id, cfg]) => {
      layerObjs[id] = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: 21, ...(cfg.options ?? {}) })
    })
    tileLayersRef.current = layerObjs
    layerObjs.satellite.addTo(map)

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnRef.current = drawnItems

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ─────────────────────────────────────────
  // Switch basemap
  // ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.entries(tileLayersRef.current).forEach(([id, layer]) => {
      if (id === basemap) { if (!map.hasLayer(layer)) map.addLayer(layer) }
      else                { if (map.hasLayer(layer))  map.removeLayer(layer) }
    })
  }, [basemap])

  // ─────────────────────────────────────────
  // Render field polygons on map
  // ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.values(fieldLayersRef.current).forEach(l => map.removeLayer(l))
    fieldLayersRef.current = {}

    fields.forEach(field => {
      if (!field.geojson) return
      const isActive = selectedField?.id === field.id
      const layer = L.geoJSON(field.geojson, {
        style: isActive ? FIELD_STYLE_ACTIVE : FIELD_STYLE,
        onEachFeature: (_, lyr) => {
          lyr.bindTooltip(field.name, {
            permanent: false, direction: 'top', className: 'mp-field-tooltip',
          })
          lyr.on('click', () => handleSelectField(field))
        },
      })
      layer.addTo(map)
      fieldLayersRef.current[field.id] = layer
    })
  }, [fields, selectedField?.id]) // eslint-disable-line

  // ─────────────────────────────────────────
  // Select field (zoom + highlight)
  // ─────────────────────────────────────────
  function handleSelectField(field) {
    setSelectedField(field)
    const layer = fieldLayersRef.current[field.id]
    if (layer && mapRef.current) {
      const bounds = layer.getBounds()
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [70, 70] })
    }
  }

  // ─────────────────────────────────────────
  // Draw: show instructions modal
  // ─────────────────────────────────────────
  function handleStartDraw() {
    setDrawStep('instructions')
  }

  // ─────────────────────────────────────────
  // Draw: activate custom DrawControl
  // ─────────────────────────────────────────
  function handleActivateDraw() {
    const map = mapRef.current
    if (!map) return

    setDrawStep('drawing')
    setVertexCount(0)
    setDrawnAreaHa(0)
    drawnRef.current.clearLayers()

    const ctrl = new DrawControl(map)

    ctrl.onVertexAdded = (count, area_ha) => {
      setVertexCount(count)
      setDrawnAreaHa(area_ha)
    }

    ctrl.onComplete = ({ geoJSON, area_ha }) => {
      drawnRef.current.addLayer(L.geoJSON(geoJSON))
      drawCtrlRef.current = null
      setDrawnGeoJSON(geoJSON)
      setDrawnAreaHa(area_ha)
      setFieldName('')
      setVertexCount(0)
      setDrawStep('saving')
      addToast(`Maydon: ${area_ha.toFixed(2)} ga`, 'success')
    }

    drawCtrlRef.current = ctrl
    ctrl.enable()
    addToast('Nuqtalarni belgilang', 'info')
  }

  // ─────────────────────────────────────────
  // Draw: finish — programmatically complete shape
  // ─────────────────────────────────────────
  function handleFinishDraw() {
    drawCtrlRef.current?.completeShape()
  }

  // ─────────────────────────────────────────
  // Draw: cancel (any step)
  // ─────────────────────────────────────────
  function handleCancelDraw() {
    if (drawCtrlRef.current) {
      drawCtrlRef.current.disable()
      drawCtrlRef.current = null
    }
    drawnRef.current?.clearLayers()
    setDrawStep('idle')
    setVertexCount(0)
    setDrawnGeoJSON(null)
    setDrawnAreaHa(0)
  }

  // ─────────────────────────────────────────
  // Draw: save field to API
  // ─────────────────────────────────────────
  async function handleSaveField() {
    if (!fieldName.trim() || !drawnGeoJSON) return
    setSaving(true)
    try {
      const [lng, lat] = drawnGeoJSON.geometry.coordinates[0][0]
      const saved = await addField({
        name:            fieldName.trim(),
        area_ha:         drawnAreaHa,
        geojson:         drawnGeoJSON,
        degradation:     "Ma'lumot yo'q",
        advice:          '',
        google_maps_url: `https://maps.google.com/?q=${lat},${lng}`,
        created_at:      new Date().toISOString().slice(0, 10),
      })
      drawnRef.current?.clearLayers()
      setDrawStep('idle')
      setDrawnGeoJSON(null)
      setDrawnAreaHa(0)
      setSelectedField(saved)
      addToast(`"${saved.name}" saqlandi`, 'success')
    } catch {
      addToast('Saqlashda xato yuz berdi', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="mp-root">

      {/* ── Leaflet map ── */}
      <div ref={mapElRef} className="mp-map" />

      {/* ── Inline CSS overrides ── */}
      <style>{`
        .mp-field-tooltip {
          background: rgba(45,95,63,0.92);
          color: #fff;
          border: none;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .mp-field-tooltip::before { display: none; }
      `}</style>

      {/* ── Left panel ── */}
      <FieldListPanel
        fields={fields}
        loading={loading}
        selectedId={selectedField?.id}
        onSelect={handleSelectField}
        onZoom={handleSelectField}
        onDelete={deleteField}
        onDraw={handleStartDraw}
        onUpload={() => onTabChange && onTabChange('fayl-yuklash')}
        open={panelLeft}
        onToggle={() => setPanelLeft(p => !p)}
      />

      {/* ── Right details panel ── */}
      <FieldDetailsPanel
        field={selectedField}
        onClose={() => setSelectedField(null)}
      />

      {/* ── Map controls — shifts left when right panel opens ── */}
      <MapControls
        mapRef={mapRef}
        basemap={basemap}
        onBasemapChange={setBasemap}
        overlays={overlays}
        onOverlayChange={setOverlays}
        rightOffset={selectedField ? 338 : 18}
      />

      {/* ── Drawing instructions (bottom center) ── */}
      {drawStep === 'drawing' && (
        <DrawInstructions
          vertexCount={vertexCount}
          areaHa={drawnAreaHa}
          onFinish={handleFinishDraw}
          onCancel={handleCancelDraw}
        />
      )}

      {/* ── Instructions modal ── */}
      {drawStep === 'instructions' && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <div className="mp-modal-hdr">
              <span className="mp-modal-title">
                <i className="ti ti-pencil" />
                Dala chizish
              </span>
              <button className="mp-modal-x" onClick={handleCancelDraw}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="mp-modal-body">
              <p className="mp-modal-desc">
                Dala chegaralarini xaritada belgilang. Istalgancha nuqta qo'yishingiz mumkin.
              </p>
              <ol className="mp-steps">
                <li>
                  <span className="mp-step-num">1</span>
                  Xaritada dalangiz hududiga boring (scroll + drag)
                </li>
                <li>
                  <span className="mp-step-num">2</span>
                  <strong>Boshlash</strong> tugmasini bosing
                </li>
                <li>
                  <span className="mp-step-num">3</span>
                  Dala chegaralarini nuqta-nuqta belgilang (cheksiz nuqta)
                </li>
                <li>
                  <span className="mp-step-num">4</span>
                  Xohlagan nuqtada <span className="mp-step-highlight">Yakunlash</span> tugmasini bosing
                </li>
                <li>
                  <span className="mp-step-num">5</span>
                  Dala nomini kiriting va saqlang
                </li>
              </ol>
            </div>

            <div className="mp-modal-ftr">
              <button className="mp-btn mp-btn--ghost" onClick={handleCancelDraw}>
                Bekor
              </button>
              <button className="mp-btn mp-btn--primary" onClick={handleActivateDraw}>
                <i className="ti ti-pencil" />
                Boshlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save modal ── */}
      {drawStep === 'saving' && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <div className="mp-modal-hdr">
              <span className="mp-modal-title">
                <i className="ti ti-device-floppy" />
                Dalani saqlash
              </span>
              <button className="mp-modal-x" onClick={handleCancelDraw}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="mp-modal-body">
              <div className="mp-area-card">
                <div className="mp-area-item">
                  <span className="mp-area-lbl">Maydoni</span>
                  <span className="mp-area-val">{drawnAreaHa.toFixed(2)} ga</span>
                </div>
                <div className="mp-area-sep" />
                <div className="mp-area-item">
                  <span className="mp-area-lbl">m²</span>
                  <span className="mp-area-val">
                    {Math.round(drawnAreaHa * 10000).toLocaleString()}
                  </span>
                </div>
              </div>

              <label className="mp-label">Dala nomi *</label>
              <input
                className="mp-input"
                type="text"
                placeholder="Masalan: Shimoliy dala #1"
                value={fieldName}
                onChange={e => setFieldName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveField()}
                autoFocus
                maxLength={80}
              />
              <span className="mp-input-hint">{fieldName.length}/80</span>
            </div>

            <div className="mp-modal-ftr">
              <button className="mp-btn mp-btn--ghost" onClick={handleCancelDraw}>
                Bekor
              </button>
              <button
                className="mp-btn mp-btn--primary"
                onClick={handleSaveField}
                disabled={!fieldName.trim() || saving}
              >
                {saving
                  ? <><div className="mp-spinner" /> Saqlanmoqda...</>
                  : <><i className="ti ti-device-floppy" /> Saqlash</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="mp-toasts">
          {toasts.map(t => (
            <div key={t.id} className={`mp-toast mp-toast--${t.type}`}>
              {t.type === 'success' && <i className="ti ti-check-circle" />}
              {t.type === 'error'   && <i className="ti ti-alert-circle" />}
              {t.type === 'info'    && <i className="ti ti-info-circle" />}
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
