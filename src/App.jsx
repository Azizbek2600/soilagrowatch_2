import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

import ndviData   from './data/ndvi.json'
import ndwiData   from './data/ndwi.json'
import siData     from './data/si.json'
import bsiData    from './data/bsi.json'
import umumiyData from './data/umumiy.json'

// ─────────────────────────────────────────────
// Sozlamalar
// ─────────────────────────────────────────────
const PROPERTY_KEY   = 'gridcode'
const DEFAULT_CENTER = [42.85, 60.08]
const DEFAULT_ZOOM   = 10

// ─────────────────────────────────────────────
// DINAMIK RANG HISOBLASH
// Har bir qatlam uchun minimal va maksimal gridcode
// asosida gradiyent ranglar avtomatik hisoblanadi
// ─────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b]
    .map(v => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
}

function interpolateColor(from, to, t) {
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  return rgbToHex([
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  ])
}

// codes ro'yxati asosida to'liq palitrani avtomatik hisoblaydi
function buildPalette(colorScale, codes) {
  const min   = Math.min(...codes)
  const max   = Math.max(...codes)
  const range = max - min || 1
  const palette = {}
  codes.forEach(code => {
    const t = (code - min) / range
    palette[code] = interpolateColor(colorScale.from, colorScale.to, t)
  })
  return palette
}

// ─────────────────────────────────────────────
// QATLAMLAR — har bir qatlam o'z rang palitrasiga ega
// colorScale.from → boshlang'ich rang (minimal gridcode)
// colorScale.to   → oxirgi rang (maksimal gridcode)
// Palitra avtomatik hisoblanadi (buildPalette)
// ─────────────────────────────────────────────
const LAYERS = [
  {
    id:         'ndvi',
    label:      'NDVI (Vegetatsiya)',
    shortLabel: 'NDVI',
    data:  ndviData,
    // Och yashildan → To'q yashilga (O'simlik qalinligi)
    colorScale: { from: '#d4edaa', to: '#1a6b2e' },
    legend: [
      { code: 1, label: 'Suv' },
      { code: 2, label: 'Yalangoch yer' },
      { code: 3, label: "Siyrak o'simlik" },
      { code: 4, label: "O'rtacha o'simlik" },
      { code: 5, label: "Zich o'simlik" },
    ],
  },
  {
    id:         'ndwi',
    label:      'NDWI (Namlik/Suv)',
    shortLabel: 'NDWI',
    data:  ndwiData,
    // Och ko'kdan → To'q ko'kga (Namlik/Suv)
    colorScale: { from: '#cce9ff', to: '#084594' },
    legend: [
      { code: 1, label: 'Juda quruq' },
      { code: 2, label: 'Quruq' },
      { code: 3, label: 'Aralash zona' },
      { code: 4, label: 'Nam hudud' },
      { code: 5, label: 'Suv' },
    ],
  },
  {
    id:         'si',
    label:      "SI (Sho'rlanish)",
    shortLabel: 'SI',
    data:  siData,
    // Yashildan (toza) → To'q qizilga (kuchli sho'rlangan)
    colorScale: { from: '#2d9e3e', to: '#8b0000' },
    legend: [
      { code: 1, label: 'Suv' },
      { code: 2, label: "Zich o'simlik" },
      { code: 3, label: "O'rtacha" },
      { code: 4, label: 'Yomon' },
      { code: 5, label: 'Juda yomon' },
    ],
  },
  {
    id:         'bsi',
    label:      'BSI (Ochiq tuproq)',
    shortLabel: 'BSI',
    data:  bsiData,
    // Och jigarrangdan → To'q jigarrangga (Ochiq tuproq)
    colorScale: { from: '#f5e4c3', to: '#4a2800' },
    legend: [
      { code: 1, label: "Suv va zich o'simlik" },
      { code: 2, label: "O'simlik" },
      { code: 3, label: 'Aralash zona' },
      { code: 4, label: 'Yalangoch tuproq' },
      { code: 5, label: 'Kuchli degradatsiya' },
    ],
  },
  {
    id:         'umumiy',
    label:      'Umumiy (Degradatsiya)',
    shortLabel: 'Umumiy',
    data:  umumiyData,
    // Yashildan → Qizilga (Umumiy degradatsiya)
    colorScale: { from: '#2d9e3e', to: '#d7191c' },
    legend: [
      { code: 1, label: "Degradatsiya yo'q" },
      { code: 2, label: 'Past degradatsiya' },
      { code: 3, label: "O'rtacha degradatsiya" },
      { code: 4, label: 'Yuqori degradatsiya' },
      { code: 5, label: 'Juda yuqori degradatsiya' },
    ],
  },
]

// Har bir qatlam uchun palitrani bir marta hisoblab, saqlash
LAYERS.forEach(layer => {
  const codes = layer.legend.map(item => item.code)
  layer.palette = buildPalette(layer.colorScale, codes)
})

