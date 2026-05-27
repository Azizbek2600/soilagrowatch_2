import { useState, useCallback, useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import DrawMap from './components/DrawMap'
import Sidebar from './components/Sidebar'
import FieldUploadWizard from './components/FieldUploadWizard'
import MapPage from './pages/MapPage'

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
  return feature => {
    const col = palette[feature.properties[PROPERTY_KEY]] ?? '#999999'
    return {
      fillColor:   col,
      fillOpacity: opacity,
      color:       col,
      weight:      1,
      opacity:     opacity,
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
// OB-HAVO KARTASI
// ─────────────────────────────────────────────
function WeatherCard() {
  const [weatherData,  setWeatherData]  = useState(null)
  const [loading,      setLoading]      = useState(true)
  const chartRef      = useRef(null)
  const chartInstance = useRef(null)

  useEffect(() => { loadWeather() }, [])

  useEffect(() => {
    if (!weatherData?.daily?.length || !chartRef.current) return
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
    const ctx  = chartRef.current.getContext('2d')
    const days = weatherData.daily
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(d => fmtDayName(d.date)),
        datasets: [
          {
            label: 'Harorat (°C)',
            data: days.map(d => d.temp != null ? +d.temp.toFixed(1) : null),
            borderColor: '#EF9F27', pointBackgroundColor: '#EF9F27',
            borderWidth: 2, tension: 0.3, yAxisID: 'y', fill: false,
            pointRadius: 3, pointHoverRadius: 5,
          },
          {
            label: "Yog'in (mm)",
            data: days.map(d => +(d.rain ?? 0).toFixed(1)),
            borderColor: '#378ADD', pointBackgroundColor: '#378ADD',
            borderWidth: 2, tension: 0.3, yAxisID: 'y1', fill: false,
            pointRadius: 3, pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
        },
        interaction: { mode: 'index' },
        scales: {
          x: {
            ticks: { font: { size: 10 }, color: '#9BA3AF' },
            grid:  { color: 'rgba(0,0,0,0.05)' },
          },
          y: {
            position: 'left',
            ticks: { font: { size: 10 }, color: '#EF9F27' },
            grid:  { color: 'rgba(0,0,0,0.05)' },
          },
          y1: {
            position: 'right',
            ticks: { font: { size: 10 }, color: '#378ADD' },
            grid:  { drawOnChartArea: false },
          },
        },
      },
    })
    return () => {
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
    }
  }, [weatherData])

  async function loadWeather() {
    try {
      const end   = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'')
      const res = await fetch(
        'https://power.larc.nasa.gov/api/temporal/daily/point' +
        '?parameters=T2M,PRECTOTCORR,WS2M,WD2M&community=AG' +
        `&longitude=59.12&latitude=42.74&start=${fmt(start)}&end=${fmt(end)}&format=JSON`
      )
      if (!res.ok) throw new Error()
      const json   = await res.json()
      const params = json?.properties?.parameter ?? {}
      const t2m    = params.T2M         ?? {}
      const prec   = params.PRECTOTCORR ?? {}
      const ws2m   = params.WS2M        ?? {}
      const wd2m   = params.WD2M        ?? {}
      const dates  = Object.keys(t2m).filter(k => k !== 'FILL_VALUE').sort()
      const daily  = dates.map(date => ({
        date,
        temp:    t2m[date]  > -900 ? t2m[date]  : null,
        rain:    prec[date] >= 0   ? prec[date]  : 0,
        wind:    ws2m[date] > -900 ? ws2m[date]  : null,
        windDir: wd2m[date] >= 0   ? wd2m[date]  : null,
      })).filter(d => d.temp !== null).slice(-7)
      setWeatherData({ daily })
    } catch {
      setWeatherData({ daily: mockDaily() })
    }
    setLoading(false)
  }

  function mockDaily() {
    return [
      { date:'20250426', temp:20.1, rain:0.0, wind:3.2, windDir:180 },
      { date:'20250427', temp:22.4, rain:0.0, wind:2.8, windDir:200 },
      { date:'20250428', temp:19.8, rain:0.0, wind:4.1, windDir:160 },
      { date:'20250429', temp:16.5, rain:0.4, wind:3.5, windDir:220 },
      { date:'20250430', temp:14.2, rain:0.0, wind:5.2, windDir:270 },
      { date:'20250501', temp:17.9, rain:1.8, wind:2.1, windDir:140 },
      { date:'20250502', temp:21.1, rain:0.1, wind:3.8, windDir:190 },
    ]
  }

  function fmtDayName(s) {
    const dow = ['Yak','Dsh','Sesh','Chsh','Psh','Jm','Sh']
    const d = new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))
    return dow[d.getDay()]
  }

  function windDirLabel(deg) {
    if (deg == null || deg < 0) return '—'
    const dirs = ['Shimol','Sh-Sharq','Sharq','J-Sharq','Janub','J-G\'arb','G\'arb','Sh-G\'arb']
    return dirs[Math.round(deg / 45) % 8]
  }

  if (loading) {
    return (
      <div className="wc-card">
        <div className="wc-loading">
          <div className="map-loader-spinner" style={{ width:20, height:20, borderWidth:2 }}/>
          <span>Ob-havo ma'lumoti yuklanmoqda...</span>
        </div>
      </div>
    )
  }

  const days       = weatherData?.daily ?? []
  const today      = days[days.length - 1]
  const totalRain7 = days.reduce((s, d) => s + (d.rain ?? 0), 0)
  const avgTemp    = days.length ? days.reduce((s,d) => s+(d.temp??0),0)/days.length : null
  const alertLevel = totalRain7 < 5 ? 'danger' : totalRain7 <= 15 ? 'warn' : 'good'
  const alertText  = {
    danger: `Qurg'oqchilik xavfi — 7 kunda ${totalRain7.toFixed(1)} mm yog'in. Harorat ko'tarilmoqda.`,
    warn:   "Yog'in me'yorda — dalani kuzating",
    good:   "Yog'in yetarli — sug'orish shart emas",
  }[alertLevel]
  const alertIcon  = { danger: 'ti-alert-triangle', warn: 'ti-alert-circle', good: 'ti-circle-check' }[alertLevel]
  const rainValCls = totalRain7 < 5 ? 'wc-val--red' : totalRain7 <= 15 ? 'wc-val--yellow' : 'wc-val--blue'

  return (
    <div className="wc-card">

      {/* ── Header ── */}
      <div className="wc-header">
        <div className="wc-header-left">
          <div className="wc-icon"><i className="ti ti-cloud"/></div>
          <span className="wc-title">Ob-havo prognozi</span>
        </div>
        <span className="wc-nasa-badge">NASA POWER</span>
      </div>

      {/* ── Alert ── */}
      <div className={`wc-alert wc-alert--${alertLevel}`}>
        <i className={`ti ${alertIcon}`}/>
        {alertText}
      </div>

      {/* ── 3 Metrics ── */}
      <div className="wc-metrics">
        <div className="wc-metric">
          <div className="wc-metric-label">Bugungi harorat</div>
          <div className="wc-metric-val">
            {today?.temp != null ? `${today.temp.toFixed(1)}°C` : '—'}
          </div>
          <div className="wc-metric-sub">
            O'rtacha: {avgTemp != null ? `${avgTemp.toFixed(1)}°C` : '—'}
          </div>
        </div>
        <div className="wc-metric wc-metric--mid">
          <div className="wc-metric-label">Yog'in (7 kun)</div>
          <div className={`wc-metric-val ${rainValCls}`}>{totalRain7.toFixed(1)} mm</div>
          <div className="wc-metric-sub">Norma: 12–15 mm</div>
        </div>
        <div className="wc-metric">
          <div className="wc-metric-label">Shamol tezligi</div>
          <div className="wc-metric-val">
            {today?.wind != null ? `${today.wind.toFixed(1)} m/s` : '—'}
          </div>
          <div className="wc-metric-sub">{windDirLabel(today?.windDir)}</div>
        </div>
      </div>

      {/* ── 7-day forecast ── */}
      <div className="wc-forecast">
        {days.map((d, i) => {
          const isToday = i === days.length - 1
          const icon = d.rain > 1
            ? { cls: 'ti-cloud-rain', color: '#378ADD' }
            : d.rain > 0.1
            ? { cls: 'ti-cloud',      color: '#9BA3AF' }
            : { cls: 'ti-sun',        color: '#EF9F27' }
          return (
            <div key={d.date} className={`wc-day${isToday ? ' wc-day--today' : ''}`}>
              <div className="wc-day-name">{isToday ? 'Bugun' : fmtDayName(d.date)}</div>
              <i className={`ti ${icon.cls} wc-day-icon`} style={{ color: icon.color }}/>
              <div className="wc-day-temp">{d.temp != null ? `${d.temp.toFixed(0)}°` : '—'}</div>
              <div className={`wc-day-rain${d.rain > 0 ? ' wc-day-rain--wet' : ' wc-day-rain--dry'}`}>
                {d.rain > 0 ? `${d.rain.toFixed(1)} mm` : '0 mm'}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Chart ── */}
      <div className="wc-chart-section">
        <div className="wc-chart-header">
          <span className="wc-chart-title">Harorat va yog'in — oxirgi 7 kun</span>
          <div className="wc-chart-legend">
            <span className="wc-legend-dot" style={{ background:'#EF9F27' }}/>
            <span className="wc-legend-label">Harorat</span>
            <span className="wc-legend-dot" style={{ background:'#378ADD' }}/>
            <span className="wc-legend-label">Yog'in</span>
          </div>
        </div>
        <div className="wc-chart-wrap">
          <canvas ref={chartRef} id="weatherChart"/>
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// MODAL: Laboratoriya natijasini yuklash
// ─────────────────────────────────────────────
function UploadModal({ onClose }) {
  const [done,    setDone]    = useState(false)
  const [manual,  setManual]  = useState({ ph:'', ec:'', organic:'', sar:'' })
  const [file,    setFile]    = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit(e) {
    e.preventDefault()
    setDone(true)
  }

  return (
    <div className="lm-backdrop" onClick={onClose}>
      <div className="lm-box" onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <span>Laboratoriya tahlilini yuklash</span>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="lm-success">
            ✅ Rahmat! Natija qabul qilindi va AI modeliga qo'shildi
          </div>
        ) : (
          <form className="lm-body" onSubmit={handleSubmit}>
            <p className="lm-desc">
              Agar sizda mustaqil laboratoriya natijasi bo'lsa, uni shu yerga yuklang.
              Bizning AI modelimiz natijani o'rganib, kelajakdagi tahlillar aniqligini oshiradi.
            </p>

            <label className="lm-label">Fayl yuklash (PDF, JPG, PNG)</label>
            <input
              type="file" accept=".pdf,.jpg,.jpeg,.png"
              className="lm-file"
              onChange={e => setFile(e.target.files[0])}
            />

            <div className="lm-divider"><span>yoki qo'lda kiriting</span></div>

            <div className="lm-grid">
              {[
                { key:'ph',      label:'pH darajasi',   placeholder:'7.0' },
                { key:'ec',      label:'EC (dS/m)',      placeholder:'4.0' },
                { key:'organic', label:'Organik modda (%)', placeholder:'1.5' },
                { key:'sar',     label:'SAR',            placeholder:'10.0' },
              ].map(f => (
                <div key={f.key} className="lm-field">
                  <label className="lm-field-label">{f.label}</label>
                  <input
                    type="number" step="0.1" placeholder={f.placeholder}
                    className="lm-input"
                    value={manual[f.key]}
                    onChange={e => setManual(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <button type="submit" className="lm-submit">Yuborish</button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MODAL: Laboratoriya buyurtma
// ─────────────────────────────────────────────
function OrderModal({ onClose }) {
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ name:'', phone:'', region:'', area:'', note:'' })

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  function handleSubmit(e) {
    e.preventDefault()
    setDone(true)
  }

  return (
    <div className="lm-backdrop" onClick={onClose}>
      <div className="lm-box" onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <span>Tuproq tahlili xizmati</span>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="lm-success">
            ✅ Buyurtmangiz qabul qilindi! 24 soat ichida bog'lanamiz
          </div>
        ) : (
          <form className="lm-body" onSubmit={handleSubmit}>
            <p className="lm-desc">
              Bizning hamkor laboratoriyamiz sizning yeringizdan namuna olib, to'liq tahlil qiladi.
              Natija 5–7 kun ichida tayyor bo'ladi va avtomatik tarzda tizimga yuklanadi.
            </p>

            <div className="lm-grid">
              <div className="lm-field lm-field--full">
                <label className="lm-field-label">Ism *</label>
                <input required className="lm-input" placeholder="To'liq ismingiz" value={form.name} onChange={set('name')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">Telefon *</label>
                <input required className="lm-input" placeholder="+998 90 000 00 00" value={form.phone} onChange={set('phone')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">Hudud *</label>
                <input required className="lm-input" placeholder="Tuman, qishloq" value={form.region} onChange={set('region')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">Maydon (gektar)</label>
                <input type="number" min="0" step="0.1" className="lm-input" placeholder="10.0" value={form.area} onChange={set('area')}/>
              </div>
              <div className="lm-field lm-field--full">
                <label className="lm-field-label">Izoh</label>
                <textarea className="lm-input lm-textarea" placeholder="Qo'shimcha ma'lumot..." value={form.note} onChange={set('note')}/>
              </div>
            </div>

            <div className="lm-price">💰 Narx: <strong>250,000 so'm / namuna</strong></div>

            <button type="submit" className="lm-submit">Buyurtma berish</button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MONITORING CARDS — 3 expandable stat cards
// ─────────────────────────────────────────────
function MonitoringCards({ analysisData, polygonData, mounted }) {
  const [open, setOpen] = useState(false)
  const [wx,   setWx]   = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const end   = new Date()
        const start = new Date(end)
        start.setDate(start.getDate() - 7)
        const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
        const res = await fetch(
          'https://power.larc.nasa.gov/api/temporal/daily/point' +
          '?parameters=T2M,PRECTOTCORR&community=AG' +
          `&longitude=59.12&latitude=42.74&start=${fmt(start)}&end=${fmt(end)}&format=JSON`
        )
        if (!res.ok) throw new Error()
        const json = await res.json()
        const t2m  = json?.properties?.parameter?.T2M         ?? {}
        const prec = json?.properties?.parameter?.PRECTOTCORR ?? {}
        const days = Object.keys(t2m).filter(k => k !== 'FILL_VALUE').sort()
          .map(date => ({ date, temp: t2m[date], rain: prec[date] }))
          .filter(d => d.temp != null && d.temp > -900)
        const totalRain7 = days.reduce((s, d) => s + (d.rain || 0), 0)
        const lastTemp   = days.length ? days[days.length - 1].temp : null
        const nextDays   = days.slice(-3)
        setWx({ days, totalRain7, lastTemp, nextDays })
      } catch {
        setWx({ days: [], totalRain7: 0, lastTemp: null, nextDays: [] })
      }
    }
    load()
  }, [])

  const toggle = () => setOpen(v => !v)

  /* ── Karta 1: Monitoring maydoni ── */
  const totalHa    = polygonData?.reduce((s, p) => s + p.ha, 0) ?? 0
  const totalM2    = Math.round(totalHa * 10000)
  const fieldCount = polygonData?.length ?? 0
  const hasArea    = totalHa > 0
  const isGee      = analysisData?.source === 'GEE'
  const tahlilDate = analysisData?.period ?? '—'
  const sourceLabel = isGee ? 'Sentinel-2 · GEE' : analysisData?.source === 'local' ? "Mahalliy ma'lumot" : '—'

  /* ── Karta 2: Tuproq sho'rlanishi ── */
  const siVal    = analysisData?.si?.avg ?? null
  const hasSI    = siVal != null && !analysisData?.empty
  const siStatus = !hasSI ? null
    : isGee
      ? siVal < 0.05 ? 'good' : siVal <= 0.2 ? 'mid' : 'bad'
      : siVal <= 2   ? 'good' : siVal <= 3.5  ? 'mid' : 'bad'
  const siLabel = !hasSI ? '—'
    : siStatus === 'good' ? 'Yaxshi'
    : siStatus === 'mid'  ? "O'rtacha"
    : 'Yuqori'
  const siBadge = !hasSI ? null
    : siStatus === 'good' ? { text: 'Yaxshi',  cls: 'good' }
    : siStatus === 'mid'  ? { text: 'Diqqat',  cls: 'mid'  }
    : { text: 'Xavfli', cls: 'bad' }
  const siBars = hasSI ? (() => {
    const norm    = isGee ? Math.min(siVal / 0.3, 1) : Math.min((siVal - 1) / 4, 1)
    const badPct  = Math.round(Math.max(0, 70 * norm * norm))
    const goodPct = Math.round(Math.max(0, 90 - 85 * norm))
    const midPct  = Math.max(0, 100 - goodPct - badPct)
    return [
      { label: "Sho'rlanmagan",    pct: goodPct, color: '#1B7C45' },
      { label: "O'rtacha sho'r",   pct: midPct,  color: '#B45309' },
      { label: "Kuchli sho'r",     pct: badPct,  color: '#DC2626' },
    ]
  })() : null
  const badSIPct = siBars?.[2]?.pct ?? 0

  /* ── Karta 3: Ob-havo ── */
  const isDrought    = wx != null && wx.totalRain7 < 5
  const isHeat       = wx != null && wx.lastTemp != null && wx.lastTemp > 30
  const wxValueLabel = !wx ? '…'
    : isDrought ? "Qurg'oqlik"
    : (wx.totalRain7 > 20) ? "Yomg'irli"
    : 'Normal'
  const wxBadge = !wx ? null
    : (isDrought || isHeat) ? { text: 'Xavf bor', cls: 'bad' }
    : wx.totalRain7 > 20    ? { text: 'Yaxshi',   cls: 'good' }
    : { text: 'Normal', cls: 'mid' }
  const wxIcon = isDrought || isHeat ? 'ti-sun' : (wx?.totalRain7 ?? 0) > 5 ? 'ti-cloud-rain' : 'ti-sun'
  const wxIconCls = (isDrought || isHeat) ? 'mc-icon-box--red' : (wx?.totalRain7 ?? 0) > 5 ? 'mc-icon-box--blue' : 'mc-icon-box--yellow'
  const wxSubText = !wx ? ''
    : isDrought ? `Oxirgi 7 kunda yog'in yo'q (${wx.totalRain7.toFixed(1)} mm)`
    : `Yog'in: ${wx.totalRain7.toFixed(1)} mm`

  function fmtDate(s) {
    const m = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Nov','Dek']
    if (!s || s.length < 8) return s
    return `${s.slice(6)}-${m[parseInt(s.slice(4,6))-1]}`
  }

  const Chevron = () => (
    <i className="ti ti-chevron-down mc-chevron"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
  )

  return (
    <div className="mc-grid">

      {/* ══════ KARTA 1 — MONITORING MAYDONI ══════ */}
      <div className="mc-card">
        <div className="mc-top">
          <div className="mc-icon-box mc-icon-box--green">
            <i className="ti ti-map-2"/>
          </div>
          <div className="mc-info">
            <div className="mc-label-row">
              <span className="mc-label">MONITORING MAYDONI</span>
              {hasArea && <span className="mc-badge mc-badge--good">Faol</span>}
            </div>
            <div className={`mc-value ${hasArea ? 'mc-value--green' : 'mc-value--dim'}`}>
              {hasArea ? `${totalHa.toFixed(2)} ga` : 'Tanlanmagan'}
            </div>
            <div className="mc-sub">
              {hasArea ? `${totalM2.toLocaleString()} m²` : 'Polygon chizing'}
            </div>
          </div>
          <button className="mc-toggle" onClick={toggle} aria-label="Batafsil">
            <Chevron/>
          </button>
        </div>

        <div className="mc-detail" style={{ maxHeight: open ? '260px' : '0' }}>
          <div className="mc-divider"/>
          <div className="mc-detail-inner">
            {!hasArea ? (
              <p className="mc-empty">Dala chizish rejimida polygon belgilang</p>
            ) : (
              <div className="mc-rows">
                <div className="mc-row">
                  <span className="mc-row-key">Dalalar soni</span>
                  <span className="mc-row-val">{fieldCount} ta</span>
                </div>
                <div className="mc-row">
                  <span className="mc-row-key">Tahlil sanasi</span>
                  <span className="mc-row-val">{tahlilDate}</span>
                </div>
                <div className="mc-row">
                  <span className="mc-row-key">Ma'lumot manbai</span>
                  <span className="mc-row-val">{sourceLabel}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════ KARTA 2 — TUPROQ SHO'RLANISHI ══════ */}
      <div className="mc-card">
        <div className="mc-top">
          <div className="mc-icon-box mc-icon-box--yellow">
            <i className="ti ti-droplet-half-2"/>
          </div>
          <div className="mc-info">
            <div className="mc-label-row">
              <span className="mc-label">TUPROQ SHO'RLANISHI</span>
              {siBadge && (
                <span className={`mc-badge mc-badge--${siBadge.cls}`}>{siBadge.text}</span>
              )}
            </div>
            <div className={`mc-value ${siStatus === 'good' ? 'mc-value--green' : siStatus === 'mid' ? 'mc-value--yellow' : siStatus === 'bad' ? 'mc-value--red' : 'mc-value--dim'}`}>
              {siLabel}
            </div>
            <div className="mc-sub">
              {hasSI ? `SI indeksi: ${isGee ? siVal.toFixed(4) : siVal.toFixed(2)}` : 'Tahlil kutilmoqda'}
            </div>
          </div>
          <button className="mc-toggle" onClick={toggle} aria-label="Batafsil">
            <Chevron/>
          </button>
        </div>

        <div className="mc-detail" style={{ maxHeight: open ? '260px' : '0' }}>
          <div className="mc-divider"/>
          <div className="mc-detail-inner">
            {!hasSI ? (
              <p className="mc-empty">Polygon chizib GEE tahlilini bajaring</p>
            ) : (
              <>
                {siBars.map(bar => (
                  <div key={bar.label} className="mc-bar-item">
                    <span className="mc-bar-label">{bar.label}</span>
                    <div className="mc-bar-track">
                      <div className="mc-bar-fill"
                        style={{ width: mounted ? `${bar.pct}%` : '0%', background: bar.color }}/>
                    </div>
                    <span className="mc-bar-pct">{bar.pct}%</span>
                  </div>
                ))}
                {badSIPct > 10 && (
                  <div className="mc-alert-row mc-alert-row--yellow">
                    <i className="ti ti-alert-triangle"/>
                    {badSIPct}% maydon yuvish (промывка) talab qiladi
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ══════ KARTA 3 — OB-HAVO HOLATI ══════ */}
      <div className="mc-card">
        <div className="mc-top">
          <div className={`mc-icon-box ${wxIconCls}`}>
            <i className={`ti ${wxIcon}`}/>
          </div>
          <div className="mc-info">
            <div className="mc-label-row">
              <span className="mc-label">OB-HAVO HOLATI</span>
              {wxBadge && (
                <span className={`mc-badge mc-badge--${wxBadge.cls}`}>{wxBadge.text}</span>
              )}
            </div>
            <div className={`mc-value ${(isDrought || isHeat) ? 'mc-value--red' : wx ? 'mc-value--green' : 'mc-value--dim'}`}>
              {wxValueLabel}
            </div>
            <div className="mc-sub">{wxSubText || 'NASA POWER yuklanmoqda…'}</div>
          </div>
          <button className="mc-toggle" onClick={toggle} aria-label="Batafsil">
            <Chevron/>
          </button>
        </div>

        <div className="mc-detail" style={{ maxHeight: open ? '260px' : '0' }}>
          <div className="mc-divider"/>
          <div className="mc-detail-inner">
            {!wx ? (
              <p className="mc-empty">NASA POWER ma'lumotlari yuklanmoqda…</p>
            ) : (
              <>
                <div className="mc-rows">
                  <div className="mc-row">
                    <span className="mc-row-key">Bugungi harorat</span>
                    <span className="mc-row-val">
                      {wx.lastTemp != null ? `${wx.lastTemp.toFixed(1)}°C` : '—'}
                    </span>
                  </div>
                  <div className="mc-row">
                    <span className="mc-row-key">7 kunlik yog'in</span>
                    <span className="mc-row-val">{wx.totalRain7.toFixed(1)} mm</span>
                  </div>
                  {wx.nextDays.length > 0 && (
                    <div className="mc-row">
                      <span className="mc-row-key">Oxirgi 3 kun</span>
                      <span className="mc-row-val">
                        {wx.nextDays.map(d => `${fmtDate(d.date)} ${d.temp?.toFixed(0)}°`).join(' · ')}
                      </span>
                    </div>
                  )}
                  <div className="mc-row">
                    <span className="mc-row-key">Manba</span>
                    <span className="mc-row-val">NASA POWER</span>
                  </div>
                </div>
                {(isHeat || isDrought) && (
                  <div className="mc-alert-row mc-alert-row--red">
                    <i className="ti ti-alert-triangle"/>
                    Harorat ko'tarilmoqda — bug'lanish ortib ketishi mumkin
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// SOIL INDICES TABLE
// ─────────────────────────────────────────────
const INDEX_META = [
  {
    key: 'ndvi', label: 'NDVI', desc: "O'simlik qoplami", geeOnly: false,
    status:      (v, gee) => gee ? (v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad')
                                 : (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'bad'),
    statusLabel: (v, gee) => gee ? (v >= 0.4 ? 'Yaxshi' : v >= 0.2 ? "O'rtacha" : 'Past')
                                 : (v >= 3.5 ? 'Yaxshi' : v >= 2.5 ? "O'rtacha" : 'Past'),
  },
  {
    key: 'ndwi', label: 'NDWI', desc: 'Namlik indeksi', geeOnly: false,
    status:      (v, gee) => gee ? (v >= 0 ? 'good' : v >= -0.2 ? 'mid' : 'bad')
                                 : (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'bad'),
    statusLabel: (v, gee) => gee ? (v >= 0 ? 'Namli' : v >= -0.2 ? "O'rtacha" : 'Quruq')
                                 : (v >= 3.5 ? 'Namli' : v >= 2.5 ? "O'rtacha" : 'Quruq'),
  },
  {
    key: 'si', label: 'SI', desc: "Sho'rlanish indeksi", geeOnly: false,
    status:      (v, gee) => gee ? (v < 0.05 ? 'good' : v <= 0.2 ? 'mid' : 'bad')
                                 : (v <= 2 ? 'good' : v <= 3 ? 'mid' : 'bad'),
    statusLabel: (v, gee) => gee ? (v < 0.05 ? "Sho'rsiz" : v <= 0.2 ? "O'rtacha" : "Sho'rlangan")
                                 : (v <= 2 ? "Sho'rsiz" : v <= 3 ? "O'rtacha" : "Sho'rlangan"),
  },
  {
    key: 'bsi', label: 'BSI', desc: 'Yalangoch tuproq', geeOnly: false,
    status:      (v, gee) => gee ? (v <= 0 ? 'good' : v <= 0.1 ? 'mid' : 'bad')
                                 : (v <= 2 ? 'good' : v <= 3 ? 'mid' : 'bad'),
    statusLabel: (v, gee) => gee ? (v <= 0 ? 'Qoplangan' : v <= 0.1 ? "O'rtacha" : 'Yalangoch')
                                 : (v <= 2 ? 'Qoplangan' : v <= 3 ? "O'rtacha" : 'Yalangoch'),
  },
  {
    key: 'ndre', label: 'NDRE', desc: "O'simlik sog'lig'i", geeOnly: true,
    status:      (v) => v >= 0.3 ? 'good' : v >= 0.15 ? 'mid' : 'bad',
    statusLabel: (v) => v >= 0.3 ? "Sog'lom" : v >= 0.15 ? "O'rtacha" : 'Zaif',
  },
  {
    key: 'msavi', label: 'MSAVI', desc: "Tuproq ta'siri", geeOnly: true,
    status:      (v) => v >= 0.3 ? 'good' : v >= 0.15 ? 'mid' : 'bad',
    statusLabel: (v) => v >= 0.3 ? 'Yaxshi' : v >= 0.15 ? "O'rtacha" : 'Past',
  },
  {
    key: 'smi', label: 'SMI', desc: 'Tuproq namligi', geeOnly: true,
    status:      (v) => v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad',
    statusLabel: (v) => v >= 0.4 ? 'Namli' : v >= 0.2 ? "O'rtacha" : 'Quruq',
  },
]

function SoilIndicesTable({ analysisData }) {
  const wrapRef = useRef(null)
  const [vThumb, setVThumb] = useState({ top: 0, height: 0, visible: false })

  function updateThumbs() {
    const el = wrapRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight > clientHeight + 2) {
      const thumbH = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
      const maxScr = scrollHeight - clientHeight
      const thumbT = maxScr > 0 ? (scrollTop / maxScr) * (clientHeight - thumbH) : 0
      setVThumb({ top: thumbT, height: thumbH, visible: true })
    } else {
      setVThumb(v => ({ ...v, visible: false }))
    }
  }

  useEffect(() => {
    updateThumbs()
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(updateThumbs)
    ro.observe(el)
    return () => ro.disconnect()
  }, [analysisData])

  const isGee = analysisData?.source === 'GEE'
  const year  = analysisData?.year ?? '—'
  const rows  = INDEX_META.filter(m => !m.geeOnly || isGee)

  return (
    <div className="sit-card">
      <div className="sit-header">
        <div className="sit-header-left">
          <div className="sit-icon-box"><i className="ti ti-leaf"/></div>
          <div>
            <div className="sit-title">Tuproq indekslari</div>
            <div className="sit-subtitle">Sentinel-2 · {year}</div>
          </div>
        </div>
        {isGee && <span className="sit-gee-badge">GEE</span>}
      </div>

      <div className="sit-scroll-outer">
        <div className="sit-scroll" ref={wrapRef} onScroll={updateThumbs}>
          <table className="sit-table">
            <thead>
              <tr>
                <th>Indeks</th>
                <th>Nima o'lchaydi</th>
                <th>Qiymat</th>
                <th>Holati</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => {
                const entry = analysisData && !analysisData.empty ? analysisData[m.key] : null
                const val   = entry?.avg ?? null
                const st    = val != null ? m.status(val, isGee) : null
                const stLbl = val != null ? m.statusLabel(val, isGee) : null
                return (
                  <tr key={m.key}>
                    <td className="sit-td-key">
                      <span className="sit-idx-label">{m.label}</span>
                      {m.geeOnly && <span className="sit-gee-mini">GEE</span>}
                    </td>
                    <td className="sit-td-desc">{m.desc}</td>
                    <td className="sit-td-val">{val != null ? val.toFixed(4) : '—'}</td>
                    <td className="sit-td-status">
                      {st
                        ? <span className={`sit-badge sit-badge--${st}`}>{stLbl}</span>
                        : <span className="sit-dim">—</span>}
                    </td>
                    <td className="sit-td-trend"><span className="sit-dim">—</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {vThumb.visible && (
          <div className="sit-vscroll">
            <div className="sit-vthumb" style={{ top: vThumb.top, height: vThumb.height }}/>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LABORATORIYA TAHLILI KARTASI
// ─────────────────────────────────────────────
const LAB_DATA = {
  date: '02-May 2024',
  ph: 7.2, ec: 4.8, sar: 12.3,
  nitrogen: 18, phosphorus: 28, potassium: 190, humus: 1.2,
}

const SOIL_ROWS = [
  { key: 'ph',  name: 'pH',  desc: 'Tuproq kislotaligi',         norm: '6.5 – 7.5',    unit: ''     },
  { key: 'ec',  name: 'EC',  desc: "Elektr o'tkazuvchanlik",     norm: '< 2.0 dS/m',   unit: 'dS/m' },
  { key: 'sar', name: 'SAR', desc: 'Natriy absorbsiya nisbati',  norm: '< 9.0',         unit: ''     },
]

const NUTR_ROWS = [
  { key: 'nitrogen',   name: 'Azot (N)',   desc: 'Asosiy oziqa element',  norm: '40–60 mg/kg',   unit: 'mg/kg' },
  { key: 'phosphorus', name: 'Fosfor (P)', desc: 'Ildiz va gul rivojida', norm: '20–40 mg/kg',   unit: 'mg/kg' },
  { key: 'potassium',  name: 'Kaliy (K)',  desc: 'Hosil sifati',          norm: '200–400 mg/kg', unit: 'mg/kg' },
  { key: 'humus',      name: 'Gumus',      desc: 'Organik modda miqdori', norm: '> 2.0 %',       unit: '%'     },
]

function labStatus(key, val) {
  if (val == null) return null
  switch (key) {
    case 'ph':
      if (val >= 6.5 && val <= 7.5) return { label: 'Normal',    cls: 'good' }
      if (val < 6.0  || val > 8.0)  return { label: 'Xavfli',    cls: 'bad'  }
      return                               { label: "O'rtacha",   cls: 'mid'  }
    case 'ec':
      if (val < 2.0)  return { label: 'Normal', cls: 'good' }
      if (val <= 4.0) return { label: 'Yuqori', cls: 'mid'  }
      return                 { label: 'Xavfli', cls: 'bad'  }
    case 'sar':
      if (val < 9.0)   return { label: 'Normal', cls: 'good' }
      if (val <= 18.0) return { label: 'Yuqori', cls: 'mid'  }
      return                  { label: 'Xavfli', cls: 'bad'  }
    case 'nitrogen':
      if (val > 40)  return { label: 'Normal',    cls: 'good' }
      if (val >= 20) return { label: 'Past',       cls: 'mid'  }
      return               { label: 'Juda past',  cls: 'bad'  }
    case 'phosphorus':
      if (val > 20)  return { label: 'Normal',    cls: 'good' }
      if (val >= 10) return { label: 'Past',       cls: 'mid'  }
      return               { label: 'Juda past',  cls: 'bad'  }
    case 'potassium':
      if (val > 200)  return { label: 'Normal',   cls: 'good' }
      if (val >= 100) return { label: "O'rtacha", cls: 'mid'  }
      return                { label: 'Past',       cls: 'bad'  }
    case 'humus':
      if (val > 2.0)  return { label: 'Normal',    cls: 'good' }
      if (val >= 1.0) return { label: 'Past',       cls: 'mid'  }
      return                { label: 'Juda past',  cls: 'bad'  }
    default: return null
  }
}

function labBarPct(key, val) {
  if (val == null) return 0
  const map = { ph: [5.5, 3.5], ec: [0, 6], sar: [0, 25], nitrogen: [0, 80], phosphorus: [0, 50], potassium: [0, 500], humus: [0, 4] }
  const [base, range] = map[key] ?? [0, 100]
  return Math.min(100, Math.max(0, ((val - base) / range) * 100))
}

const LB_BAR_COLOR = { good: '#1B7C45', mid: '#EF9F27', bad: '#E24B4A' }

function LabCard({ onGoToLab }) {
  const [panel, setPanel] = useState('soil')
  const labData = LAB_DATA

  const allRows    = [...SOIL_ROWS, ...NUTR_ROWS]
  const dangerRows = allRows.filter(r => labStatus(r.key, labData?.[r.key])?.cls === 'bad')
  const alertLevel = dangerRows.length > 0 ? 'danger' : 'good'

  const rows = panel === 'soil' ? SOIL_ROWS : NUTR_ROWS

  if (!labData) {
    return (
      <div className="lb-card">
        <div className="lb-header">
          <div className="lb-header-left">
            <div className="lb-icon"><i className="ti ti-flask"/></div>
            <span className="lb-title">Laboratoriya tahlili</span>
          </div>
        </div>
        <div className="lb-empty">
          <i className="ti ti-flask-off lb-empty-icon"/>
          <p className="lb-empty-text">Laboratoriya tahlili natijasi yuklanmagan</p>
          <button className="lb-empty-btn" onClick={onGoToLab}>
            <i className="ti ti-upload"/> Natija yuklash
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lb-card">

      {/* ── Sarlavha ── */}
      <div className="lb-header">
        <div className="lb-header-left">
          <div className="lb-icon"><i className="ti ti-flask"/></div>
          <span className="lb-title">Laboratoriya tahlili</span>
        </div>
        <span className="lb-date">Tahlil sanasi: {labData.date}</span>
      </div>

      {/* ── Boshqaruv ── */}
      <div className="lb-controls">
        <div className="lb-toggle-group">
          <button
            className={`lb-toggle${panel === 'soil' ? ' lb-toggle--active' : ''}`}
            onClick={() => setPanel('soil')}
          >Tuproq muhiti</button>
          <button
            className={`lb-toggle${panel === 'nutrients' ? ' lb-toggle--active' : ''}`}
            onClick={() => setPanel('nutrients')}
          >Oziqa moddalari</button>
        </div>
        <button className="lb-pdf-btn" onClick={() => alert('PDF hisobot tayyorlanmoqda...')}>
          <i className="ti ti-file-download"/> PDF
        </button>
      </div>

      {/* ── Ogohlantirish ── */}
      <div className={`lb-alert lb-alert--${alertLevel}`}>
        <i className={`ti ${alertLevel === 'danger' ? 'ti-alert-triangle' : 'ti-circle-check'}`}/>
        {alertLevel === 'danger'
          ? `${dangerRows.length} ko'rsatkich xavfli — ${dangerRows.map(r => r.name).join(', ')} me'yordan yuqori.`
          : "Barcha ko'rsatkichlar me'yor doirasida"
        }
      </div>

      {/* ── Jadval ── */}
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th>Ko'rsatkich</th>
              <th>Me'yor</th>
              <th>Daraja</th>
              <th>Holati</th>
              <th>Qiymat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const val   = labData[row.key] ?? null
              const st    = labStatus(row.key, val)
              const pct   = labBarPct(row.key, val)
              const barClr = LB_BAR_COLOR[st?.cls ?? 'mid']
              return (
                <tr key={row.key}>
                  <td className="lb-td-name">
                    <div className="lb-row-name">{row.name}</div>
                    <div className="lb-row-desc">{row.desc}</div>
                  </td>
                  <td className="lb-td-norm">{row.norm}</td>
                  <td className="lb-td-bar">
                    <div className="lb-bar-track">
                      <div className="lb-bar-fill" style={{ width: `${pct}%`, background: barClr }}/>
                    </div>
                  </td>
                  <td className="lb-td-status">
                    {st
                      ? <span className={`lb-badge lb-badge--${st.cls}`}>{st.label}</span>
                      : <span className="lb-dim">—</span>}
                  </td>
                  <td className="lb-td-val">
                    {val != null
                      ? <>{Number.isInteger(val) ? val : val.toFixed(val < 10 ? 1 : 0)}{row.unit ? <span className="lb-unit"> {row.unit}</span> : ''}</>
                      : <span className="lb-dim">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// TAHLILLAR DASHBOARD (full-screen overlay)
// ─────────────────────────────────────────────
function TahlillarDashboard({ onClose, analysisData, polygonData }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

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

        {/* ── 1. YUQORI: 3 monitoring karta ── */}
        <MonitoringCards
          analysisData={analysisData}
          polygonData={polygonData}
          mounted={mounted}
        />

        {/* ── 1b. TUPROQ INDEKSLARI JADVALI ── */}
        <SoilIndicesTable analysisData={analysisData} />

        {/* ── 2. OB-HAVO ── */}
        <WeatherCard />

        {/* ── 3. LABORATORIYA ── */}
        <LabCard />

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
  const [activeTab,       setActiveTab]       = useState('xarita')
  const [importedField,   setImportedField]   = useState(null)
  const [dashAnalysis,    setDashAnalysis]    = useState(null)
  const [dashPolygons,    setDashPolygons]    = useState([])

  const showDraw        = activeTab === 'dala' || activeTab === 'ndre' || activeTab === 'msavi' || activeTab === 'smi' || activeTab === 'ai-detect'
  const showFieldWizard = activeTab === 'fayl-yuklash'

  const hasFeatures = activeLayer.data?.features?.length > 0

  function handleLayerChange(layer) {
    setActiveLayer(layer)
    setSelectedFeature(null)
    setIsLoading(true)
    setShowTahlillar(false)
    setActiveTab(layer.id)
  }

  const LAYER_IDS = new Set(LAYERS.map(l => l.id))

  function handleTabChange(tabId) {
    setActiveTab(tabId)
    setSelectedFeature(null)
    if (LAYER_IDS.has(tabId)) {
      const layer = LAYERS.find(l => l.id === tabId)
      setActiveLayer(layer)
      setIsLoading(true)
      setShowTahlillar(false)
    } else if (tabId === 'dashboard' || tabId === 'laboratoriya') {
      setShowTahlillar(true)
    } else {
      setShowTahlillar(false)
    }
  }

  const onEachFeature = useCallback((feature, leafletLayer) => {
    leafletLayer.on('click', e => {
      setShowTahlillar(false)
      setSelectedFeature({ feature, lat: e.latlng.lat, lng: e.latlng.lng })
    })
  }, [])

  return (
    <div className="app-layout">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 'xarita' ? (
        <MapPage onTabChange={handleTabChange} />
      ) : (
      <div className="app-main">

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
          url="https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          attribution="© Google" maxZoom={21} subdomains="0123"/>
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
        <TahlillarDashboard
          onClose={() => { setShowTahlillar(false); setActiveTab('xarita') }}
          analysisData={dashAnalysis}
          polygonData={dashPolygons}
        />
      )}

      {/* Dala chizish overlay */}
      {showDraw && (
        <DrawMap
          activeTab={activeTab}
          onTabChange={setActiveTab}
          importedField={importedField}
          onAnalysisUpdate={(a, p) => { setDashAnalysis(a); setDashPolygons(p) }}
        />
      )}

      {/* AI Chat widget */}
      <AiChat/>

      {/* Fayl yuklash wizard */}
      {showFieldWizard && (
        <FieldUploadWizard
          onClose={() => setActiveTab('xarita')}
          onConfirm={gj => {
            setImportedField(gj)
            setActiveTab('dala')
          }}
        />
      )}
      </div>
      )}
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
