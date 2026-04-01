import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

import siData   from './data/si.json'
import bsiData  from './data/bsi.json'
import ndviData from './data/ndvi.json'

// ─────────────────────────────────────────────
// Sozlamalar
// ─────────────────────────────────────────────
const PROPERTY_KEY   = 'gridcode'         // barcha fayllar uchun umumiy kalit
const DEFAULT_CENTER = [42.85, 60.08]
const DEFAULT_ZOOM   = 10

// ─────────────────────────────────────────────
// LAYERS — har bir qatlam o'z rang palitrasiga ega
//
// palette: { [gridcode]: 'hex rang' }
//   SI/BSI da gridcode 1 = eng yaxshi, 5 = eng yomon
//   NDVI da:
//     1 = Suv (ko'k)
//     2 = Taqir yer (jigarrang)
//     3 = Vegetatsiya yo'q (sariq-jigarrang)
//     4 = Past vegetatsiya (sariq-yashil)
//     5 = O'rta vegetatsiya (yashil)
//     6 = Yuqori vegetatsiya (to'q yashil)
// ─────────────────────────────────────────────
const LAYERS = [
  {
    id:    'si',
    label: "SI (Sho'rlanish)",
    data:  siData,
    palette: {
      1: '#1a9641',   // sho'rlanmagan     — yashil
      2: '#a6d96a',   // past              — och yashil
      3: '#ffffbf',   // o'rtacha          — sariq
      4: '#fdae61',   // sho'rlangan       — to'q sariq
      5: '#d7191c',   // yuqori sho'rlangan — to'q qizil
    },
    legend: [
      { code: 1, label: "Sho'rlanmagan" },
      { code: 2, label: "Past sho'rlangan" },
      { code: 3, label: "O'rtacha sho'rlangan" },
      { code: 4, label: "Sho'rlangan" },
      { code: 5, label: "Yuqori sho'rlangan" },
    ],
  },
  {
    id:    'bsi',
    label: 'BSI (Ochiq tuproq)',
    data:  bsiData,
    palette: {
      1: '#2166ac',   // suv / zich o'simlik — ko'k
      2: '#74c476',   // o'simlik            — yashil
      3: '#ffffbf',   // aralash zona        — sariq
      4: '#d9a441',   // yalangoch tuproq    — jigarrang-sariq
      5: '#8c2d04',   // kuchli degradatsiya — to'q jigarrang
    },
    legend: [
      { code: 1, label: "Suv va zich o'simlik" },
      { code: 2, label: "O'simlik" },
      { code: 3, label: 'Aralash zona' },
      { code: 4, label: 'Yalangoch tuproq' },
      { code: 5, label: 'Kuchli degradatsiya' },
    ],
  },
  {
    id:    'ndvi',
    label: 'NDVI (Vegetatsiya)',
    data:  ndviData,
    // NDVI standart rang shkalalasi:
    // past indeks = quruq / jigarrang, yuqori indeks = to'q yashil
    palette: {
      1: '#4575b4',   // Suv                — ko'k
      2: '#8c510a',   // Taqir yerlar       — to'q jigarrang
      3: '#d8b365',   // Vegetatsiya yo'q   — och jigarrang-sariq
      4: '#c9e09b',   // Past vegetatsiya   — sariq-yashil
      5: '#41ab5d',   // O'rta vegetatsiya  — yashil
      6: '#006837',   // Yuqori vegetatsiya — to'q yashil
    },
    legend: [
      { code: 1, label: 'Suv' },
      { code: 2, label: 'Taqir yerlar' },
      { code: 3, label: "Vegetatsiya yo'q" },
      { code: 4, label: 'Past vegetatsiya' },
      { code: 5, label: "O'rta vegetatsiya" },
      { code: 6, label: 'Yuqori vegetatsiya' },
    ],
  },
]

// ─────────────────────────────────────────────
// CHOROPLETH STYLE — faol qatlam palitrasidan rang oladi
// ─────────────────────────────────────────────
function makeStyle(palette) {
  return function choroplethStyle(feature) {
    const code = feature.properties[PROPERTY_KEY]
    return {
      fillColor:   palette[code] ?? '#999999',
      fillOpacity: 0.7,
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
// SI/BSI: maydoni/Maydoni (ga)
// NDVI:   area (ga)
// ─────────────────────────────────────────────
function onEachFeature(feature, leafletLayer) {
  const p         = feature.properties
  const gridcode  = p.gridcode ?? '—'
  const klass     = p.klass ?? p.Klass ?? '—'
  const rawArea   = p.maydoni ?? p.Maydoni ?? p.area
  const areaText  = rawArea != null ? `${Number(rawArea).toFixed(2)} ga` : '—'

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
// ─────────────────────────────────────────────
function Legend({ layer }) {
  return (
    <div className="legend">
      <div className="legend-title">Analiz natijalari</div>
      <div className="legend-subtitle">{layer.label}</div>
      {layer.legend.map(({ code, label }) => (
        <div key={code} className="legend-row">
          <span className="legend-swatch" style={{ background: layer.palette[code] }} />
          <span className="legend-label">{label}</span>
        </div>
      ))}
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
            {layer.label}
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
