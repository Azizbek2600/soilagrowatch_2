import { useState, useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

import ndviData   from './data/ndvi.json'
import ndwiData   from './data/ndwi.json'
import siData     from './data/si.json'
import bsiData    from './data/bsi.json'
import umumiyData from './data/umumiy.json'
import cropsData  from './data/crops.json'

// ─────────────────────────────────────────────
// Sozlamalar
// ─────────────────────────────────────────────
const PROPERTY_KEY   = 'gridcode'
const DEFAULT_CENTER = [42.85, 60.08]
const DEFAULT_ZOOM   = 10

// ─────────────────────────────────────────────
// RANG HISOBLASH
// ─────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
function rgbToHex([r,g,b]) {
  return '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('')
}
function interpolateColor(from, to, t) {
  const [r1,g1,b1] = hexToRgb(from)
  const [r2,g2,b2] = hexToRgb(to)
  return rgbToHex([r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t])
}
function buildPalette(colorScale, codes) {
  const min = Math.min(...codes), max = Math.max(...codes), range = max-min||1
  const palette = {}
  codes.forEach(code => { palette[code] = interpolateColor(colorScale.from, colorScale.to, (code-min)/range) })
  return palette
}

// ─────────────────────────────────────────────
// QATLAMLAR
// ─────────────────────────────────────────────
const LAYERS = [
  {
    id: 'umumiy', label: 'Umumiy (Degradatsiya)', shortLabel: 'Umumiy',
    data: umumiyData, colorScale: { from: '#2d9e3e', to: '#d7191c' },
    legend: [
      { code:1, label:"Degradatsiya yo'q" }, { code:2, label:'Past degradatsiya' },
      { code:3, label:"O'rtacha degradatsiya" }, { code:4, label:'Yuqori degradatsiya' },
      { code:5, label:'Juda yuqori degradatsiya' },
    ],
  },
  {
    id: 'ndvi', label: 'NDVI (Vegetatsiya)', shortLabel: 'NDVI',
    data: ndviData, colorScale: { from: '#d4edaa', to: '#1a6b2e' },
    legend: [
      { code:1, label:'Suv' }, { code:2, label:'Yalangoch yer' },
      { code:3, label:"Siyrak o'simlik" }, { code:4, label:"O'rtacha o'simlik" },
      { code:5, label:"Zich o'simlik" },
    ],
  },
  {
    id: 'ndwi', label: 'NDWI (Namlik/Suv)', shortLabel: 'NDWI',
    data: ndwiData, colorScale: { from: '#cce9ff', to: '#084594' },
    legend: [
      { code:1, label:'Juda quruq' }, { code:2, label:'Quruq' },
      { code:3, label:'Aralash zona' }, { code:4, label:'Nam hudud' }, { code:5, label:'Suv' },
    ],
  },
  {
    id: 'si', label: "SI (Sho'rlanish)", shortLabel: 'SI',
    data: siData, colorScale: { from: '#2d9e3e', to: '#8b0000' },
    legend: [
      { code:1, label:'Suv' }, { code:2, label:"Zich o'simlik" },
      { code:3, label:"O'rtacha" }, { code:4, label:'Yomon' }, { code:5, label:'Juda yomon' },
    ],
  },
  {
    id: 'bsi', label: 'BSI (Ochiq tuproq)', shortLabel: 'BSI',
    data: bsiData, colorScale: { from: '#f5e4c3', to: '#4a2800' },
    legend: [
      { code:1, label:"Suv va zich o'simlik" }, { code:2, label:"O'simlik" },
      { code:3, label:'Aralash zona' }, { code:4, label:'Yalangoch tuproq' },
      { code:5, label:'Kuchli degradatsiya' },
    ],
  },
]
LAYERS.forEach(layer => {
  layer.palette = buildPalette(layer.colorScale, layer.legend.map(i => i.code))
})

// ─────────────────────────────────────────────
// AGRO-MASLAHAT
// ─────────────────────────────────────────────
const ADVICE = {
  umumiy: {
    1:"Tuproq holati a'lo darajada. Amaldagi agrotexnik amallarni davom ettiring. Hosildorlikni saqlab qolish uchun muntazam monitoring tavsiya etiladi.",
    2:"Yengil degradatsiya belgilari kuzatilmoqda. Organik o'g'itlar qo'llash va sug'orish rejimini optimallashtirish tavsiya etiladi.",
    3:"O'rtacha degradatsiya aniqlandi. Tuproqni qayta tiklash uchun yashil o'g'itlar ekish, eroziyaga qarshi choralar ko'rish zarur.",
    4:"Yuqori darajada degradatsiya! Zudlik bilan tuproqni yuvish, chuqur haydash va meliorativ tadbirlar o'tkazish tavsiya etiladi.",
    5:"Juda yuqori degradatsiya! Kompleks melioratsiya va tuproqni qayta tiklash dasturi tuzish kerak. Agrotexnik mutaxassis bilan maslahatlashing.",
  },
  ndvi: {
    1:"Bu hudud suv yuzasi. Drenaj tizimini tekshiring, suv bosishi muammosi bo'lsa zudlik bilan choralar ko'ring.",
    2:"Yalangoch yer — o'simlik yo'q. Yashil o'tlarni ekish, eroziyadan himoya va namlikni saqlash uchun mulchalash tavsiya etiladi.",
    3:"Siyrak o'simlik qoplami. Qo'shimcha sug'orish, azot o'g'itlari va parvarishlashni kuchaytirish tavsiya etiladi.",
    4:"O'rtacha o'simlik qoplami — holat me'yorda. Sug'orish va o'g'itlash rejimini davom ettiring.",
    5:"Zich o'simlik qoplami — a'lo holat. O'simliklarni kasallik va zararkunandalardan muhofaza qilishni kuchaytiring.",
  },
  ndwi: {
    1:"Juda quruq zona. Zudlik bilan qo'shimcha sug'orish talab etiladi. Tomchilatib sug'orish tizimini joriy etish tavsiya etiladi.",
    2:"Quruq hudud. Sug'orish normasi va chastotasini oshiring, tuproq namligini doimiy nazorat qiling.",
    3:"Aralash namlik zona. Sug'orish rejimini optimallashtiring, namlikni bir tekis taqsimlash uchun tekislash ishlari o'tkazing.",
    4:"Namlik darajasi yetarli. Amaldagi sug'orish rejimini davom ettiring, ortiqcha namlanishdan saqlaning.",
    5:"Suv bosgan zona. Drenaj tizimini yaxshilang, ortiqcha namlikni kamaytirish uchun kanal tozalash ishlari talab etiladi.",
  },
  si: {
    1:"Suv yuzasi. Atrofdagi dalalarning sho'rlanish darajasini muntazam nazorat qiling.",
    2:"Sho'rlanish yo'q — a'lo holat. Amaldagi agrotexnik amallarni davom ettiring.",
    3:"O'rtacha sho'rlanish. Yuvish sug'orishlarini o'tkazing va gipsni tuproqqa qo'llash tavsiya etiladi.",
    4:"Yuqori sho'rlanish! Zudlik bilan desalinizatsiya tadbirlari — tuproqni intensiv yuvish va drenaj qazish zarur.",
    5:"Juda yuqori sho'rlanish! Kompleks melioratsiya dasturi tuzish, o'simlik o'stirishni vaqtincha to'xtatish tavsiya etiladi.",
  },
  bsi: {
    1:"Suv yoki zich o'simlik — sog'lom holat. Parvarishni davom ettiring.",
    2:"O'simlik qoplami yaxshi. Muntazam sug'orish va o'g'itlash bilan holatni saqlang.",
    3:"Aralash zona — ochiq tuproq bo'limlari mavjud. Mulchalash va oraliq ekinlar ekish tavsiya etiladi.",
    4:"Ko'p qismi yalangoch tuproq. O'tlar ekish, organik modda qo'shish va eroziyadan muhofaza qilish zarur.",
    5:"Kuchli degradatsiya — tuproq qayta tiklanishi kerak. Zudlik bilan agrotexnik va meliorativ tadbirlar o'tkazish talab etiladi.",
  },
}
function getAdvice(layerId, gridcode) {
  return ADVICE[layerId]?.[gridcode] ?? "Bu hudud uchun ma'lumot yetarli emas. Qo'shimcha tahlil o'tkazish tavsiya etiladi."
}

// ─────────────────────────────────────────────
// EKIN RANGLARI
// ─────────────────────────────────────────────
const CROP_COLORS = {
  'Paxta':     '#e0e0e0',
  "Bug'doy":   '#f5c842',
  'Qizilmiya': '#e87b2a',
  "Bo'sh yer": '#9e9e9e',
}
const CROP_BAR_COLORS = {
  'Paxta':     '#42a5f5',
  "Bug'doy":   '#ffc107',
  'Qizilmiya': '#ff7043',
  "Bo'sh yer": '#bdbdbd',
}

// ─────────────────────────────────────────────
// PIN ICON
// ─────────────────────────────────────────────
const PIN_ICON = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <filter id="shadow" x="-30%" y="-10%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
    <path filter="url(#shadow)" d="M16 2C9.373 2 4 7.373 4 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#1a73e8"/>
    <circle cx="16" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [32,40], iconAnchor: [16,40],
})