// ─────────────────────────────────────────────
// CHOROPLETH STYLE — faol qatlam palitrasidan rang oladi
// ─────────────────────────────────────────────
function makeStyle(palette) {
  return function choroplethStyle(feature) {
    const code = feature.properties[PROPERTY_KEY]
    return {
      fillColor:   palette[code] ?? '#999999',
      fillOpacity: 0.75,
      stroke:      false,
    }
  }
}

// ─────────────────────────────────────────────
// AUTO-FIT BOUNDS
// ─────────────────────────────────────────────
function MapFitBounds({ data }) {
  const map = useMap()
  useEffect(() => {
    if (!data?.features?.length) return
    const bounds = L.geoJSON(data).getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [data, map])
  return null
}

// ─────────────────────────────────────────────
// POPUP
// ─────────────────────────────────────────────
function onEachFeature(feature, leafletLayer) {
  const p        = feature.properties
  const gridcode = p.gridcode ?? '—'
  const klass    = p.Klass ?? p.klass ?? '—'
  const rawArea  = p.Maydoni ?? p.maydoni ?? p.area
  const areaText = rawArea != null ? `${Number(rawArea).toFixed(2)} ga` : '—'

  leafletLayer.bindPopup(`
    <div class="popup-card">
      <div class="popup-row">
        <span class="popup-label">Sinf</span>
        <span class="popup-value">${klass}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Gridcode</span>
        <span class="popup-value">${gridcode}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Maydoni</span>
        <span class="popup-value">${areaText}</span>
      </div>
    </div>
  `, { maxWidth: 240, className: 'custom-popup' })
}

// ─────────────────────────────────────────────
// MAP CONTROLS — Zoom (+/−) + Lokatsiya
// ─────────────────────────────────────────────
function MapControls() {
  const map = useMap()

  function handleLocate() {
    if (!navigator.geolocation) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude]
        L.circleMarker(latlng, {
          radius: 10, fillColor: '#2563eb',
          color: '#fff', weight: 3, fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup('📍 Siz shu yerdasiz')
          .openPopup()
        map.setView(latlng, 14)
      },
      () => { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM) }
    )
  }

  return (
    <div className="map-controls">
      <button className="map-ctrl-btn" onClick={() => map.zoomIn()} title="Yaqinlashtirish">+</button>
      <button className="map-ctrl-btn" onClick={() => map.zoomOut()} title="Uzoqlashtirish">−</button>
      <div className="map-ctrl-divider" />
      <button className="map-ctrl-btn locate" onClick={handleLocate} title="Mening joylashuvim">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="7" opacity="0.4" />
        </svg>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// LEGENDA — chap pastki burchak
// Mobilda yig'ilib-yoziladigan (collapsible), desktopda doim ochiq
// ─────────────────────────────────────────────
function Legend({ layer }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`legend${collapsed ? ' legend--collapsed' : ''}`}>
      {/* Header — toggle tugmasi bilan */}
      <div className="legend-header" onClick={() => setCollapsed(c => !c)}>
        <div className="legend-header-text">
          <div className="legend-title">Analiz natijalari</div>
          <div className="legend-subtitle">{layer.label}</div>
        </div>
        <button
          className="legend-toggle-btn"
          aria-label={collapsed ? "Yoy" : "Yig'"}
          title={collapsed ? "Legendani yoy" : "Legendani yig'"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14" height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>

      {/* Kontent — collapsed holatda yashiriladi */}
      <div className="legend-body">
        <div className="legend-gradient-bar" style={{
          background: `linear-gradient(to right, ${layer.colorScale.from}, ${layer.colorScale.to})`,
        }} />

        {layer.legend.map(({ code, label }) => (
          <div key={code} className="legend-row">
            <span
              className="legend-swatch"
              style={{ background: layer.palette[code] }}
            />
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ASOSIY APP
// ─────────────────────────────────────────────
function App() {
  const [activeLayer, setActiveLayer] = useState(LAYERS[0])
  const hasFeatures = activeLayer.data?.features?.length > 0

  return (
    <div className="app-container">
      {/* Yuqori markaz — qatlam tugmalari */}
      <div className="layer-controls">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            className={`layer-btn${activeLayer.id === layer.id ? ' active' : ''}`}
            onClick={() => setActiveLayer(layer)}
          >
            <span className="layer-btn-short">{layer.shortLabel}</span>
            <span className="layer-btn-full">{layer.label}</span>
          </button>
        ))}
      </div>

      {/* Chap pastki — legenda */}
      <Legend layer={activeLayer} />

      {/* Xarita */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxZoom={19}
        />

        <MapFitBounds data={activeLayer.data} />
        <MapControls />

        {hasFeatures && (
          <GeoJSON
            key={activeLayer.id}
            data={activeLayer.data}
            style={makeStyle(activeLayer.palette)}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App
