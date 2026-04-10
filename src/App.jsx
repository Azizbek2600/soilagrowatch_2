import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import { useEffect } from 'react'
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
// QATLAMLAR
// ─────────────────────────────────────────────
const LAYERS = [
  {
    id:         'umumiy',
    label:      'Umumiy (Degradatsiya)',
    shortLabel: 'Umumiy',
    data:  umumiyData,
    colorScale: { from: '#2d9e3e', to: '#d7191c' },
    legend: [
      { code: 1, label: "Degradatsiya yo'q" },
      { code: 2, label: 'Past degradatsiya' },
      { code: 3, label: "O'rtacha degradatsiya" },
      { code: 4, label: 'Yuqori degradatsiya' },
      { code: 5, label: 'Juda yuqori degradatsiya' },
    ],
  },
  {
    id:         'ndvi',
    label:      'NDVI (Vegetatsiya)',
    shortLabel: 'NDVI',
    data:  ndviData,
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
    colorScale: { from: '#f5e4c3', to: '#4a2800' },
    legend: [
      { code: 1, label: "Suv va zich o'simlik" },
      { code: 2, label: "O'simlik" },
      { code: 3, label: 'Aralash zona' },
      { code: 4, label: 'Yalangoch tuproq' },
      { code: 5, label: 'Kuchli degradatsiya' },
    ],
  },
]

LAYERS.forEach(layer => {
  const codes = layer.legend.map(item => item.code)
  layer.palette = buildPalette(layer.colorScale, codes)
})

// ─────────────────────────────────────────────
// AGRO-MASLAHAT MANTIGI
// ─────────────────────────────────────────────
const ADVICE = {
  umumiy: {
    1: "Tuproq holati a'lo darajada. Amaldagi agrotexnik amallarni davom ettiring. Hosildorlikni saqlab qolish uchun muntazam monitoring tavsiya etiladi.",
    2: "Yengil degradatsiya belgilari kuzatilmoqda. Organik o'g'itlar qo'llash va sug'orish rejimini optimallashtirish tavsiya etiladi.",
    3: "O'rtacha degradatsiya aniqlandi. Tuproqni qayta tiklash uchun yashil o'g'itlar ekish, eroziyaga qarshi choralar ko'rish zarur.",
    4: "Yuqori darajada degradatsiya! Zudlik bilan tuproqni yuvish, chuqur haydash va meliorativ tadbirlar o'tkazish tavsiya etiladi.",
    5: "Juda yuqori degradatsiya! Kompleks melioratsiya va tuproqni qayta tiklash dasturi tuzish kerak. Agrotexnik mutaxassis bilan maslahatlashing.",
  },
  ndvi: {
    1: "Bu hudud suv yuzasi. Drenaj tizimini tekshiring, suv bosishi muammosi bo'lsa zudlik bilan choralar ko'ring.",
    2: "Yalangoch yer — o'simlik yo'q. Yashil o'tlarni ekish, eroziyadan himoya va namlikni saqlash uchun mulchalash tavsiya etiladi.",
    3: "Siyrak o'simlik qoplami. Qo'shimcha sug'orish, azot o'g'itlari va parvarishlashni kuchaytirish tavsiya etiladi.",
    4: "O'rtacha o'simlik qoplami — holat me'yorda. Sug'orish va o'g'itlash rejimini davom ettiring.",
    5: "Zich o'simlik qoplami — a'lo holat. O'simliklarni kasallik va zararkunandalardan muhofaza qilishni kuchaytiring.",
  },
  ndwi: {
    1: "Juda quruq zona. Zudlik bilan qo'shimcha sug'orish talab etiladi. Tomchilatib sug'orish tizimini joriy etish tavsiya etiladi.",
    2: "Quruq hudud. Sug'orish normasi va chastotasini oshiring, tuproq namligini doimiy nazorat qiling.",
    3: "Aralash namlik zona. Sug'orish rejimini optimallashtiring, namlikni bir tekis taqsimlash uchun tekislash ishlari o'tkazing.",
    4: "Namlik darajasi yetarli. Amaldagi sug'orish rejimini davom ettiring, ortiqcha namlanishdan saqlaning.",
    5: "Suv bosgan zona. Drenaj tizimini yaxshilang, ortiqcha namlikni kamaytirish uchun kanal tozalash ishlari talab etiladi.",
  },
  si: {
    1: "Suv yuzasi. Atrofdagi dalalarning sho'rlanish darajasini muntazam nazorat qiling.",
    2: "Sho'rlanish yo'q — a'lo holat. Amaldagi agrotexnik amallarni davom ettiring.",
    3: "O'rtacha sho'rlanish. Yuvish sug'orishlarini o'tkazing va gipsni tuproqqa qo'llash tavsiya etiladi.",
    4: "Yuqori sho'rlanish! Zudlik bilan desalinizatsiya tadbirlari — tuproqni intensiv yuvish va drenaj qazish zarur.",
    5: "Juda yuqori sho'rlanish! Kompleks melioratsiya dasturi tuzish, o'simlik o'stirishni vaqtincha to'xtatish tavsiya etiladi.",
  },
  bsi: {
    1: "Suv yoki zich o'simlik — sog'lom holat. Parvarishni davom ettiring.",
    2: "O'simlik qoplami yaxshi. Muntazam sug'orish va o'g'itlash bilan holatni saqlang.",
    3: "Aralash zona — ochiq tuproq bo'limlari mavjud. Mulchalash va oraliq ekinlar ekish tavsiya etiladi.",
    4: "Ko'p qismi yalangoch tuproq. O'tlar ekish, organik modda qo'shish va eroziyadan muhofaza qilish zarur.",
    5: "Kuchli degradatsiya — tuproq qayta tiklanishi kerak. Zudlik bilan agrotexnik va meliorativ tadbirlar o'tkazish talab etiladi.",
  },
}