// ─────────────────────────────────────────────
// GEOJSON LAYER
// ─────────────────────────────────────────────
function GeoJSONLayer({ layer, opacity, onEachFeature, onReady }) {
  useEffect(() => {
    const t = setTimeout(onReady, 120)
    return () => clearTimeout(t)
  }, [layer.id])
  return <GeoJSON data={layer.data} style={makeStyle(layer.palette, opacity)} onEachFeature={onEachFeature} />
}

function makeStyle(palette, opacity = 0.8) {
  return feature => ({
    fillColor: palette[feature.properties[PROPERTY_KEY]] ?? '#999999',
    fillOpacity: opacity,
    stroke: false,
  })
}

// ─────────────────────────────────────────────
// AUTO-FIT BOUNDS
// ─────────────────────────────────────────────
function MapFitBounds({ data }) {
  const map = useMap()
  useEffect(() => {
    if (!data?.features?.length) return
    const bounds = L.geoJSON(data).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40,40] })
  }, [data, map])
  return null
}

// ─────────────────────────────────────────────
// MAP CONTROLS
// ─────────────────────────────────────────────
function MapControls() {
  const map = useMap()
  function handleLocate() {
    if (!navigator.geolocation) { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const latlng = [pos.coords.latitude, pos.coords.longitude]
        L.circleMarker(latlng, { radius:10, fillColor:'#2563eb', color:'#fff', weight:3, fillOpacity:1 })
          .addTo(map).bindPopup('📍 Siz shu yerdasiz').openPopup()
        map.setView(latlng, 14)
      },
      () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    )
  }
  return (
    <div className="map-controls">
      <button className="map-ctrl-btn" onClick={() => map.zoomIn()} title="Yaqinlashtirish">+</button>
      <button className="map-ctrl-btn" onClick={() => map.zoomOut()} title="Uzoqlashtirish">−</button>
      <div className="map-ctrl-divider" />
      <button className="map-ctrl-btn locate" onClick={handleLocate} title="Mening joylashuvim">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          <circle cx="12" cy="12" r="7" opacity="0.4"/>
        </svg>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// LEGENDA
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
        <button className="legend-toggle-btn" aria-label={collapsed ? 'Yoy' : "Yig'"}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      </div>
      <div className="legend-body">
        <div className="legend-gradient-bar" style={{
          background: `linear-gradient(to right, ${layer.colorScale.from}, ${layer.colorScale.to})`,
        }}/>
        {layer.legend.map(({ code, label }) => (
          <div key={code} className="legend-row">
            <span className="legend-swatch" style={{ background: layer.palette[code] }}/>
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// OB-HAVO KONTENT (faqat ma'lumot, wrapper yo'q)
// ─────────────────────────────────────────────
function WeatherContent() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => { loadWeather() }, [])

  async function loadWeather() {
    try {
      const res = await fetch(
        'https://power.larc.nasa.gov/api/temporal/daily/point' +
        '?parameters=T2M,PRECTOTCORR&community=AG' +
        '&longitude=59.12&latitude=42.74&start=20250425&end=20250502&format=JSON'
      )
      if (!res.ok) throw new Error('API javob xatosi: ' + res.status)
      const json = await res.json()
      setData(processNasaData(json))
      setLastUpdated(new Date().toLocaleString('uz-UZ'))
    } catch (e) {
      console.log('NASA POWER API xatosi:', e)
      setData(getMockData())
      setLastUpdated(new Date().toLocaleString('uz-UZ') + ' (demo)')
    }
    setLoading(false)
  }

  function processNasaData(json) {
    const t2m  = json?.properties?.parameter?.T2M         ?? {}
    const prec = json?.properties?.parameter?.PRECTOTCORR ?? {}
    const days = Object.keys(t2m).filter(k => k !== 'FILL_VALUE').sort()
      .map(date => ({ date, temp: typeof t2m[date]==='number'?t2m[date]:null, rain: typeof prec[date]==='number'?prec[date]:null }))
      .filter(d => d.temp !== null && d.temp > -900)
    return buildAlerts(days)
  }

  function getMockData() {
    const days = [
      { date:'20250425', temp:18.3, rain:0.1 },
      { date:'20250426', temp:20.1, rain:0.0 },
      { date:'20250427', temp:22.4, rain:0.0 },
      { date:'20250428', temp:19.8, rain:0.0 },
      { date:'20250429', temp:16.5, rain:0.0 },
      { date:'20250430', temp:14.2, rain:0.0 },
      { date:'20250501', temp:17.9, rain:1.8 },
      { date:'20250502', temp:21.1, rain:0.1 },
    ]
    return buildAlerts(days)
  }

  function buildAlerts(days) {
    const frostRisk = days.some(d => d.temp !== null && d.temp < 5)
    let droughtRisk = false, streak = 0
    for (const d of days) {
      if (d.rain !== null) {
        streak = d.rain < 1 ? streak + 1 : 0
        if (streak >= 5) { droughtRisk = true; break }
      }
    }
    return { days, frostRisk, droughtRisk }
  }

  function fmtDate(s) {
    const months = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Nov','Dek']
    return `${s.slice(6)}-${months[parseInt(s.slice(4,6))-1]}`
  }

  const alertType = data?.frostRisk ? 'frost' : data?.droughtRisk ? 'drought' : 'normal'
  const alertMsg  = {
    frost:   '⚠️ AYOZ XAVFI: Ekinlarni himoya qiling!',
    drought: "⚠️ QURG'OQCHILIK XAVFI",
    normal:  '✅ Ob-havo normal',
  }

  if (loading) {
    return (
      <div className="wp-loading">
        <div className="map-loader-spinner" style={{ width:22, height:22, borderWidth:2 }}/>
        <span>NASA POWER yuklanmoqda...</span>
      </div>
    )
  }

  return (
    <>
      {data && <div className={`wp-alert wp-alert--${alertType}`}>{alertMsg[alertType]}</div>}
      {data?.days?.length > 0 && (
        <div className="wp-table-wrapper">
          <table className="wp-table">
            <thead>
              <tr><th>Sana</th><th>Harorat (°C)</th><th>Yog'in (mm)</th></tr>
            </thead>
            <tbody>
              {data.days.map(d => (
                <tr key={d.date} className={d.temp < 5 ? 'wp-row--cold' : ''}>
                  <td>{fmtDate(d.date)}</td>
                  <td className={d.temp < 5 ? 'wp-cold' : d.temp > 35 ? 'wp-hot' : ''}>{d.temp?.toFixed(1)}°</td>
                  <td className={d.rain !== null && d.rain < 1 ? 'wp-dry' : 'wp-wet'}>{d.rain?.toFixed(1) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="wp-footer">So'nggi yangilanish: {lastUpdated}</div>
    </>
  )
}

// ─────────────────────────────────────────────
// TAHLILLAR DASHBOARD (full-screen overlay)
// ─────────────────────────────────────────────
function TahlillarDashboard({ onClose }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

  const totalArea = cropsData.features.reduce((sum, f) => sum + f.properties.maydoni, 0)
  const emptyArea = cropsData.features.find(f => f.properties.ekin === "Bo'sh yer")?.properties?.maydoni ?? 0

  const labItems = [
    { label:'pH darajasi',   value:'7.2',  unit:'',     badge:'Normal', type:'normal'  },
    { label:'EC',            value:'4.8',  unit:'dS/m', badge:'Yuqori', type:'warning' },
    { label:'Organik modda', value:'1.2',  unit:'%',    badge:'Past',   type:'danger'  },
    { label:'SAR',           value:'12.3', unit:'',     badge:'Xavfli', type:'danger'  },
  ]

  return (
    <div className="db-overlay">

      {/* ── Header ── */}
      <div className="db-header">
        <button className="db-back" onClick={onClose}>← Xaritaga qaytish</button>
        <div className="db-logo">
          <span className="db-logo-dot"/>
          <span className="db-logo-text">SoilAgroWatch</span>
        </div>
        <div className="db-meta">Nukus tumani • 2026-05-02</div>
      </div>

      <div className="db-scroll">

        {/* ── 1. YUQORI: 3 stat karta ── */}
        <div className="db-stats">

          <div className="db-stat">
            <div className="db-stat-top">
              <span className="db-stat-icon">🌿</span>
              <div className="db-stat-body">
                <div className="db-stat-num db-stat-num--green">297.3 ga</div>
                <div className="db-stat-lbl">Monitoring maydoni</div>
              </div>
            </div>
            <div className="db-stat-bar-track">
              <div className="db-stat-bar-fill db-stat-bar--green" style={{ width: mounted ? '100%' : '0%' }}/>
            </div>
          </div>

          <div className="db-stat">
            <div className="db-stat-top">
              <span className="db-stat-icon">⚠️</span>
              <div className="db-stat-body">
                <div className="db-stat-num db-stat-num--red">68%</div>
                <div className="db-stat-lbl">Degradatsiya darajasi</div>
              </div>
            </div>
            <div className="db-stat-bar-track">
              <div className="db-stat-bar-fill db-stat-bar--red" style={{ width: mounted ? '68%' : '0%' }}/>
            </div>
          </div>

          <div className="db-stat">
            <div className="db-stat-top">
              <span className="db-stat-icon">💧</span>
              <div className="db-stat-body">
                <div className="db-stat-num db-stat-num--yellow">Kritik</div>
                <div className="db-stat-lbl">Sug'orish holati</div>
              </div>
            </div>
            <div className="db-stat-bar-track">
              <div className="db-stat-bar-fill db-stat-bar--yellow" style={{ width: mounted ? '85%' : '0%' }}/>
            </div>
          </div>

        </div>

        {/* ── 2. O'RTA: ob-havo (60%) + ekin (40%) ── */}
        <div className="db-mid">

          {/* CHAP 60%: Ob-havo */}
          <div className="db-card db-card--weather">
            <div className="db-card-title">☀️ Ob-havo prognozi — NASA POWER</div>
            <WeatherContent />
          </div>

          {/* O'NG 40%: Ekin Taqsimoti */}
          <div className="db-card db-card--crops">
            <div className="db-card-title">🌾 Ekin Taqsimoti</div>
            <div className="db-crops">
              {cropsData.features.map(f => {
                const { ekin, maydoni } = f.properties
                const pct = (maydoni / totalArea) * 100
                return (
                  <div key={ekin} className="db-crop-row">
                    <div className="db-crop-head">
                      <span className="db-crop-name">{ekin}</span>
                      <span className="db-crop-ha">{maydoni} ga</span>
                    </div>
                    <div className="db-bar-track">
                      <div className="db-bar-fill" style={{
                        width: mounted ? `${pct}%` : '0%',
                        background: CROP_BAR_COLORS[ekin] || '#555',
                      }}/>
                    </div>
                    <div className="db-crop-pct">{pct.toFixed(1)}%</div>
                  </div>
                )
              })}
            </div>
            <div className="db-crop-separator"/>
            <div className="db-crop-totals">
              <div className="db-crop-total-item">
                <span className="db-crop-total-num">{totalArea.toFixed(1)} ga</span>
                <span className="db-crop-total-lbl">Jami</span>
              </div>
              <div className="db-crop-total-item">
                <span className="db-crop-total-num">{cropsData.features.length}</span>
                <span className="db-crop-total-lbl">Tur soni</span>
              </div>
              <div className="db-crop-total-item">
                <span className="db-crop-total-num">{(totalArea - emptyArea).toFixed(1)} ga</span>
                <span className="db-crop-total-lbl">Ishlov</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. PASTKI: Laboratoriya (to'liq kenglik) ── */}
        <div className="db-card">
          <div className="db-card-title">🔬 Laboratoriya Tahlili</div>
          <div className="db-lab-grid">
            {labItems.map(item => (
              <div key={item.label} className={`db-lab-card db-lab-card--${item.type}`}>
                <div className="db-lab-name">{item.label}</div>
                <div className="db-lab-val">{item.value}{item.unit ? ` ${item.unit}` : ''}</div>
                <span className={`db-lab-badge db-lab-badge--${item.type}`}>{item.badge}</span>
              </div>
            ))}
          </div>
          <div className="db-lab-footer">
            <p className="db-lab-note">Laboratoriya tahlili ixtiyoriy — aniqlikni 95% gacha oshiradi</p>
            <button className="db-lab-download" onClick={() => alert('Hisobot tayyorlanmoqda...')}>
              📥 Laboratoriya hisobotini yuklab olish
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FEATURE PANEL
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

  const latStr  = lat != null ? lat.toFixed(5) : null
  const lngStr  = lng != null ? lng.toFixed(5) : null
  const mapsUrl = lat != null
    ? `https://www.google.com/maps/search/?api=1&query=${latStr},${lngStr}` : null

  return (
    <>
      {isOpen && <div className="fp-backdrop" onClick={onClose}/>}
      <div className={`feature-panel${isOpen ? ' open' : ''}`}>
        <div className="fp-header">
          <div className="fp-header-meta">
            <span className="fp-header-tag">{layer.shortLabel}</span>
            <span className="fp-header-title">Dala tahlili</span>
          </div>
          <button className="fp-close-btn" onClick={onClose} aria-label="Yopish">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="fp-body">
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
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="fp-maps-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Marshrut qurish (Google Maps)
              </a>
            )}
          </div>

          <div className="fp-section">
            <div className="fp-section-label">Hozirgi holat</div>
            <div className="fp-status-card" style={{ borderLeftColor: statusColor }}>
              <span className="fp-status-dot" style={{ background: statusColor }}/>
              <div className="fp-status-text">
                <span className="fp-status-layer">{layer.label}</span>
                <strong className="fp-status-val">{statusLabel}</strong>
              </div>
            </div>
          </div>

          <div className="fp-section">
            <div className="fp-section-label">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ marginRight:5, verticalAlign:'middle' }}>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 8v4M12 16h.01"/>
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
  const [isLoading,       setIsLoading]       = useState(true)
  const [showTahlillar,   setShowTahlillar]   = useState(false)

  const hasFeatures = activeLayer.data?.features?.length > 0

  function handleLayerChange(layer) {
    setActiveLayer(layer)
    setSelectedFeature(null)
    setIsLoading(true)
    setShowTahlillar(false)
  }

  const onEachFeature = useCallback((feature, leafletLayer) => {
    leafletLayer.on('click', e => {
      setShowTahlillar(false)
      setSelectedFeature({ feature, lat: e.latlng.lat, lng: e.latlng.lng })
    })
  }, [])

  return (
    <div className="app-container">
      {/* Tab qatori */}
      <div className="layer-controls">
        {LAYERS.map(layer => (
          <button
            key={layer.id}
            className={`layer-btn${activeLayer.id === layer.id && !showTahlillar ? ' active' : ''}`}
            onClick={() => handleLayerChange(layer)}
          >
            <span className="layer-btn-short">{layer.shortLabel}</span>
            <span className="layer-btn-full">{layer.label}</span>
          </button>
        ))}
        <div className="layer-btn-divider"/>
        <button
          className={`layer-btn layer-btn--tahlil${showTahlillar ? ' active' : ''}`}
          onClick={() => { setShowTahlillar(t => !t); if (!showTahlillar) setSelectedFeature(null) }}
        >
          <span className="layer-btn-short">📊</span>
          <span className="layer-btn-full">📊 Tahlillar</span>
        </button>
      </div>

      {/* Shaffoflik slideri */}
      <div className="opacity-slider-container">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity:0.8, flexShrink:0 }}>
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor"/>
        </svg>
        <input type="range" min="0" max="1" step="0.05" value={layerOpacity}
          onChange={e => setLayerOpacity(parseFloat(e.target.value))}
          className="opacity-range" aria-label="Qatlam shaffofligi"/>
        <span className="opacity-pct">{Math.round(layerOpacity * 100)}%</span>
      </div>

      {/* Legenda */}
      <Legend layer={activeLayer}/>

      {/* Dala tahlili paneli */}
      <FeaturePanel
        feature={selectedFeature?.feature ?? null}
        lat={selectedFeature?.lat}
        lng={selectedFeature?.lng}
        layer={activeLayer}
        onClose={() => setSelectedFeature(null)}
      />

      {/* Yuklanish */}
      <div className={`map-loader${isLoading ? ' visible' : ''}`}>
        <div className="map-loader-box">
          <div className="map-loader-spinner"/>
          <span className="map-loader-text">Ma'lumotlar tahlil qilinmoqda...</span>
        </div>
      </div>

      {/* Xarita */}
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM}
        style={{ width:'100%', height:'100%' }} zoomControl={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri" maxZoom={19}/>
        <MapFitBounds data={activeLayer.data}/>
        <MapControls/>
        {hasFeatures && (
          <GeoJSONLayer key={activeLayer.id} layer={activeLayer} opacity={layerOpacity}
            onEachFeature={onEachFeature} onReady={() => setIsLoading(false)}/>
        )}
        {selectedFeature?.lat != null && !showTahlillar && (
          <Marker position={[selectedFeature.lat, selectedFeature.lng]} icon={PIN_ICON}/>
        )}
      </MapContainer>

      {/* Dashboard overlay — xaritaning ustida */}
      {showTahlillar && (
        <TahlillarDashboard onClose={() => setShowTahlillar(false)}/>
      )}

      {/* AI Chat widget */}
      <AiChat/>
    </div>
  )
}

// ─────────────────────────────────────────────
// AI CHAT WIDGET
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Siz SoilAgroWatch loyihasi bo'yicha AI yordamchisiz.
Faqat quyidagi mavzularda javob bering:
- Tuproq sho'rlanishi va degradatsiyasi
- NDVI, NDWI, SI, BSI indekslari ma'nosi
- Fermerlar uchun agro-maslahatlar
- Orolbo'yi mintaqasi tuproq muammolari
- Sug'orish va melioratsiya tavsiylari
Qisqa, aniq, o'zbek tilida javob bering.`

const INIT_MSG = { role: 'assistant', text: "Salom! Men SoilAgroWatch AI yordamchisiman.\nTuproq holati, indekslar yoki agro-maslahat\nbo'yicha savollaringizga javob beraman 🌱" }

function AiChat() {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([INIT_MSG])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-api-key':     import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-request-in-browser': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
      })
      if (!res.ok) throw new Error('API ' + res.status)
      const data = await res.json()
      const reply = data.content?.[0]?.text ?? 'Javob olishda xato'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Uzr, qayta urinib ko\'ring' }])
    }
    setLoading(false)
  }

  return (
    <>
      <button
        className={`chat-fab${open ? ' chat-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="AI Chat"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <span>🌱 SoilAgroWatch AI</span>
            <button className="chat-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                {m.text.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < m.text.split('\n').length - 1 && <br/>}</span>
                ))}
              </div>
            ))}
            {loading && (
              <div className="chat-bubble chat-bubble--assistant chat-bubble--loading">
                ⏳ Javob tayyorlanmoqda...
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder="Savol bering..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              className="chat-send"
              onClick={send}
              disabled={loading || !input.trim()}
              title="Yuborish"
            >➤</button>
          </div>
        </div>
      )}
    </>
  )
}

export default App
