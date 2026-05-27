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
import { t as ti18n } from './i18n'

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
function WeatherCard({ lang }) {
  const L = lang ?? 'uz'
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
            label: ti18n(L, 'wcTempDeg'),
            data: days.map(d => d.temp != null ? +d.temp.toFixed(1) : null),
            borderColor: '#EF9F27', pointBackgroundColor: '#EF9F27',
            borderWidth: 2, tension: 0.3, yAxisID: 'y', fill: false,
            pointRadius: 3, pointHoverRadius: 5,
          },
          {
            label: ti18n(L, 'wcRainMmLbl'),
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
    const dow = L === 'en'
      ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      : ['Yak','Dsh','Sesh','Chsh','Psh','Jm','Sh']
    const d = new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))
    return dow[d.getDay()]
  }

  function windDirLabel(deg) {
    if (deg == null || deg < 0) return '—'
    const dirs = L === 'en'
      ? ['N','NE','E','SE','S','SW','W','NW']
      : ['Shimol','Sh-Sharq','Sharq','J-Sharq','Janub',"J-G'arb","G'arb","Sh-G'arb"]
    return dirs[Math.round(deg / 45) % 8]
  }

  if (loading) {
    return (
      <div className="wc-card">
        <div className="wc-loading">
          <div className="map-loader-spinner" style={{ width:20, height:20, borderWidth:2 }}/>
          <span>{ti18n(L, 'wcLoading')}</span>
        </div>
      </div>
    )
  }

  const days       = weatherData?.daily ?? []
  const today      = days[days.length - 1]
  const totalRain7 = days.reduce((s, d) => s + (d.rain ?? 0), 0)
  const avgTemp    = days.length ? days.reduce((s,d) => s+(d.temp??0),0)/days.length : null
  const alertLevel = totalRain7 < 5 ? 'danger' : totalRain7 <= 15 ? 'warn' : 'good'
  const alertText  = alertLevel === 'danger'
    ? `${ti18n(L, 'wcAlertDanger')} — 7 ${ti18n(L, 'mc7days')} ${totalRain7.toFixed(1)} ${ti18n(L, 'wcRainMm')}`
    : alertLevel === 'warn' ? ti18n(L, 'wcAlertWarn') : ti18n(L, 'wcAlertGood')
  const alertIcon  = { danger: 'ti-alert-triangle', warn: 'ti-alert-circle', good: 'ti-circle-check' }[alertLevel]
  const rainValCls = totalRain7 < 5 ? 'wc-val--red' : totalRain7 <= 15 ? 'wc-val--yellow' : 'wc-val--blue'

  return (
    <div className="wc-card">

      {/* ── Header ── */}
      <div className="wc-header">
        <div className="wc-header-left">
          <div className="wc-icon"><i className="ti ti-cloud"/></div>
          <span className="wc-title">{ti18n(L, 'wcTitle')}</span>
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
          <div className="wc-metric-label">{ti18n(L, 'wcTodayTemp')}</div>
          <div className="wc-metric-val">
            {today?.temp != null ? `${today.temp.toFixed(1)}°C` : '—'}
          </div>
          <div className="wc-metric-sub">
            {ti18n(L, 'wcAvgLbl')}: {avgTemp != null ? `${avgTemp.toFixed(1)}°C` : '—'}
          </div>
        </div>
        <div className="wc-metric wc-metric--mid">
          <div className="wc-metric-label">{ti18n(L, 'wcRain7')}</div>
          <div className={`wc-metric-val ${rainValCls}`}>{totalRain7.toFixed(1)} mm</div>
          <div className="wc-metric-sub">{ti18n(L, 'wcNorm')}</div>
        </div>
        <div className="wc-metric">
          <div className="wc-metric-label">{ti18n(L, 'wcWindSpeed')}</div>
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
              <div className="wc-day-name">{isToday ? ti18n(L, 'wcToday') : fmtDayName(d.date)}</div>
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
          <span className="wc-chart-title">{ti18n(L, 'wcChartTitle')}</span>
          <div className="wc-chart-legend">
            <span className="wc-legend-dot" style={{ background:'#EF9F27' }}/>
            <span className="wc-legend-label">{ti18n(L, 'wcLegendTemp')}</span>
            <span className="wc-legend-dot" style={{ background:'#378ADD' }}/>
            <span className="wc-legend-label">{ti18n(L, 'wcLegendRain')}</span>
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
function UploadModal({ onClose, lang }) {
  const L = lang ?? 'uz'
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
          <span>{ti18n(L, 'lmTitle')}</span>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="lm-success">{ti18n(L, 'lmSuccess')}</div>
        ) : (
          <form className="lm-body" onSubmit={handleSubmit}>
            <p className="lm-desc">{ti18n(L, 'lmDesc')}</p>

            <label className="lm-label">{ti18n(L, 'lmFileLabel')}</label>
            <input
              type="file" accept=".pdf,.jpg,.jpeg,.png"
              className="lm-file"
              onChange={e => setFile(e.target.files[0])}
            />

            <div className="lm-divider"><span>{ti18n(L, 'lmOrManual')}</span></div>

            <div className="lm-grid">
              {[
                { key:'ph',      label: ti18n(L, 'lmPhLabel'), placeholder:'7.0' },
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

            <button type="submit" className="lm-submit">{ti18n(L, 'lmSubmit')}</button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MODAL: Laboratoriya buyurtma
// ─────────────────────────────────────────────
function OrderModal({ onClose, lang }) {
  const L = lang ?? 'uz'
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
          <span>{ti18n(L, 'omTitle')}</span>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="lm-success">{ti18n(L, 'omSuccess')}</div>
        ) : (
          <form className="lm-body" onSubmit={handleSubmit}>
            <p className="lm-desc">{ti18n(L, 'omDesc')}</p>

            <div className="lm-grid">
              <div className="lm-field lm-field--full">
                <label className="lm-field-label">{ti18n(L, 'omName')}</label>
                <input required className="lm-input" placeholder={L === 'en' ? 'Full name' : "To'liq ismingiz"} value={form.name} onChange={set('name')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">{ti18n(L, 'omPhone')}</label>
                <input required className="lm-input" placeholder="+998 90 000 00 00" value={form.phone} onChange={set('phone')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">{ti18n(L, 'omRegion')}</label>
                <input required className="lm-input" placeholder={L === 'en' ? 'District, village' : 'Tuman, qishloq'} value={form.region} onChange={set('region')}/>
              </div>
              <div className="lm-field">
                <label className="lm-field-label">{ti18n(L, 'omArea')}</label>
                <input type="number" min="0" step="0.1" className="lm-input" placeholder="10.0" value={form.area} onChange={set('area')}/>
              </div>
              <div className="lm-field lm-field--full">
                <label className="lm-field-label">{ti18n(L, 'omNote')}</label>
                <textarea className="lm-input lm-textarea" placeholder={L === 'en' ? 'Additional information...' : "Qo'shimcha ma'lumot..."} value={form.note} onChange={set('note')}/>
              </div>
            </div>

            <div className="lm-price">{ti18n(L, 'omPrice')}</div>

            <button type="submit" className="lm-submit">{ti18n(L, 'omSubmit')}</button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MONITORING CARDS — 3 expandable stat cards
// ─────────────────────────────────────────────
function MonitoringCards({ analysisData, polygonData, mounted, lang }) {
  const L = lang ?? 'uz'
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
  const sourceLabel = isGee ? 'Sentinel-2 · GEE' : analysisData?.source === 'local' ? ti18n(L, 'mcLocalData') : '—'

  /* ── Karta 2: Tuproq sho'rlanishi ── */
  const siVal    = analysisData?.si?.avg ?? null
  const hasSI    = siVal != null && !analysisData?.empty
  const siStatus = !hasSI ? null
    : isGee
      ? siVal < 0.05 ? 'good' : siVal <= 0.2 ? 'mid' : 'bad'
      : siVal <= 2   ? 'good' : siVal <= 3.5  ? 'mid' : 'bad'
  const siLabel = !hasSI ? '—'
    : siStatus === 'good' ? ti18n(L, 'mcSiGood')
    : siStatus === 'mid'  ? ti18n(L, 'mcSiAvg')
    : ti18n(L, 'mcSiHigh')
  const siBadge = !hasSI ? null
    : siStatus === 'good' ? { text: ti18n(L, 'mcSiGood'),       cls: 'good' }
    : siStatus === 'mid'  ? { text: ti18n(L, 'mcBadgeAttention'), cls: 'mid'  }
    : { text: ti18n(L, 'mcBadgeDanger'), cls: 'bad' }
  const siBars = hasSI ? (() => {
    const norm    = isGee ? Math.min(siVal / 0.3, 1) : Math.min((siVal - 1) / 4, 1)
    const badPct  = Math.round(Math.max(0, 70 * norm * norm))
    const goodPct = Math.round(Math.max(0, 90 - 85 * norm))
    const midPct  = Math.max(0, 100 - goodPct - badPct)
    return [
      { labelKey: 'mcNotSalted', pct: goodPct, color: '#1B7C45' },
      { labelKey: 'mcMidSalt',   pct: midPct,  color: '#B45309' },
      { labelKey: 'mcHighSalt',  pct: badPct,  color: '#DC2626' },
    ]
  })() : null
  const badSIPct = siBars?.[2]?.pct ?? 0

  /* ── Karta 3: Ob-havo ── */
  const isDrought    = wx != null && wx.totalRain7 < 5
  const isHeat       = wx != null && wx.lastTemp != null && wx.lastTemp > 30
  const wxValueLabel = !wx ? '…'
    : isDrought ? ti18n(L, 'mcDrought')
    : (wx.totalRain7 > 20) ? ti18n(L, 'mcRainy')
    : ti18n(L, 'mcNormal')
  const wxBadge = !wx ? null
    : (isDrought || isHeat) ? { text: ti18n(L, 'mcRiskBadge'), cls: 'bad' }
    : wx.totalRain7 > 20    ? { text: ti18n(L, 'mcSiGood'),    cls: 'good' }
    : { text: ti18n(L, 'mcNormal'), cls: 'mid' }
  const wxIcon = isDrought || isHeat ? 'ti-sun' : (wx?.totalRain7 ?? 0) > 5 ? 'ti-cloud-rain' : 'ti-sun'
  const wxIconCls = (isDrought || isHeat) ? 'mc-icon-box--red' : (wx?.totalRain7 ?? 0) > 5 ? 'mc-icon-box--blue' : 'mc-icon-box--yellow'
  const wxSubText = !wx ? ''
    : isDrought ? `${ti18n(L, 'mcNoRain7')} (${wx.totalRain7.toFixed(1)} mm)`
    : `${ti18n(L, 'mcRainAmt')}: ${wx.totalRain7.toFixed(1)} mm`

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
              <span className="mc-label">{ti18n(L, 'mcMonArea')}</span>
              {hasArea && <span className="mc-badge mc-badge--good">{ti18n(L, 'active')}</span>}
            </div>
            <div className={`mc-value ${hasArea ? 'mc-value--green' : 'mc-value--dim'}`}>
              {hasArea ? `${totalHa.toFixed(2)} ga` : ti18n(L, 'mcNotSelected')}
            </div>
            <div className="mc-sub">
              {hasArea ? `${totalM2.toLocaleString()} m²` : ti18n(L, 'mcDrawPolygon')}
            </div>
          </div>
          <button className="mc-toggle" onClick={toggle} aria-label="Details">
            <Chevron/>
          </button>
        </div>

        <div className="mc-detail" style={{ maxHeight: open ? '260px' : '0' }}>
          <div className="mc-divider"/>
          <div className="mc-detail-inner">
            {!hasArea ? (
              <p className="mc-empty">{ti18n(L, 'mcDrawHint')}</p>
            ) : (
              <div className="mc-rows">
                <div className="mc-row">
                  <span className="mc-row-key">{ti18n(L, 'mcFieldCount')}</span>
                  <span className="mc-row-val">{fieldCount} {L === 'uz' ? 'ta' : ''}</span>
                </div>
                <div className="mc-row">
                  <span className="mc-row-key">{ti18n(L, 'mcAnalysisDate')}</span>
                  <span className="mc-row-val">{tahlilDate}</span>
                </div>
                <div className="mc-row">
                  <span className="mc-row-key">{ti18n(L, 'mcDataSource')}</span>
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
              <span className="mc-label">{ti18n(L, 'mcSalinity')}</span>
              {siBadge && (
                <span className={`mc-badge mc-badge--${siBadge.cls}`}>{siBadge.text}</span>
              )}
            </div>
            <div className={`mc-value ${siStatus === 'good' ? 'mc-value--green' : siStatus === 'mid' ? 'mc-value--yellow' : siStatus === 'bad' ? 'mc-value--red' : 'mc-value--dim'}`}>
              {siLabel}
            </div>
            <div className="mc-sub">
              {hasSI ? `${ti18n(L, 'mcSiIndex')}: ${isGee ? siVal.toFixed(4) : siVal.toFixed(2)}` : ti18n(L, 'mcAnalysisPending')}
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
              <p className="mc-empty">{ti18n(L, 'mcRunGEE')}</p>
            ) : (
              <>
                {siBars.map(bar => (
                  <div key={bar.labelKey} className="mc-bar-item">
                    <span className="mc-bar-label">{ti18n(L, bar.labelKey)}</span>
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
                    {badSIPct}{ti18n(L, 'mcIrrigNeeded')}
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
              <span className="mc-label">{ti18n(L, 'mcWeather')}</span>
              {wxBadge && (
                <span className={`mc-badge mc-badge--${wxBadge.cls}`}>{wxBadge.text}</span>
              )}
            </div>
            <div className={`mc-value ${(isDrought || isHeat) ? 'mc-value--red' : wx ? 'mc-value--green' : 'mc-value--dim'}`}>
              {wxValueLabel}
            </div>
            <div className="mc-sub">{wxSubText || ti18n(L, 'mcWeatherLoad')}</div>
          </div>
          <button className="mc-toggle" onClick={toggle} aria-label="Batafsil">
            <Chevron/>
          </button>
        </div>

        <div className="mc-detail" style={{ maxHeight: open ? '260px' : '0' }}>
          <div className="mc-divider"/>
          <div className="mc-detail-inner">
            {!wx ? (
              <p className="mc-empty">{ti18n(L, 'mcWeatherLoad')}</p>
            ) : (
              <>
                <div className="mc-rows">
                  <div className="mc-row">
                    <span className="mc-row-key">{ti18n(L, 'mcTodayTemp')}</span>
                    <span className="mc-row-val">
                      {wx.lastTemp != null ? `${wx.lastTemp.toFixed(1)}°C` : '—'}
                    </span>
                  </div>
                  <div className="mc-row">
                    <span className="mc-row-key">{ti18n(L, 'mcRain7')}</span>
                    <span className="mc-row-val">{wx.totalRain7.toFixed(1)} mm</span>
                  </div>
                  {wx.nextDays.length > 0 && (
                    <div className="mc-row">
                      <span className="mc-row-key">{ti18n(L, 'mcLast3')}</span>
                      <span className="mc-row-val">
                        {wx.nextDays.map(d => `${fmtDate(d.date)} ${d.temp?.toFixed(0)}°`).join(' · ')}
                      </span>
                    </div>
                  )}
                  <div className="mc-row">
                    <span className="mc-row-key">{ti18n(L, 'mcSourceLabel')}</span>
                    <span className="mc-row-val">NASA POWER</span>
                  </div>
                </div>
                {(isHeat || isDrought) && (
                  <div className="mc-alert-row mc-alert-row--red">
                    <i className="ti ti-alert-triangle"/>
                    {ti18n(L, 'mcHeatWarn')}
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
    key: 'ndvi', label: 'NDVI', descKey: 'idxNdvi', geeOnly: false,
    status:    (v, gee) => gee ? (v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad')
                               : (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'bad'),
    statusKey: (v, gee) => gee ? (v >= 0.4 ? 'stGood' : v >= 0.2 ? 'stAvg' : 'stLow')
                               : (v >= 3.5 ? 'stGood' : v >= 2.5 ? 'stAvg' : 'stLow'),
  },
  {
    key: 'ndwi', label: 'NDWI', descKey: 'idxNdwi', geeOnly: false,
    status:    (v, gee) => gee ? (v >= 0 ? 'good' : v >= -0.2 ? 'mid' : 'bad')
                               : (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'bad'),
    statusKey: (v, gee) => gee ? (v >= 0 ? 'stMoist' : v >= -0.2 ? 'stAvg' : 'stDry')
                               : (v >= 3.5 ? 'stMoist' : v >= 2.5 ? 'stAvg' : 'stDry'),
  },
  {
    key: 'si', label: 'SI', descKey: 'idxSi', geeOnly: false,
    status:    (v, gee) => gee ? (v < 0.05 ? 'good' : v <= 0.2 ? 'mid' : 'bad')
                               : (v <= 2 ? 'good' : v <= 3 ? 'mid' : 'bad'),
    statusKey: (v, gee) => gee ? (v < 0.05 ? 'stSaltFree' : v <= 0.2 ? 'stAvg' : 'stSalted')
                               : (v <= 2 ? 'stSaltFree' : v <= 3 ? 'stAvg' : 'stSalted'),
  },
  {
    key: 'bsi', label: 'BSI', descKey: 'idxBsi', geeOnly: false,
    status:    (v, gee) => gee ? (v <= 0 ? 'good' : v <= 0.1 ? 'mid' : 'bad')
                               : (v <= 2 ? 'good' : v <= 3 ? 'mid' : 'bad'),
    statusKey: (v, gee) => gee ? (v <= 0 ? 'stCovered' : v <= 0.1 ? 'stAvg' : 'stBare')
                               : (v <= 2 ? 'stCovered' : v <= 3 ? 'stAvg' : 'stBare'),
  },
  {
    key: 'ndre', label: 'NDRE', descKey: 'idxNdre', geeOnly: true,
    status:    (v) => v >= 0.3 ? 'good' : v >= 0.15 ? 'mid' : 'bad',
    statusKey: (v) => v >= 0.3 ? 'stHealthy' : v >= 0.15 ? 'stAvg' : 'stWeak',
  },
  {
    key: 'msavi', label: 'MSAVI', descKey: 'idxMsavi', geeOnly: true,
    status:    (v) => v >= 0.3 ? 'good' : v >= 0.15 ? 'mid' : 'bad',
    statusKey: (v) => v >= 0.3 ? 'stGood' : v >= 0.15 ? 'stAvg' : 'stLow',
  },
  {
    key: 'smi', label: 'SMI', descKey: 'idxSmi', geeOnly: true,
    status:    (v) => v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad',
    statusKey: (v) => v >= 0.4 ? 'stMoist' : v >= 0.2 ? 'stAvg' : 'stDry',
  },
]

function SoilIndicesTable({ analysisData, lang }) {
  const L = lang ?? 'uz'
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
            <div className="sit-title">{ti18n(L, 'idxTitle')}</div>
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
                <th>{ti18n(L, 'idxColIndex')}</th>
                <th>{ti18n(L, 'idxColWhat')}</th>
                <th>{ti18n(L, 'idxColValue')}</th>
                <th>{ti18n(L, 'idxColStatus')}</th>
                <th>{ti18n(L, 'idxColTrend')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => {
                const entry  = analysisData && !analysisData.empty ? analysisData[m.key] : null
                const val    = entry?.avg ?? null
                const st     = val != null ? m.status(val, isGee) : null
                const stKey  = val != null ? m.statusKey(val, isGee) : null
                return (
                  <tr key={m.key}>
                    <td className="sit-td-key">
                      <span className="sit-idx-label">{m.label}</span>
                      {m.geeOnly && <span className="sit-gee-mini">GEE</span>}
                    </td>
                    <td className="sit-td-desc">{ti18n(L, m.descKey)}</td>
                    <td className="sit-td-val">{val != null ? val.toFixed(4) : '—'}</td>
                    <td className="sit-td-status">
                      {st
                        ? <span className={`sit-badge sit-badge--${st}`}>{stKey ? ti18n(L, stKey) : ''}</span>
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
  { key: 'ph',  name: 'pH',  descKey: 'lbPhDesc',  norm: '6.5 – 7.5',  unit: ''     },
  { key: 'ec',  name: 'EC',  descKey: 'lbEcDesc',  norm: '< 2.0 dS/m', unit: 'dS/m' },
  { key: 'sar', name: 'SAR', descKey: 'lbSarDesc', norm: '< 9.0',       unit: ''     },
]

const NUTR_ROWS = [
  { key: 'nitrogen',   name: 'Azot (N)',   descKey: 'lbNitrDesc',  norm: '40–60 mg/kg',   unit: 'mg/kg' },
  { key: 'phosphorus', name: 'Fosfor (P)', descKey: 'lbPhosDesc',  norm: '20–40 mg/kg',   unit: 'mg/kg' },
  { key: 'potassium',  name: 'Kaliy (K)',  descKey: 'lbKalDesc',   norm: '200–400 mg/kg', unit: 'mg/kg' },
  { key: 'humus',      name: 'Gumus',      descKey: 'lbHumusDesc', norm: '> 2.0 %',       unit: '%'     },
]

function labStatus(key, val) {
  if (val == null) return null
  switch (key) {
    case 'ph':
      if (val >= 6.5 && val <= 7.5) return { labelKey: 'lbStNormal', cls: 'good' }
      if (val < 6.0  || val > 8.0)  return { labelKey: 'lbStDanger', cls: 'bad'  }
      return                               { labelKey: 'lbStAvg',    cls: 'mid'  }
    case 'ec':
      if (val < 2.0)  return { labelKey: 'lbStNormal', cls: 'good' }
      if (val <= 4.0) return { labelKey: 'lbStHigh',   cls: 'mid'  }
      return                 { labelKey: 'lbStDanger',  cls: 'bad'  }
    case 'sar':
      if (val < 9.0)   return { labelKey: 'lbStNormal', cls: 'good' }
      if (val <= 18.0) return { labelKey: 'lbStHigh',   cls: 'mid'  }
      return                  { labelKey: 'lbStDanger',  cls: 'bad'  }
    case 'nitrogen':
      if (val > 40)  return { labelKey: 'lbStNormal',  cls: 'good' }
      if (val >= 20) return { labelKey: 'lbStLow',     cls: 'mid'  }
      return               { labelKey: 'lbStVeryLow',  cls: 'bad'  }
    case 'phosphorus':
      if (val > 20)  return { labelKey: 'lbStNormal',  cls: 'good' }
      if (val >= 10) return { labelKey: 'lbStLow',     cls: 'mid'  }
      return               { labelKey: 'lbStVeryLow',  cls: 'bad'  }
    case 'potassium':
      if (val > 200)  return { labelKey: 'lbStNormal', cls: 'good' }
      if (val >= 100) return { labelKey: 'lbStAvg',    cls: 'mid'  }
      return                { labelKey: 'lbStLow',      cls: 'bad'  }
    case 'humus':
      if (val > 2.0)  return { labelKey: 'lbStNormal', cls: 'good' }
      if (val >= 1.0) return { labelKey: 'lbStLow',    cls: 'mid'  }
      return                { labelKey: 'lbStVeryLow',  cls: 'bad'  }
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

function LabCard({ onGoToLab, lang }) {
  const L = lang ?? 'uz'
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
            <span className="lb-title">{ti18n(L, 'lbTitle')}</span>
          </div>
        </div>
        <div className="lb-empty">
          <i className="ti ti-flask-off lb-empty-icon"/>
          <p className="lb-empty-text">{ti18n(L, 'lbNoResult')}</p>
          <button className="lb-empty-btn" onClick={onGoToLab}>
            <i className="ti ti-upload"/> {ti18n(L, 'lbUploadResult')}
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
          <span className="lb-title">{ti18n(L, 'lbTitle')}</span>
        </div>
        <span className="lb-date">{ti18n(L, 'lbDate')}: {labData.date}</span>
      </div>

      {/* ── Boshqaruv ── */}
      <div className="lb-controls">
        <div className="lb-toggle-group">
          <button
            className={`lb-toggle${panel === 'soil' ? ' lb-toggle--active' : ''}`}
            onClick={() => setPanel('soil')}
          >{ti18n(L, 'lbSoilEnv')}</button>
          <button
            className={`lb-toggle${panel === 'nutrients' ? ' lb-toggle--active' : ''}`}
            onClick={() => setPanel('nutrients')}
          >{ti18n(L, 'lbNutrients')}</button>
        </div>
        <button className="lb-pdf-btn" onClick={() => alert('PDF hisobot tayyorlanmoqda...')}>
          <i className="ti ti-file-download"/> PDF
        </button>
      </div>

      {/* ── Ogohlantirish ── */}
      <div className={`lb-alert lb-alert--${alertLevel}`}>
        <i className={`ti ${alertLevel === 'danger' ? 'ti-alert-triangle' : 'ti-circle-check'}`}/>
        {alertLevel === 'danger'
          ? `${dangerRows.length} ${ti18n(L, 'lbDangerCount')} — ${dangerRows.map(r => r.name).join(', ')} ${ti18n(L, 'lbAboveNorm')}.`
          : ti18n(L, 'lbAllGood')
        }
      </div>

      {/* ── Jadval ── */}
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th>{ti18n(L, 'lbColIndicator')}</th>
              <th>{ti18n(L, 'lbColNorm')}</th>
              <th>{ti18n(L, 'lbColLevel')}</th>
              <th>{ti18n(L, 'lbColStatus')}</th>
              <th>{ti18n(L, 'lbColValue')}</th>
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
                    <div className="lb-row-desc">{ti18n(L, row.descKey)}</div>
                  </td>
                  <td className="lb-td-norm">{row.norm}</td>
                  <td className="lb-td-bar">
                    <div className="lb-bar-track">
                      <div className="lb-bar-fill" style={{ width: `${pct}%`, background: barClr }}/>
                    </div>
                  </td>
                  <td className="lb-td-status">
                    {st
                      ? <span className={`lb-badge lb-badge--${st.cls}`}>{ti18n(L, st.labelKey)}</span>
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
function TahlillarDashboard({ onClose, analysisData, polygonData, lang }) {
  const L = lang ?? 'uz'
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setMounted(true), 80); return () => clearTimeout(timer) }, [])

  return (
    <div className="db-overlay">

      {/* ── Header ── */}
      <div className="db-header">
        <button className="db-back" onClick={onClose}>{ti18n(L, 'dbBack')}</button>
        <div className="db-logo">
          <span className="db-logo-dot"/>
          <span className="db-logo-text">SoilAgroWatch</span>
        </div>
        <div className="db-meta">{ti18n(L, 'dbMeta')}</div>
      </div>

      <div className="db-scroll">

        {/* ── 1. YUQORI: 3 monitoring karta ── */}
        <MonitoringCards
          analysisData={analysisData}
          polygonData={polygonData}
          mounted={mounted}
          lang={L}
        />

        {/* ── 1b. TUPROQ INDEKSLARI JADVALI ── */}
        <SoilIndicesTable analysisData={analysisData} lang={L} />

        {/* ── 2. OB-HAVO ── */}
        <WeatherCard lang={L} />

        {/* ── 3. LABORATORIYA ── */}
        <LabCard lang={L} />

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
  const [lang,            setLang]            = useState('uz')

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
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} lang={lang} setLang={setLang} />

      {activeTab === 'xarita' ? (
        <MapPage onTabChange={handleTabChange} lang={lang} />
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
          lang={lang}
        />
      )}

      {/* Dala chizish overlay */}
      {showDraw && (
        <DrawMap
          activeTab={activeTab}
          onTabChange={setActiveTab}
          importedField={importedField}
          onAnalysisUpdate={(a, p) => { setDashAnalysis(a); setDashPolygons(p) }}
          lang={lang}
        />
      )}

      {/* AI Chat widget */}
      <AiChat lang={lang} setLang={setLang}/>

      {/* Fayl yuklash wizard */}
      {showFieldWizard && (
        <FieldUploadWizard
          onClose={() => setActiveTab('xarita')}
          onConfirm={gj => {
            setImportedField(gj)
            setActiveTab('dala')
          }}
          lang={lang}
        />
      )}
      </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// AI CHAT — DEMO REJIM (API kerak emas)
// ─────────────────────────────────────────────

const DEMO_DB = [
  {
    keys: ['salom', 'assalom', 'hello', 'hi ', 'yordam', 'help', 'nima qila', 'what can', 'haqida', 'about'],
    uz: `👋 Salom! Men **SoilAgroWatch AI** yordamchisiman.

Quyidagi mavzularda yordam bera olaman:

🌿 NDVI — o'simlik qoplami tahlili
💧 NDWI / SMI — namlik va sug'orish
🧂 SI / EC / SAR — sho'rlanish darajasi
🏜️ BSI — yalangoch tuproq va eroziya
🛰️ Sentinel-2 / GEE — sun'iy yo'ldosh
🌾 Ekin tavsiylari — paxta, bug'doy...
☁️ Ob-havo — NASA POWER ma'lumotlari
⚗️ pH / O'g'it — laboratoriya natijalari
🚰 Drenaj / Melioratsiya — tuproq tiklash

Savolingizni yozing — javob beraman! 🌱`,
    en: `👋 Hello! I'm **SoilAgroWatch AI** assistant.

I can help with:

🌿 NDVI — vegetation cover analysis
💧 NDWI / SMI — moisture & irrigation
🧂 SI / EC / SAR — soil salinity
🏜️ BSI — bare soil & erosion risk
🛰️ Sentinel-2 / GEE — satellite analysis
🌾 Crop advice — cotton, wheat & more
☁️ Weather — NASA POWER real-time data
⚗️ pH / Fertilizer — lab results
🚰 Drainage / Reclamation — soil restoration

Type your question — I'm ready! 🌱`,
  },
  {
    keys: ['ndvi', "o'simlik", 'vegetatsiya', 'yashil', 'vegetation', 'plant', 'biomass', 'green'],
    uz: `📡 **NDVI — Vegetatsiya indeksi**

NDVI sun'iy yo'ldosh orqali o'simlik qoplamini o'lchaydi.

**Qiymatlar:**
• 0.6–0.9 → Zich, sog'lom o'simlik 🟢
• 0.3–0.5 → O'rtacha o'simlik 🟡
• 0.1–0.2 → Siyrak o'simlik 🟠
• < 0.1 → Yalangoch yer yoki quruq 🔴

**Tavsiya:**
NDVI < 0.3 bo'lsa — sug'orishni oshiring, azot o'g'it qo'llang va ekin navini tekshiring.

Xaritada polygon chizib, real NDVI qiymatini olishingiz mumkin! 🛰️`,
    en: `📡 **NDVI — Vegetation Index**

NDVI measures vegetation density from Sentinel-2 imagery.

**Value Range:**
• 0.6–0.9 → Dense, healthy vegetation 🟢
• 0.3–0.5 → Moderate vegetation 🟡
• 0.1–0.2 → Sparse vegetation 🟠
• < 0.1 → Bare soil or dry area 🔴

**Recommendations:**
NDVI < 0.3 → increase irrigation, apply nitrogen fertilizer, consider drought-tolerant varieties.

Draw a polygon on the map to get real NDVI values from Sentinel-2! 🛰️`,
  },
  {
    keys: ["sho'r", 'shorl', 'ec ', 'sar ', 'tuz', 'salin', 'salt'],
    uz: `🧂 **Tuproq sho'rlanishi**

**Ko'rsatkichlar:**
• EC < 2 dS/m → Normal, ko'p ekinlar uchun mos 🟢
• EC 2–4 dS/m → O'rtacha, chidamli navlar kerak 🟡
• EC > 4 dS/m → Yuqori, drenaj va yuvish kerak 🔴

• SAR < 9 → Normal sodiy miqdori 🟢
• SAR 9–18 → Diqqat: tuproq tuzilishi yomonlashadi 🟡
• SAR > 18 → Gips (CaSO₄) qo'llash zarur 🔴

**Yechim:** Yuvish sug'orish, drenaj tozalash, gips + organik o'g'it.

SI indeksi xaritada sho'rlanishni kosmosdan ko'rsatadi!`,
    en: `🧂 **Soil Salinity**

**Key Indicators:**
• EC < 2 dS/m → Normal, suitable for most crops 🟢
• EC 2–4 dS/m → Moderate, salt-tolerant crops only 🟡
• EC > 4 dS/m → High salinity, drainage needed 🔴

• SAR < 9 → Normal sodium level 🟢
• SAR 9–18 → Risk of soil structure damage 🟡
• SAR > 18 → Gypsum (CaSO₄) application required 🔴

**Solution:** Leaching irrigation, drainage maintenance, gypsum + organic compost.

Check the SI layer on the map for satellite-based salinity mapping!`,
  },
  {
    keys: ['paxta', 'cotton', 'gossypium'],
    uz: `🌿 **Paxta ekish bo'yicha tavsiyalar**

**Tuproq talablari:**
• pH: 6.5–8.0 (ideal: 7.0–7.5)
• EC: < 4 dS/m
• Chuqurlik: 60–80 sm, yaxshi drenajlangan

**Ekish muddati (Qoraqalpog'iston):**
• Tuproq harorati ≥ 14°C — aprel oxiri, may boshi
• Ekish chuqurligi: 3–4 sm
• Norma: 80–100 kg/ga urug'

**O'g'it:**
• Azot (N): 200–250 kg/ga
• Fosfor (P): 100–120 kg/ga
• Kaliy (K): 80–100 kg/ga

⚠️ EC > 6 dS/m bo'lsa, hosildorlik 40–60% kamayadi!`,
    en: `🌿 **Cotton Growing Guide**

**Soil Requirements:**
• pH: 6.5–8.0 (optimal: 7.0–7.5)
• EC: < 4 dS/m
• Depth: 60–80 cm, well-drained

**Planting (Karakalpakstan):**
• Soil temp ≥ 14°C — late April / early May
• Seeding depth: 3–4 cm
• Seeding rate: 80–100 kg/ha

**Fertilizer:**
• N: 200–250 kg/ha
• P: 100–120 kg/ha
• K: 80–100 kg/ha

⚠️ Warning: EC > 6 dS/m → cotton yield drops 40–60%!`,
  },
  {
    keys: ["bug'doy", 'wheat', 'don ', "g'alla", 'grain', 'cereal'],
    uz: `🌾 **Bug'doy yetishtirish bo'yicha tavsiyalar**

**Qulay sharoit:**
• pH: 6.0–7.5
• EC: < 6 dS/m (sho'rga o'rta chidamli)
• Harorat: ekishda 8–15°C, pishishda 20–25°C

**Ekish muddati:**
• Kuzgi: sentyabr oxiri — oktyabr o'rtasi
• Bahorgi: mart boshi
• Norma: 180–220 kg/ga

**Sug'orish:** Jami 4–6 marta (o'stirish, bo'g'im, boshlab ketish, donlash)

**NDVI tavsiya:** Donlash davrida NDVI 0.5–0.7 bo'lishi kerak. Past bo'lsa — oziqlanish muammosi.`,
    en: `🌾 **Wheat Growing Guide**

**Optimal Conditions:**
• pH: 6.0–7.5
• EC: < 6 dS/m (moderate salt tolerance)
• Temperature: 8–15°C at planting, 20–25°C at harvest

**Planting Dates:**
• Winter: late September – mid October
• Spring: early March
• Seeding rate: 180–220 kg/ha

**Irrigation:** 4–6 cycles total through the season

**NDVI Target:** 0.5–0.7 during grain-fill. Lower values indicate nutrition stress.`,
  },
  {
    keys: ['ob-havo', 'harorat', "yog'in", "qurg'oq", "yomg'ir", 'weather', 'temperature', 'rain', 'drought', 'climate', 'nasa'],
    uz: `☁️ **Ob-havo va agro-monitoring**

**NASA POWER ma'lumotlari (oxirgi 7 kun):**
• Harorat: 22–28°C (mavsumga mos)
• Yog'in: 0–5 mm (qurg'oqchilik ehtimoli bor)

**Agro-tavsiyalar:**
• Harorat > 35°C → Bug'lanish ortadi, sug'orishni 2× oshiring
• Yog'in < 10 mm/oy → Tomchilatib sug'orish joriy eting
• Shamol > 5 m/s → Mineral o'g'it purkashni to'xtating

Dashboard "Tahlillar" bo'limida ob-havo grafigi va 7 kunlik ko'rsatkichlarni ko'rishingiz mumkin.`,
    en: `☁️ **Weather & Agro-Monitoring**

**NASA POWER Data (last 7 days):**
• Temperature: 22–28°C (seasonal average)
• Precipitation: 0–5 mm (drought risk present)

**Agro-Recommendations:**
• Temp > 35°C → Evaporation doubles, increase irrigation
• Rain < 10 mm/month → Install drip irrigation
• Wind > 5 m/s → Stop mineral fertilizer spraying

Check the "Analysis" dashboard for weather charts and 7-day summaries.`,
  },
  {
    keys: ['ndwi', 'namlik', 'moisture', "sug'or", 'irrigation', 'suv '],
    uz: `💧 **NDWI — Namlik indeksi**

NDWI tuproq va o'simlikdagi namlikni o'lchaydi.

**Qiymatlar:**
• > 0.3 → Yuqori namlik, suv bosishi xavfi 🔵
• 0–0.3 → Yetarli namlik 🟢
• −0.2–0 → O'rtacha quruq, sug'orish tavsiya 🟡
• < −0.2 → Quruq, zudlik bilan sug'orish kerak 🔴

**Sug'orish normasi (Orolbo'yi):**
• Paxta: 6000–8000 m³/ga/yil
• Bug'doy: 3000–4000 m³/ga
• Tomchilatib: 30–40% suv tejash mumkin

Xaritada NDWI qatlamini tanlab, dalangizni tekshiring.`,
    en: `💧 **NDWI — Water / Moisture Index**

NDWI measures water content in soil and vegetation.

**Value Range:**
• > 0.3 → High moisture, flood risk 🔵
• 0–0.3 → Adequate moisture 🟢
• -0.2–0 → Moderately dry, irrigation advised 🟡
• < -0.2 → Dry, urgent irrigation needed 🔴

**Irrigation Norms (Aral Sea Region):**
• Cotton: 6000–8000 m³/ha/year
• Wheat: 3000–4000 m³/ha
• Drip system: saves 30–40% water

Select the NDWI layer on the map to check your field.`,
  },
  {
    keys: ['bsi', 'yalangoch', 'bare soil', 'eroziya', 'erosion', 'degradatsiya', 'degradation'],
    uz: `🏜️ **BSI — Yalangoch tuproq indeksi**

BSI tuproq yuzasidagi yalangoch qismni o'lchaydi.

**Qiymatlar:**
• < −0.1 → Yaxshi qoplangan 🟢
• −0.1–0.1 → Aralash holat 🟡
• > 0.1 → Ko'p qismi yalangoch 🔴
• > 0.3 → Kuchli degradatsiya 🆘

**Eroziyaga qarshi choralar:**
1. Oraliq ekinlar ekish
2. Mulchalash (5–10 sm)
3. Shamoldan himoya daraxtzori
4. Minimum haydash (no-till)
5. Organik modda qo'shish

BSI qatlamini xaritada tanlab, dalangiz holatini kuzating.`,
    en: `🏜️ **BSI — Bare Soil Index**

BSI measures proportion of exposed, unprotected soil.

**Value Range:**
• < -0.1 → Good vegetation cover 🟢
• -0.1–0.1 → Mixed conditions 🟡
• > 0.1 → Mostly bare soil 🔴
• > 0.3 → Severe degradation 🆘

**Anti-Erosion Measures:**
1. Plant cover crops
2. Mulching (5–10 cm)
3. Windbreaks
4. No-till farming
5. Add organic compost

Select the BSI layer on the map to monitor your field.`,
  },
  {
    keys: ['ph', 'kislot', 'ishqor', 'ohak', 'acid', 'alkaline', 'lime'],
    uz: `⚗️ **Tuproq pH darajasi**

**Ko'rsatkichlar:**
• pH 6.5–7.5 → Aksariyat ekinlar uchun ideal 🟢
• pH 5.5–6.4 → Kislotali, ohak qo'llash tavsiya 🟡
• pH 7.6–8.5 → Ishqorli, gips va organik modda 🟡
• pH > 8.5 → Kuchli ishqorli, melioratsiya kerak 🔴

**Mintaqamiz muammosi:** Orolbo'yida pH 7.8–8.5 keng tarqalgan (ishqorli). Sababi — yuqori karbonat va sho'r suv.

**Yechim:**
• Gips (CaSO₄): 3–5 t/ga
• Organik kompost: 10–15 t/ga
• Kislotali o'g'itlar: ammoniy sulfat`,
    en: `⚗️ **Soil pH Level**

**Scale:**
• pH 6.5–7.5 → Ideal for most crops 🟢
• pH 5.5–6.4 → Acidic, apply lime 🟡
• pH 7.6–8.5 → Alkaline, add gypsum & organic 🟡
• pH > 8.5 → Strongly alkaline, reclamation needed 🔴

**Regional Issue:** In the Aral Sea region, pH 7.8–8.5 is common due to high carbonate content and saline water.

**Solutions:**
• Gypsum (CaSO₄): 3–5 t/ha
• Organic compost: 10–15 t/ha
• Acidic fertilizers: ammonium sulfate`,
  },
  {
    keys: ["o'g'it", 'azot', 'fosfor', 'kaliy', 'gumus', 'fertilizer', 'npk', 'nitrogen', 'phosphorus', 'potassium'],
    uz: `🌱 **O'g'itlash bo'yicha tavsiyalar**

**Asosiy elementlar (N-P-K):**
• Azot (N) — 150–250 kg/ga: ko'karishni tezlashtiradi
• Fosfor (P) — 80–120 kg/ga: ildiz va gul rivojida
• Kaliy (K) — 80–100 kg/ga: hosil sifati

**Gumus miqdori:**
• < 1% → Juda past — kompost 15+ t/ga 🔴
• 1–2% → Past — yillik 10 t/ga 🟡
• 2–3% → Normal 🟢
• > 3% → Yaxshi 🟢

**Maslahat:** O'g'it berishdan oldin laboratoriya tahlilini o'tkazing — xarajatni 20–30% kamaytiradi.`,
    en: `🌱 **Fertilization Guide**

**Main Nutrients (N-P-K):**
• Nitrogen (N) — 150–250 kg/ha: drives vegetative growth
• Phosphorus (P) — 80–120 kg/ha: roots and flowering
• Potassium (K) — 80–100 kg/ha: yield quality

**Humus (Organic Matter):**
• < 1% → Very low — add 15+ t/ha compost 🔴
• 1–2% → Low — annual 10 t/ha 🟡
• 2–3% → Normal 🟢
• > 3% → Good 🟢

**Tip:** Always run a lab test before fertilizing — saves 20–30% on costs.`,
  },
  {
    keys: ['drenaj', 'drainage', 'waterlog', 'kanal', 'ortiq suv', 'botqoq'],
    uz: `🚰 **Drenaj tizimi bo'yicha maslahat**

**Drenaj zarurmi?**
• EC > 4 dS/m → Ha, darhol
• Tuproq 30–50 sm da suv to'planadi → Ha
• Ekin o'smayapti lekin sug'orish normada → Tekshiring

**Ochiq drenaj:**
• Kanal chuqurligi: 1.2–1.5 m
• Eni: 0.8–1.0 m
• Eğim: 0.001–0.003

**Yopiq drenaj (plastic pipe):**
• Chuqurlik: 1.0–1.5 m
• Oraliq: 10–20 m
• 30–40% suv tejash

**Xarajat:** Ochiq — 500–800 ming so'm/100 m; Yopiq — 2–3 mln so'm/100 m`,
    en: `🚰 **Drainage System Guide**

**Is Drainage Needed?**
• EC > 4 dS/m → Yes, immediately
• Water pools at 30–50 cm depth → Yes
• Crops failing despite normal irrigation → Check

**Open Drainage:**
• Depth: 1.2–1.5 m
• Width: 0.8–1.0 m
• Slope: 0.001–0.003

**Subsurface (Pipe) Drainage:**
• Depth: 1.0–1.5 m
• Spacing: 10–20 m
• 30–40% water savings

**Cost:** Open — 500–800K sum/100m; Subsurface — 2–3M sum/100m`,
  },
  {
    keys: ['sentinel', 'gee', 'earth engine', "sun'iy yo'ldosh", 'satellite', 'kosmik'],
    uz: `🛰️ **Sentinel-2 va Google Earth Engine**

Sentinel-2 — Yevropa kosmik agentligining (ESA) bepul dasturi.

**Xususiyatlari:**
• Qayta tashrif: har 5 kun
• Piksel: 10 m
• 13 ta spektral kanal
• Ma'lumotlar: 2015-yildan bepul

**Bizning tizim:**
1. Xaritada polygon chizasiz
2. GEE backend Sentinel-2 rasmini oladi
3. NDVI, NDWI, SI, BSI, NDRE, MSAVI, SMI hisoblanadi
4. Natijalar panel va xaritada ko'rsatiladi

"Dala chizish" rejimida sinab ko'ring!`,
    en: `🛰️ **Sentinel-2 & Google Earth Engine**

Sentinel-2 is a free satellite program by the European Space Agency (ESA).

**Key Features:**
• Revisit time: every 5 days
• Resolution: 10 m/pixel
• 13 spectral bands
• Free data since 2015

**Our System Flow:**
1. Draw a polygon on the map
2. GEE backend fetches Sentinel-2 images
3. Calculates NDVI, NDWI, SI, BSI, NDRE, MSAVI, SMI
4. Results shown in panel and on the map

Try it in "Field Drawing" mode!`,
  },
  {
    keys: ['meliorat', 'qayta tikl', 'yuvish', 'reclaim', 'rehabilitat'],
    uz: `🔄 **Tuproqni qayta tiklash (Melioratsiya)**

**Yuvish sug'orish:**
• Maqsad: tuz miqdorini kamaytirish
• Norma: 1500–3000 m³/ga
• Muddat: ekin ekishdan 1–2 oy oldin
• Samara: EC 30–50% kamayadi

**Bosqichlar:**
1. Tekislash ishlari (laser nivelir)
2. Yuvish sug'orish (2–3 marta)
3. Gips qo'llash (4–6 t/ga)
4. Organik modda (10–15 t/ga kompost)
5. Shudgor + aralash ekinlar

**Natija:** 2–3 mavsumda sezilarli yaxshilanish. NDVI monitoring bilan kuzatib boring.`,
    en: `🔄 **Soil Reclamation (Melioration)**

**Leaching Irrigation:**
• Goal: reduce salt content
• Rate: 1500–3000 m³/ha
• Timing: 1–2 months before planting
• Effect: EC drops 30–50%

**Step-by-Step:**
1. Land leveling (laser leveler)
2. Leaching irrigation (2–3 rounds)
3. Gypsum application (4–6 t/ha)
4. Organic matter (10–15 t/ha compost)
5. Deep tillage + mixed cropping

**Timeline:** Significant improvement in 2–3 seasons. Monitor with NDVI.`,
  },
  {
    keys: ['orolbo', 'qoraqalpog', 'nukus', 'aral', 'mintaqa', 'region'],
    uz: `🌍 **Orolbo'yi mintaqasi — tuproq muammolari**

**Asosiy muammolar:**
1. Sho'rlanish — EC 8–15 dS/m (juda yuqori)
2. Deflatsiya — tuz-chang bo'ronlari
3. Suv tanqisligi — Amudaryo suvi kamaydi
4. Organik modda — < 0.8% (juda past)
5. NDVI: 2015–2024 yillarda 12–18% kamaygan

**Ijobiy tomonlar:**
• UN va xalqaro loyihalar yordam bermoqda
• Sho'rga chidamli yangi navlar kiritilmoqda
• Tomchi sug'orish jadal joriy etilmoqda

Bizning tizim aynan shu mintaqa uchun optimallashtirilgan! 🌱`,
    en: `🌍 **Aral Sea Region — Soil Challenges**

**Main Problems:**
1. Salinity — EC 8–15 dS/m (very high)
2. Deflation — salt-dust storms
3. Water scarcity — Amudarya flow decreased 80%
4. Organic matter — < 0.8% (critically low)
5. NDVI dropped 12–18% from 2015–2024

**Positive Developments:**
• UN & international projects providing support
• New salt-tolerant crop varieties introduced
• Drip irrigation rapidly expanding

Our system is specifically optimized for this region! 🌱`,
  },
  {
    keys: ['laboratoriya', 'lab tahlil', 'namuna', 'laboratory', 'soil test', 'sample', 'analiz'],
    uz: `🔬 **Laboratoriya tahlili bo'yicha maslahat**

**Tuproq namunasi olish:**
• Chuqurlik: 0–30 sm va 30–60 sm (alohida)
• Maydon: har 5 gektarga 1 ta aralash namuna
• Vaqt: ekishdan 1 oy oldin yoki hosildan keyin

**Asosiy ko'rsatkichlar:**
• pH → Me'yor: 6.5–7.5
• EC → Me'yor: < 2 dS/m
• SAR → Me'yor: < 9
• Gumus → Me'yor: > 2%

**Bizning xizmat:** "Laboratoriya" bo'limida natijangizni ko'rishingiz mumkin.

**Narx:** ~250,000 so'm/namuna (hamkor laboratoriyalar)`,
    en: `🔬 **Laboratory Soil Testing**

**Sampling Protocol:**
• Depth: 0–30 cm and 30–60 cm (separate)
• Rate: 1 composite sample per 5 hectares
• Timing: 1 month before planting or post-harvest

**Key Parameters:**
• pH → Normal: 6.5–7.5
• EC → Normal: < 2 dS/m
• SAR → Normal: < 9
• Humus → Normal: > 2%

**Our Service:** View results in the "Lab Analysis" section. Partner labs provide full testing.

**Cost:** ~250,000 UZS/sample`,
  },
  {
    keys: ['ndre', 'xlorofil', 'chlorophyll', "o'simlik sog'", 'red edge', 'plant health'],
    uz: `🩺 **NDRE — O'simlik sog'lig'i indeksi**

NDRE xlorofil miqdorini o'lchaydi (NDVI dan aniqroq).

**Qiymatlar:**
• > 0.4 → Sog'lom, xlorofil normal 🟢
• 0.2–0.4 → O'rtacha, oziqlanish muammosi mumkin 🟡
• 0.1–0.2 → Zaif — azot yoki temir yetishmovchiligi 🟠
• < 0.1 → Kasallik yoki kuchli stress 🔴

**NDVI bilan farqi:**
• NDVI — umumiy biomassa
• NDRE — xlorofil kontsentratsiyasi (kasallikni ertaroq aniqlaydi)

**Tavsiya:** NDRE past bo'lsa — azot o'g'it va temir xelat (Fe-EDTA) qo'llang.`,
    en: `🩺 **NDRE — Plant Health Index**

NDRE measures chlorophyll content (more sensitive than NDVI).

**Value Range:**
• > 0.4 → Healthy, normal chlorophyll 🟢
• 0.2–0.4 → Moderate, possible nutrition issues 🟡
• 0.1–0.2 → Low — N or Fe deficiency 🟠
• < 0.1 → Disease or severe stress 🔴

**vs NDVI:**
• NDVI — overall biomass
• NDRE — chlorophyll concentration (detects stress earlier)

**Action:** Low NDRE → apply nitrogen fertilizer, iron chelate (Fe-EDTA), inspect for disease.`,
  },
  {
    keys: ['msavi', "tuproq ta'sir", 'soil adjusted', 'adjusted vegetation'],
    uz: `🏔️ **MSAVI — Tuproq kompensatsiyalangan indeks**

MSAVI siyrak o'simlik hududlarda NDVI xatosini kamaytiradi.

**Qachon MSAVI ishlatiladi:**
• Bahor boshida (o'simlik 30% dan kam)
• Qurg'oqlik davrida
• Degradatsiya tendentsiyasini o'lchashda

**Qiymatlar:**
• > 0.4 → Yaxshi qoplam 🟢
• 0.2–0.4 → O'rtacha 🟡
• 0.1–0.2 → Siyrak 🟠
• < 0.1 → Deyarli yalangoch 🔴

NDVI + MSAVI birga tahlil qilib, degradatsiya tendentsiyasini aniqroq ko'ring.`,
    en: `🏔️ **MSAVI — Modified Soil-Adjusted Vegetation Index**

MSAVI corrects NDVI errors in sparsely vegetated areas.

**When to Use:**
• Early spring (< 30% plant cover)
• During drought periods
• For precise degradation monitoring

**Value Range:**
• > 0.4 → Good vegetation cover 🟢
• 0.2–0.4 → Moderate 🟡
• 0.1–0.2 → Sparse 🟠
• < 0.1 → Nearly bare 🔴

Analyze NDVI + MSAVI together for clearer degradation trend detection.`,
  },
  {
    keys: ['smi', 'tuproq namligi', 'soil moisture'],
    uz: `💦 **SMI — Tuproq namligi indeksi**

SMI B8A/B11 nisbati asosida tuproq namligini o'lchaydi.

**Qiymatlar:**
• > 0.6 → Nam, sug'orish kerak emas 🔵
• 0.4–0.6 → Normal namlik 🟢
• 0.2–0.4 → Quruqroq, kuzatish zarur 🟡
• < 0.2 → Quruq, sug'orish kerak 🔴

**NDWI bilan farqi:**
• NDWI — suv va o'simlikdagi namlik
• SMI — asosan tuproq yuzasidagi namlik

**Amaliy foydalanish:**
• Sug'orish jadvalini optimallashtirish
• Qurg'oqchilik erta signali olish
• Tomchi sug'orish nazorati`,
    en: `💦 **SMI — Soil Moisture Index**

SMI uses B8A/B11 NIR-SWIR ratio to estimate surface soil moisture.

**Value Range:**
• > 0.6 → Wet, no irrigation needed 🔵
• 0.4–0.6 → Normal moisture 🟢
• 0.2–0.4 → Drying, monitor closely 🟡
• < 0.2 → Dry, irrigation required 🔴

**vs NDWI:**
• NDWI — water in vegetation + soil
• SMI — primarily surface soil moisture

**Practical Uses:**
• Optimize irrigation scheduling
• Early drought warning system
• Monitor drip irrigation effectiveness`,
  },
  {
    keys: ['tejam', 'tomchi', 'drip', 'suv sarfi', 'water saving', 'efficient irrigat'],
    uz: `💦 **Tejamli sug'orish tizimlari**

**Tomchilatib sug'orish afzalliklari:**
• Suv tejalishi: 35–50%
• Hosildorlik oshishi: 20–30%
• Sho'rlanish kamayishi
• Fertigation (suvga o'g'it qo'shib berish)

**Narx (taxminiy):**
• Oddiy tizim: 3–5 mln so'm/ga
• Avtomatlashgan: 8–12 mln so'm/ga
• Amortizatsiya: 3–5 yil

**Davlat dasturi:** O'zbekiston tomchi sug'orish uchun 50% subsidiya bermoqda.

NDWI + SMI monitoring bilan suv sarfini 40% kamaytirish mumkin!`,
    en: `💦 **Water-Efficient Irrigation**

**Drip Irrigation Benefits:**
• Water savings: 35–50%
• Yield increase: 20–30%
• Reduced salinity buildup
• Fertigation (fertilizer via irrigation water)

**Cost Estimates:**
• Basic system: 3–5M sum/ha
• Automated: 8–12M sum/ha
• Payback period: 3–5 years

**Government Support:** Uzbekistan offers 50% subsidies for drip irrigation.

Combined with NDWI + SMI monitoring, reduce water use by up to 40%!`,
  },
  {
    keys: ['pdf', 'hisobot', 'report', 'export', 'yuklab ol'],
    uz: `📄 **PDF Hisobot yuklab olish**

GEE Sentinel-2 tahlilidan keyin PDF hisobot tayyorlanadi.

**Hisobotda nima bor:**
• Polygon maydoni va koordinatalari
• NDVI, NDWI, SI, BSI, NDRE, MSAVI, SMI qiymatlari
• Har bir indeks bo'yicha status va tavsiya
• Xavf darajasi baholash
• Tahlil sanasi va ma'lumot manbai

**Qanday olish:**
1. "Dala chizish" rejimiga o'ting
2. Polygon chizing
3. GEE tahlili tugagach
4. "PDF Yuklab olish" tugmasini bosing`,
    en: `📄 **PDF Report Download**

After GEE Sentinel-2 analysis, a full PDF report is generated.

**Report Contents:**
• Polygon area and coordinates
• NDVI, NDWI, SI, BSI, NDRE, MSAVI, SMI values
• Status and recommendations per index
• Risk level assessment
• Analysis date and data source

**How to Get It:**
1. Switch to "Field Drawing" mode
2. Draw a polygon on the map
3. Wait for GEE analysis to complete
4. Click "Download PDF" button`,
  },
  {
    keys: ['si indeks', 'si qiymat', 'sho\'rlanish indeks', 'si layer'],
    uz: `🧪 **SI — Sho'rlanish indeksi (Sentinel-2)**

SI = √(Band4 × Band3) — qizil va yashil kanallar asosida.

**Qiymatlar (GEE):**
• SI < 0.05 → Sho'rlanmagan 🟢
• SI 0.05–0.15 → O'rtacha sho'r 🟡
• SI 0.15–0.25 → Yuqori sho'r 🟠
• SI > 0.25 → Juda yuqori, ekin o'smaydi 🔴

**SI va EC farqi:**
• SI — keng maydon uchun (kosmosdan, bepul)
• EC — laboratoriya aniq tahlili

**Tavsiya:** SI > 0.2 bo'lsa, darhol EC va SAR ni laboratoriyada tekshiring.`,
    en: `🧪 **SI — Salinity Index (Sentinel-2)**

SI = √(Band4 × Band3) — computed from red and green bands.

**Value Range (GEE):**
• SI < 0.05 → No salinity 🟢
• SI 0.05–0.15 → Moderate salt 🟡
• SI 0.15–0.25 → High salinity 🟠
• SI > 0.25 → Very high, crops fail 🔴

**SI vs EC:**
• SI — large-area remote sensing (free, fast)
• EC — precise lab measurement (definitive)

**Recommendation:** SI > 0.2 → immediately test EC and SAR in a laboratory.`,
  },
]

function matchResponse(input, lang) {
  const lower = input.toLowerCase()
  for (const item of DEMO_DB) {
    if (item.keys.some(k => lower.includes(k))) {
      return item[lang] ?? item.uz
    }
  }
  return lang === 'en'
    ? `I don't have specific info on that topic. Try asking about:\n\n🌿 NDVI, NDWI, BSI, SI, NDRE, MSAVI, SMI\n🌾 Cotton or wheat farming\n🧂 Soil salinity or pH\n☁️ Weather and irrigation\n🛰️ Sentinel-2 satellite data\n\nOr type "help" for a full topic list!`
    : `Bu mavzu bo'yicha ma'lumot topa olmadim. Quyidagilar haqida so'rang:\n\n🌿 NDVI, NDWI, BSI, SI, NDRE, MSAVI, SMI\n🌾 Paxta yoki bug'doy ekish\n🧂 Sho'rlanish yoki pH\n☁️ Ob-havo va sug'orish\n🛰️ Sentinel-2 sun'iy yo'ldosh\n\nYoki "salom" yozing — to'liq ro'yxatni ko'rasiz!`
}

function AiChat({ lang, setLang }) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)

  const initText = l => l === 'uz'
    ? "Salom! Men SoilAgroWatch AI yordamchisiman.\nTuproq, indekslar yoki agro-maslahat bo'yicha\nsavolingizni yozing 🌱"
    : "Hello! I'm SoilAgroWatch AI assistant.\nAsk me about soil indices, crops,\nweather or agronomy! 🌱"

  useEffect(() => {
    setMessages([{ role: 'assistant', text: initText('uz') }])
  }, []) // eslint-disable-line

  useEffect(() => {
    setMessages([{ role: 'assistant', text: initText(lang) }])
    setInput('')
  }, [lang]) // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    const delay = 1500 + Math.random() * 1000
    await new Promise(r => setTimeout(r, delay))
    const reply = matchResponse(text, lang)
    setMessages(prev => [...prev, { role: 'assistant', text: reply }])
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
            <div className="chat-header-right">
              <button
                className={`chat-lang-btn${lang === 'uz' ? ' chat-lang-btn--active' : ''}`}
                onClick={() => setLang('uz')}
              >UZ</button>
              <button
                className={`chat-lang-btn${lang === 'en' ? ' chat-lang-btn--active' : ''}`}
                onClick={() => setLang('en')}
              >EN</button>
              <button className="chat-close" onClick={() => setOpen(false)}>✕</button>
            </div>
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
                <span className="chat-dots"><span/><span/><span/></span>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder={lang === 'en' ? 'Ask a question...' : 'Savol bering...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              className="chat-send"
              onClick={send}
              disabled={loading || !input.trim()}
              title={lang === 'uz' ? 'Yuborish' : 'Send'}
            >➤</button>
          </div>
        </div>
      )}
    </>
  )
}

export default App
