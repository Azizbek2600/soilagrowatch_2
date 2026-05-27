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
import { t } from '../i18n'
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
  fillOpacity: 0, weight: 2.5, opacity: 1,
}
const FIELD_STYLE_ACTIVE = {
  color: '#F59E0B', fillColor: '#F59E0B',
  fillOpacity: 0, weight: 3, opacity: 1,
}

// ── NDVI Grid Heatmap helpers (12×12 cluster grid) ──
function mpHmSeed(n) {
  const x = Math.sin(n * 9301.0 + 49297.0) * 233280.0
  return x - Math.floor(x)
}
function mpNdviColor(v) {
  if (v >  0.60) return '#006400'
  if (v >  0.40) return '#228B22'
  if (v >  0.25) return '#90EE90'
  if (v >  0.10) return '#FFFF00'
  if (v > -0.10) return '#FFA500'
  return                '#8B4513'
}
function mpPip(point, ring) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}
function buildGridHeatmap(map, geojson) {
  const coords = geojson?.geometry?.coordinates?.[0]
  if (!map || !coords || coords.length < 3) return null
  const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats),  maxLat = Math.max(...lats)
  const dLng = maxLng - minLng, dLat = maxLat - minLat
  const ring = coords.map(c => [c[0], c[1]])
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ring.push(ring[0])

  const cx0 = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const cy0 = ring.reduce((s, p) => s + p[1], 0) / ring.length
  const S = Math.round(cx0 * 1e4 + cy0 * 1e5)

  const clusters = Array.from({ length: 5 }, (_, i) => ({
    nx: mpHmSeed(S + i * 17), ny: mpHmSeed(S + i * 31 + 7), base: mpHmSeed(S + i * 53 + 13),
  }))
  clusters.sort((a, b) => b.base - a.base)
  clusters[0].base =  0.55 + mpHmSeed(S + 100) * 0.20
  clusters[1].base =  0.35 + mpHmSeed(S + 200) * 0.15
  clusters[2].base =  0.15 + mpHmSeed(S + 300) * 0.12
  clusters[3].base =  0.05 + mpHmSeed(S + 400) * 0.10
  clusters[4].base = -0.08 + mpHmSeed(S + 500) * 0.10

  const G = 80, cLng = dLng / G, cLat = dLat / G
  const group = L.featureGroup()
  for (let row = 0; row < G; row++) {
    for (let col = 0; col < G; col++) {
      const nx = (col + 0.5) / G, ny = (row + 0.5) / G
      const lng = minLng + nx * dLng, lat = minLat + ny * dLat
      if (!mpPip([lng, lat], ring)) continue
      let wSum = 0, vSum = 0
      for (const cl of clusters) {
        const w = 1 / ((nx - cl.nx) ** 2 + (ny - cl.ny) ** 2 + 1e-4)
        wSum += w; vSum += w * cl.base
      }
      const jitter = (mpHmSeed(S + row * 137 + col * 37) - 0.5) * 0.08
      const ndvi = Math.max(-0.15, Math.min(0.85, vSum / wSum + jitter))
      L.rectangle(
        [[minLat + row * cLat, minLng + col * cLng], [minLat + (row + 1) * cLat, minLng + (col + 1) * cLng]],
        { fillColor: mpNdviColor(ndvi), fillOpacity: 0.75, color: 'transparent', weight: 0, interactive: false }
      ).addTo(group)
    }
  }
  return group
}

// ── Toast helper ──
let _toastId = 0
function makeToast(msg, type) {
  return { id: ++_toastId, msg, type }
}

export default function MapPage({ onTabChange, lang }) {
  const activeLang = lang ?? 'uz'
  const mapElRef       = useRef(null)
  const mapRef         = useRef(null)
  const tileLayersRef  = useRef({})
  const fieldLayersRef   = useRef({})
  const heatmapGroupsRef = useRef({})
  const drawnRef         = useRef(null)
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

    // Remove old layers and heatmaps
    Object.values(heatmapGroupsRef.current).forEach(g => map.removeLayer(g))
    heatmapGroupsRef.current = {}
    Object.values(fieldLayersRef.current).forEach(l => map.removeLayer(l))
    fieldLayersRef.current = {}

    fields.forEach(field => {
      if (!field.geojson) return
      const isActive = selectedField?.id === field.id

      // Heatmap first so polygon border renders on top
      const hm = buildGridHeatmap(map, field.geojson)
      if (hm) { hm.addTo(map); heatmapGroupsRef.current[field.id] = hm }

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
        lang={activeLang}
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
        lang={activeLang}
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
        lang={activeLang}
      />

      {/* ── Drawing instructions (bottom center) ── */}
      {drawStep === 'drawing' && (
        <DrawInstructions
          vertexCount={vertexCount}
          areaHa={drawnAreaHa}
          onFinish={handleFinishDraw}
          onCancel={handleCancelDraw}
          lang={activeLang}
        />
      )}

      {/* ── Instructions modal ── */}
      {drawStep === 'instructions' && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <div className="mp-modal-hdr">
              <span className="mp-modal-title">
                <i className="ti ti-pencil" />
                {t(activeLang, 'drawFieldTitle')}
              </span>
              <button className="mp-modal-x" onClick={handleCancelDraw}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="mp-modal-body">
              <p className="mp-modal-desc">{t(activeLang, 'drawDesc')}</p>
              <ol className="mp-steps">
                <li><span className="mp-step-num">1</span>{t(activeLang, 'step1')}</li>
                <li><span className="mp-step-num">2</span>
                  <span dangerouslySetInnerHTML={{ __html: t(activeLang, 'step2') }} />
                </li>
                <li><span className="mp-step-num">3</span>{t(activeLang, 'step3')}</li>
                <li><span className="mp-step-num">4</span>
                  <span dangerouslySetInnerHTML={{ __html: t(activeLang, 'step4') }} />
                </li>
                <li><span className="mp-step-num">5</span>{t(activeLang, 'step5')}</li>
              </ol>
            </div>

            <div className="mp-modal-ftr">
              <button className="mp-btn mp-btn--ghost" onClick={handleCancelDraw}>
                {t(activeLang, 'cancel')}
              </button>
              <button className="mp-btn mp-btn--primary" onClick={handleActivateDraw}>
                <i className="ti ti-pencil" />
                {t(activeLang, 'start')}
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
                {t(activeLang, 'saveFieldTitle')}
              </span>
              <button className="mp-modal-x" onClick={handleCancelDraw}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="mp-modal-body">
              <div className="mp-area-card">
                <div className="mp-area-item">
                  <span className="mp-area-lbl">{t(activeLang, 'fieldArea')}</span>
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

              <label className="mp-label">{t(activeLang, 'fieldName')}</label>
              <input
                className="mp-input"
                type="text"
                placeholder={t(activeLang, 'fieldNamePh')}
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
                  ? <><div className="mp-spinner" /> {t(activeLang, 'saving')}</>
                  : <><i className="ti ti-device-floppy" /> {t(activeLang, 'save')}</>
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