function getAdvice(layerId, gridcode) {
  return ADVICE[layerId]?.[gridcode]
    ?? "Bu hudud uchun ma'lumot yetarli emas. Qo'shimcha tahlil o'tkazish tavsiya etiladi."
}

// ─────────────────────────────────────────────
// CUSTOM PIN ICON
// ─────────────────────────────────────────────
const PIN_ICON = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <filter id="shadow" x="-30%" y="-10%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)" />
    </filter>
    <path filter="url(#shadow)"
      d="M16 2C9.373 2 4 7.373 4 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z"
      fill="#1a73e8" />
    <circle cx="16" cy="14" r="5" fill="white" />
  </svg>`,
  iconSize:   [32, 40],
  iconAnchor: [16, 40],
})

// ─────────────────────────────────────────────
// CHOROPLETH STYLE
// ─────────────────────────────────────────────
function makeStyle(palette, opacity = 0.8) {
  return function choroplethStyle(feature) {
    const code = feature.properties[PROPERTY_KEY]
    return {
      fillColor:   palette[code] ?? '#999999',
      fillOpacity: opacity,
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`legend${collapsed ? ' legend--collapsed' : ''}`}>
      <div className="legend-header" onClick={() => setCollapsed(c => !c)}>
        <div className="legend-header-text">
          <div className="legend-title">Analiz natijalari</div>
          <div className="legend-subtitle">{layer.label}</div>
        </div>
        <button
          className="legend-toggle-btn"
          aria-label={collapsed ? "Yoy" : "Yig'"}
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

      <div className="legend-body">
        <div className="legend-gradient-bar" style={{
          background: `linear-gradient(to right, ${layer.colorScale.from}, ${layer.colorScale.to})`,
        }} />
        {layer.legend.map(({ code, label }) => (
          <div key={code} className="legend-row">
            <span className="legend-swatch" style={{ background: layer.palette[code] }} />
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FEATURE PANEL — o'ng tomondan chiqadigan panel
// ─────────────────────────────────────────────
function FeaturePanel({ feature, lat, lng, layer, onClose }) {
  const isOpen = Boolean(feature)

  const p        = feature?.properties ?? {}
  const gridcode = p.gridcode ?? p.Gridcode
  const klass    = p.Klass ?? p.klass ?? '—'
  const rawArea  = p.Maydoni ?? p.maydoni ?? p.area
  const areaText = rawArea != null ? `${Number(rawArea).toFixed(2)} ga` : '—'

  const statusEntry = layer.legend.find(l => l.code === gridcode)
  const statusLabel = statusEntry?.label ?? '—'
  const statusColor = layer.palette[gridcode] ?? '#999'
  const advice      = feature ? getAdvice(layer.id, gridcode) : ''

  const latStr   = lat != null ? lat.toFixed(5) : null
  const lngStr   = lng != null ? lng.toFixed(5) : null
  const mapsUrl  = lat != null
    ? `https://www.google.com/maps/search/?api=1&query=${latStr},${lngStr}`
    : null

  return (
    <>
      {/* Mobil backdrop */}
      {isOpen && (
        <div className="fp-backdrop" onClick={onClose} />
      )}

      <div className={`feature-panel${isOpen ? ' open' : ''}`}>
        {/* Header */}
        <div className="fp-header">
          <div className="fp-header-meta">
            <span className="fp-header-tag">{layer.shortLabel}</span>
            <span className="fp-header-title">Dala tahlili</span>
          </div>
          <button className="fp-close-btn" onClick={onClose} aria-label="Yopish">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="fp-body">
          {/* Blok 1: Asosiy ko'rsatkichlar */}
          <div className="fp-section">
            <div className="fp-section-label">Asosiy ko'rsatkichlar</div>
            <div className="fp-info-grid">
              <div className="fp-info-item">
                <span className="fp-info-key">Maydoni</span>
                <span className="fp-info-val">{areaText}</span>
              </div>
              <div className="fp-info-item">
                <span className="fp-info-key">Sinf</span>
                <span className="fp-info-val">{klass}</span>
              </div>
              <div className="fp-info-item">
                <span className="fp-info-key">Indeks qiymati</span>
                <span className="fp-info-val">{gridcode ?? '—'}</span>
              </div>
              {latStr && (
                <div className="fp-info-item">
                  <span className="fp-info-key">Koordinata</span>
                  <span className="fp-info-val fp-coords">{latStr}, {lngStr}</span>
                </div>
              )}
            </div>

            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="fp-maps-btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Marshrut qurish (Google Maps)
              </a>
            )}
          </div>

          {/* Blok 2: Hozirgi holat */}
          <div className="fp-section">
            <div className="fp-section-label">Hozirgi holat</div>
            <div className="fp-status-card" style={{ borderLeftColor: statusColor }}>
              <span className="fp-status-dot" style={{ background: statusColor }} />
              <div className="fp-status-text">
                <span className="fp-status-layer">{layer.label}</span>
                <strong className="fp-status-val">{statusLabel}</strong>
              </div>
            </div>
          </div>

          {/* Blok 3: Agro-maslahat */}
          <div className="fp-section">
            <div className="fp-section-label">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ marginRight: 5, verticalAlign: 'middle' }}>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              Agro-maslahat
            </div>
            <div className="fp-advice-text">{advice}</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// ASOSIY APP
// ─────────────────────────────────────────────
function App() {
  const [activeLayer,     setActiveLayer]     = useState(LAYERS[0])
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [layerOpacity,    setLayerOpacity]    = useState(0.8)

  const hasFeatures = activeLayer.data?.features?.length > 0

  function handleLayerChange(layer) {
    setActiveLayer(layer)
    setSelectedFeature(null)
  }

  // setSelectedFeature useState dan stable, shuning uchun [] dependency to'g'ri
  const onEachFeature = useCallback((feature, leafletLayer) => {
    leafletLayer.on('click', (e) => {
      setSelectedFeature({ feature, lat: e.latlng.lat, lng: e.latlng.lng })
    })
  }, [])

  return (
    <div className="app-container">
      {/* Yuqori markaz — qatlam tugmalari */}
      <div className="layer-controls">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            className={`layer-btn${activeLayer.id === layer.id ? ' active' : ''}`}
            onClick={() => handleLayerChange(layer)}
          >
            <span className="layer-btn-short">{layer.shortLabel}</span>
            <span className="layer-btn-full">{layer.label}</span>
          </button>
        ))}
      </div>

      {/* Shaffoflik slideri — tugmalar ostida, markazda */}
      <div className="opacity-slider-container">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.8, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" />
        </svg>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={layerOpacity}
          onChange={e => setLayerOpacity(parseFloat(e.target.value))}
          className="opacity-range"
          aria-label="Qatlam shaffofligi"
        />
        <span className="opacity-pct">{Math.round(layerOpacity * 100)}%</span>
      </div>

      {/* Chap pastki — legenda */}
      <Legend layer={activeLayer} />

      {/* O'ng panel — tanlangan dala ma'lumoti */}
      <FeaturePanel
        feature={selectedFeature?.feature ?? null}
        lat={selectedFeature?.lat}
        lng={selectedFeature?.lng}
        layer={activeLayer}
        onClose={() => setSelectedFeature(null)}
      />

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
            style={makeStyle(activeLayer.palette, layerOpacity)}
            onEachFeature={onEachFeature}
          />
        )}

        {selectedFeature?.lat != null && (
          <Marker
            position={[selectedFeature.lat, selectedFeature.lng]}
            icon={PIN_ICON}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App
