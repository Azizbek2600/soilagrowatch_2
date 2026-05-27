import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import './DrawMap.css'
import { generatePdfReport } from './ReportExport'
import AIFieldDetector      from './AIFieldDetector'
import { t } from '../i18n'

// ── Eski static JSON lar (local fallback uchun saqlanadi) ──
import ndviData from '../data/ndvi.json'
import ndwiData from '../data/ndwi.json'
import siData   from '../data/si.json'
import bsiData  from '../data/bsi.json'

const GEE_API   = '/api/analyze'
const YEARS     = [2022, 2023, 2024]
const YEAR_CLRS = { 2022: '#f59e0b', 2023: '#60a5fa', 2024: '#34d399' }

// ═══════════════════════════════════════════════
// LOCAL ANALYSIS HELPERS (gridcode 1-5 asosida)
// ═══════════════════════════════════════════════
function pip(point, ring) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}
function ringCentroid(ring) {
  let sx = 0, sy = 0
  for (const [x, y] of ring) { sx += x; sy += y }
  return [sx / ring.length, sy / ring.length]
}
function analyzeFile(drawnRings, geojson) {
  let wSum = 0, total = 0
  for (const feature of geojson.features) {
    if (!feature.geometry) continue
    const gc = feature.properties.gridcode
    for (const poly of feature.geometry.coordinates) {
      const c = ringCentroid(poly[0])
      if (drawnRings.some(r => pip(c, r))) { wSum += gc; total++ }
    }
  }
  return total === 0 ? null : { avg: wSum / total, count: total }
}

// ═══════════════════════════════════════════════
// NDVI HEATMAP HELPERS (50×50 OneSoil-style grid)
// ═══════════════════════════════════════════════
function rng(n) {
  const x = Math.sin(n * 9301.0 + 49297.0) * 233280.0
  return x - Math.floor(x)
}

const NDVI_PALETTE = [
  [ 0.60, '#004400'],
  [ 0.52, '#006600'],
  [ 0.45, '#008800'],
  [ 0.38, '#22AA00'],
  [ 0.32, '#44CC00'],
  [ 0.26, '#88DD00'],
  [ 0.20, '#BBEE00'],
  [ 0.15, '#DDEE00'],
  [ 0.10, '#FFEE00'],
  [ 0.06, '#FFCC00'],
  [ 0.02, '#FFAA00'],
  [-0.02, '#FF7700'],
  [-0.06, '#FF4400'],
  [-0.10, '#EE1100'],
]
function ndviColor(v) {
  for (const [t, c] of NDVI_PALETTE) if (v >= t) return c
  return '#CC0000'
}

function buildHeatmap(mapInstance, layers) {
  if (!mapInstance || !layers.length) return null

  // Closed ring in [lng, lat] order
  const lls  = layers[0].getLatLngs()[0]
  const ring = lls.map(ll => [ll.lng, ll.lat])
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ring.push(ring[0])

  const bounds = layers[0].getBounds()
  const nw = bounds.getNorthWest(), se = bounds.getSouthEast()
  const minLng = nw.lng, maxLng = se.lng
  const minLat = se.lat, maxLat = nw.lat
  const dLng   = maxLng - minLng
  const dLat   = maxLat - minLat

  // Deterministic seed from centroid
  const cx0 = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const cy0 = ring.reduce((s, p) => s + p[1], 0) / ring.length
  const S   = Math.round(cx0 * 1e4 + cy0 * 1e5)

  // 5 zone centers — positions + NDVI values seeded from polygon centroid
  const centers = Array.from({ length: 5 }, (_, i) => ({
    nx:   rng(S + i * 13 + 1),
    ny:   rng(S + i * 17 + 2),
    ndvi: rng(S + i * 41 + 7) * 0.75 - 0.08,   // range: −0.08 … 0.67
  }))

  const G    = 80
  const cLng = dLng / G
  const cLat = dLat / G
  const group = L.featureGroup()

  for (let row = 0; row < G; row++) {
    for (let col = 0; col < G; col++) {
      // Normalised cell centre
      const nx  = (col + 0.5) / G
      const ny  = (row + 0.5) / G
      // Geographic centre for PIP
      const lng = minLng + nx * dLng
      const lat = minLat + ny * dLat

      // Ray-casting point-in-polygon
      if (!pip([lng, lat], ring)) continue

      // Weighted average of the 2 nearest centers → wide smooth gradient zones
      const nearest = centers
        .map(c => ({ ndvi: c.ndvi, dist: Math.sqrt((nx - c.nx) ** 2 + (ny - c.ny) ** 2) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2)

      let wSum = 0, vSum = 0
      for (const c of nearest) {
        const w = 1 / Math.pow(c.dist + 1e-9, 2)
        wSum += w; vSum += w * c.ndvi
      }

      // ±0.015 jitter for subtle sub-cell texture
      const jitter = (rng(S + row * 97 + col * 53) - 0.5) * 0.03
      const ndvi   = Math.max(-0.15, Math.min(0.75, vSum / wSum + jitter))

      L.rectangle(
        [[minLat +  row      * cLat, minLng +  col      * cLng],
         [minLat + (row + 1) * cLat, minLng + (col + 1) * cLng]],
        { fillColor: ndviColor(ndvi), fillOpacity: 0.85, stroke: false, interactive: false }
      ).addTo(group)
    }
  }

  return group
}

// ═══════════════════════════════════════════════
// INDEX CONFIG — LOCAL (gridcode 1-5)
// ═══════════════════════════════════════════════
const LOCAL_INDICES = [
  {
    key: 'ndvi', label: 'NDVI', name: "O'simlik qoplami", icon: '🌿',
    status: v => v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'bad',
    text:   v => v >= 3.5 ? "Yaxshi o'simlik qoplami — dala sog'lom"
               : v >= 2.5 ? "O'rtacha o'simlik — kuzatish tavsiya etiladi"
               :             "Zaiflashgan o'simlik — zudlik bilan chora ko'ring",
    score:  v => (v - 1) / 4,
    fmt:    v => v.toFixed(2),
  },
  {
    key: 'ndwi', label: 'NDWI', name: 'Namlik darajasi', icon: '💧',
    status: v => v >= 3 ? 'good' : v >= 2 ? 'mid' : 'bad',
    text:   v => v >= 3   ? "Yetarli namlik — sug'orish normada"
               : v >= 2   ? "O'rtacha namlik — sug'orishni tekshiring"
               :             "Namlik past — zudlik bilan sug'orish kerak",
    score:  v => (v - 1) / 4,
    fmt:    v => v.toFixed(2),
  },
  {
    key: 'si', label: 'SI', name: "Sho'rlanish", icon: '🧂',
    status: v => v <= 2 ? 'good' : v <= 3.5 ? 'mid' : 'bad',
    text:   v => v <= 2   ? "Sho'rlanish past — tuproq sog'lom"
               : v <= 3.5 ? "O'rtacha sho'rlanish — melioratsiya tavsiya etiladi"
               :             "Yuqori sho'rlanish — melioratsiya zarur",
    score:  v => (5 - v) / 4,
    fmt:    v => v.toFixed(2),
  },
  {
    key: 'bsi', label: 'BSI', name: 'Tuproq qoplami', icon: '🌱',
    status: v => v <= 2 ? 'good' : v <= 3.5 ? 'mid' : 'bad',
    text:   v => v <= 2   ? "Tuproq qoplami yaxshi — eroziya xavfi past"
               : v <= 3.5 ? "O'rtacha tuproq qoplami — kuzatish zarur"
               :             "Yalangoch tuproq ko'p — eroziya xavfi yuqori",
    score:  v => (5 - v) / 4,
    fmt:    v => v.toFixed(2),
  },
]

// ═══════════════════════════════════════════════
// INDEX CONFIG — GEE (haqiqiy Sentinel-2 qiymatlar)
// ═══════════════════════════════════════════════
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const GEE_INDICES = [
  {
    key: 'ndvi', geeKey: 'NDVI', label: 'NDVI', name: "O'simlik qoplami", icon: '🌿',
    status: v => v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad',
    text:   v => v >= 0.4 ? "Yaxshi o'simlik qoplami — Sentinel-2 tasdiqladi"
               : v >= 0.2 ? "O'rtacha o'simlik — kuzatish tavsiya etiladi"
               :             "Zaiflashgan o'simlik — zudlik bilan chora ko'ring",
    score:  v => clamp((v + 0.1) / 0.7, 0, 1),
    fmt:    v => v.toFixed(3),
  },
  {
    key: 'ndwi', geeKey: 'NDWI', label: 'NDWI', name: 'Namlik darajasi', icon: '💧',
    status: v => v >= 0 ? 'good' : v >= -0.2 ? 'mid' : 'bad',
    text:   v => v >= 0    ? "Yetarli namlik — sug'orish normada"
               : v >= -0.2 ? "O'rtacha namlik — sug'orishni tekshiring"
               :              "Namlik past — zudlik bilan sug'orish kerak",
    score:  v => clamp((v + 0.4) / 0.6, 0, 1),
    fmt:    v => v.toFixed(3),
  },
  {
    key: 'si', geeKey: 'SI', label: 'SI', name: "Sho'rlanish", icon: '🧂',
    status: v => v <= 0.1 ? 'good' : v <= 0.2 ? 'mid' : 'bad',
    text:   v => v <= 0.1 ? "Sho'rlanish past — tuproq sog'lom"
               : v <= 0.2 ? "O'rtacha sho'rlanish — melioratsiya tavsiya etiladi"
               :             "Yuqori sho'rlanish — melioratsiya zarur",
    score:  v => 1 - clamp(v / 0.3, 0, 1),
    fmt:    v => v.toFixed(4),
  },
  {
    key: 'bsi', geeKey: 'BSI', label: 'BSI', name: 'Tuproq qoplami', icon: '🌱',
    status: v => v <= -0.05 ? 'good' : v <= 0.1 ? 'mid' : 'bad',
    text:   v => v <= -0.05 ? "Tuproq qoplami yaxshi — eroziya xavfi past"
               : v <= 0.1   ? "O'rtacha tuproq qoplami — kuzatish zarur"
               :               "Yalangoch tuproq ko'p — eroziya xavfi yuqori",
    score:  v => 1 - clamp((v + 0.3) / 0.6, 0, 1),
    fmt:    v => v.toFixed(3),
  },
  {
    key: 'ndre', geeKey: 'NDRE', label: 'NDRE', name: "O'simlik sog'lig'i", icon: '🩺',
    status: v => v >= 0.3 ? 'good' : v >= 0.1 ? 'mid' : 'bad',
    text:   v => v >= 0.3 ? "O'simlik sog'lom — xlorofil darajasi normal"
               : v >= 0.1 ? "O'simlik oziqlanishi o'rtacha — monitoring zarur"
               :             "O'simlik zaifroq — oziqlanish yoki kasallik xavfi",
    score:  v => clamp((v - 0.05) / 0.35, 0, 1),
    fmt:    v => v.toFixed(3),
  },
  {
    key: 'msavi', geeKey: 'MSAVI', label: 'MSAVI', name: "Tuproq kompensatsiya", icon: '🏜️',
    status: v => v >= 0.25 ? 'good' : v >= 0.1 ? 'mid' : 'bad',
    text:   v => v >= 0.25 ? "Yetarli o'simlik qoplami — tuproq himoyalangan"
               : v >= 0.1  ? "O'rtacha qoplam — qo'shimcha parvarishlash tavsiya etiladi"
               :              "Zaiflashgan qoplam — eroziya va qurishdan himoya zarur",
    score:  v => clamp(v / 0.4, 0, 1),
    fmt:    v => v.toFixed(3),
  },
  {
    key: 'smi', geeKey: 'SMI', label: 'SMI', name: 'Tuproq namligi', icon: '💦',
    status: v => v >= 0.4 ? 'good' : v >= 0.2 ? 'mid' : 'bad',
    text:   v => v >= 0.4 ? "Tuproq namligi yetarli — sug'orish normada"
               : v >= 0.2 ? "O'rtacha namlik — sug'orishni kuchaytirish tavsiya etiladi"
               :             "Namlik past — zudlik bilan sug'orish kerak",
    score:  v => clamp((v - 0.1) / 0.4, 0, 1),
    fmt:    v => v.toFixed(3),
  },
]

// ═══════════════════════════════════════════════
// XAVF DARAJASI
// ═══════════════════════════════════════════════
function getRiskBadge(analysis, indices) {
  const badCount = indices.filter(i => analysis[i.key] && i.status(analysis[i.key].avg) === 'bad').length
  const midCount = indices.filter(i => analysis[i.key] && i.status(analysis[i.key].avg) === 'mid').length
  if (badCount >= 2)              return { label: 'Xavfli', level: 'danger'  }
  if (badCount >= 1 || midCount >= 3) return { label: 'Diqqat',  level: 'warning' }
  return { label: 'Yaxshi', level: 'good' }
}

// ═══════════════════════════════════════════════
// UMUMIY BAHO
// ═══════════════════════════════════════════════
function getOverall(analysis, indices) {
  const scores = indices.filter(i => analysis[i.key]).map(i => i.score(analysis[i.key].avg))
  if (!scores.length) return null
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length
  return avg >= 0.6
    ? { label: 'Yaxshi',   sub: "Dala umumiy holati yaxshi",                  status: 'good' }
    : avg >= 0.4
    ? { label: "O'rtacha", sub: "Ba'zi ko'rsatkichlarga e'tibor bering",       status: 'mid'  }
    : { label: 'Yomon',    sub: "Zudlik bilan agrotexnik chora ko'ring",       status: 'bad'  }
}

// ═══════════════════════════════════════════════
// GEE BACKEND CALL
// ═══════════════════════════════════════════════
async function fetchGeeAnalysis(layers, yr) {
  const rings = layers.map(layer => {
    const lls  = layer.getLatLngs()[0]
    const ring = lls.map(ll => [ll.lng, ll.lat])
    if (ring.length > 0) ring.push(ring[0])
    return ring
  })

  const res = await fetch(GEE_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ coordinates: rings[0], year: yr }),
    signal:  AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Backend xatosi: ${res.status}`)
  }

  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'GEE xatosi')

  const d = json.data
  return {
    source: 'GEE',
    year:   json.year ?? yr,
    period: json.period,
    ndvi:  d.NDVI  != null ? { avg: d.NDVI  } : null,
    ndwi:  d.NDWI  != null ? { avg: d.NDWI  } : null,
    si:    d.SI    != null ? { avg: d.SI    } : null,
    bsi:   d.BSI   != null ? { avg: d.BSI   } : null,
    ndre:  d.NDRE  != null ? { avg: d.NDRE  } : null,
    msavi: d.MSAVI != null ? { avg: d.MSAVI } : null,
    smi:   d.SMI   != null ? { avg: d.SMI   } : null,
  }
}

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════
export default function DrawMap({ activeTab, onTabChange, importedField, onAnalysisUpdate, lang }) {
  const activeLang = lang ?? 'uz'
  const mapRef      = useRef(null)
  const instanceRef = useRef(null)
  const drawnRef    = useRef(null)
  const geeLayerRef     = useRef(null)   // Leaflet TileLayer: GEE heatmap
  const geeReadyRef     = useRef(false)  // true when GEE analysis succeeded
  const heatmapLayerRef = useRef(null)   // canvas NDVI ImageOverlay (demo fallback)

  const [polygons,        setPolygons]        = useState([])
  const [analysis,        setAnalysis]        = useState(null)
  const [compareAnalysis, setCompareAnalysis] = useState(null)
  const [analyzing,       setAnalyzing]       = useState(false)
  const [analyzeMsg,      setAnalyzeMsg]      = useState('')
  const [year,            setYear]            = useState(2024)
  const [compareMode,     setCompareMode]     = useState(false)
  const [compareYear,     setCompareYear]     = useState(2023)
  const [activeIndex,     setActiveIndex]     = useState('ndvi')  // vizual layer
  const [layerLoading,    setLayerLoading]    = useState(false)
  const [layerError,      setLayerError]      = useState(null)    // error toast
  const [layerStats,      setLayerStats]      = useState(null)    // { mean, min, max, imageDate }

  // Refs for stable callbacks inside Leaflet event handlers (stale closure fix)
  const runAnalysisRef        = useRef(null)
  const fetchAndApplyLayerRef = useRef(null)

  async function runAnalysis(layers) {
    if (layers.length === 0) {
      setAnalysis(null)
      setCompareAnalysis(null)
      return
    }

    setAnalyzing(true)
    setAnalysis(null)
    setCompareAnalysis(null)

    // 1. GEE backend
    try {
      setAnalyzeMsg(`🛰️ Sentinel-2 yuklanmoqda (${year})...`)
      const geeA = await fetchGeeAnalysis(layers, year)
      const hasA = GEE_INDICES.some(i => geeA[i.key])
      setAnalysis(hasA ? geeA : { empty: true, source: 'GEE' })

      if (compareMode && hasA) {
        try {
          setAnalyzeMsg(`🛰️ Sentinel-2 yuklanmoqda (${compareYear})...`)
          const geeB    = await fetchGeeAnalysis(layers, compareYear)
          const hasB    = GEE_INDICES.some(i => geeB[i.key])
          setCompareAnalysis(hasB ? geeB : null)
        } catch {
          setCompareAnalysis(null)
        }
      }

      // ── Tile layer: GEE analysis muvaffaqiyatli bo'lsa vizual layer yuklash
      if (hasA) {
        geeReadyRef.current = true
        fetchAndApplyLayerRef.current(layers, activeIndex)
      }

      setAnalyzing(false)
      return
    } catch (geeErr) {
      console.warn('[GEE backend xatosi, local fallback]', geeErr.message)
    }

    // 2. Local static JSON fallback (yillar yo'q — barcha yillar uchun bir xil)
    try {
      setAnalyzeMsg("📂 Mahalliy ma'lumotlar tahlillanmoqda...")
      await new Promise(r => setTimeout(r, 30))
      const drawnRings = layers.map(layer => {
        const lls  = layer.getLatLngs()[0]
        const ring = lls.map(ll => [ll.lng, ll.lat])
        if (ring.length > 0) ring.push(ring[0])
        return ring
      })
      const result = {
        source: 'local',
        ndvi: analyzeFile(drawnRings, ndviData),
        ndwi: analyzeFile(drawnRings, ndwiData),
        si:   analyzeFile(drawnRings, siData),
        bsi:  analyzeFile(drawnRings, bsiData),
      }
      const hasData = LOCAL_INDICES.some(i => result[i.key])
      setAnalysis(hasData ? result : { empty: true, source: 'local' })
    } catch (localErr) {
      console.error('[Local tahlil xatosi]', localErr)
      setAnalysis({ empty: true, source: 'local' })
    }

    setAnalyzing(false)
  }

  // ─── Tile layer: GEE heatmap ni Leaflet xaritasiga qo'shish ─────────────────
  async function fetchAndApplyLayer(layers, indexKey) {
    if (!layers.length || !instanceRef.current) return

    const lls  = layers[0].getLatLngs()[0]
    const ring = lls.map(ll => [ll.lng, ll.lat])
    if (ring.length > 0) ring.push(ring[0])

    setLayerLoading(true)
    setLayerError(null)
    console.log(`[tile-layer] so'rov: index=${indexKey}, date=${year}`)

    try {
      const res = await fetch('/api/gee/field-layer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // "date" — yil yoki sana string (server ikkalasini ham qabul qiladi)
        body:    JSON.stringify({ geometry: ring, index: indexKey, date: String(year) }),
        signal:  AbortSignal.timeout(45000),
      })

      let data
      try { data = await res.json() } catch { data = {} }

      if (!res.ok) throw new Error(data.error || `Server xatosi: ${res.status}`)
      if (data.error) throw new Error(data.error)
      if (!data.tileUrl) throw new Error('tileUrl qaytarilmadi')

      console.log(`[tile-layer] ✅ tileUrl: ${data.tileUrl.slice(0, 90)}`)
      console.log(`[tile-layer] imageDate: ${data.imageDate}`)
      console.log(`[tile-layer] statistics:`, data.statistics)

      // Eski layerni olib tashlaymiz
      if (geeLayerRef.current && instanceRef.current) {
        instanceRef.current.removeLayer(geeLayerRef.current)
        geeLayerRef.current = null
      }

      // Yangi tile layer qo'shamiz (opacity: 0.7)
      const tileLayer = L.tileLayer(data.tileUrl, {
        opacity:     0.7,
        maxZoom:     19,
        attribution: `GEE S-2 ${data.imageDate || year} | ${indexKey.toUpperCase()}`,
        crossOrigin: true,
      })
      tileLayer.addTo(instanceRef.current)
      geeLayerRef.current = tileLayer

      // Statistika va rasmni saqlaymiz
      setLayerStats({
        mean:      data.statistics?.mean  ?? null,
        min:       data.statistics?.min   ?? null,
        max:       data.statistics?.max   ?? null,
        imageDate: data.imageDate         ?? null,
      })

    } catch (err) {
      console.error('[tile-layer] xato:', err.message)
      setLayerError(err.message)
      // 5 soniyadan keyin toast o'chadi
      setTimeout(() => setLayerError(null), 5000)
    } finally {
      setLayerLoading(false)
    }
  }

  // Har render da ref yangilanadi — stale closure yo'q
  runAnalysisRef.current        = runAnalysis
  fetchAndApplyLayerRef.current = fetchAndApplyLayer

  // analysis yoki polygons o'zgarganda parent ga uzat
  useEffect(() => {
    if (onAnalysisUpdate) onAnalysisUpdate(analysis, polygons)
  }, [analysis, polygons]) // eslint-disable-line

  // Yil yoki compare rejimi o'zgarganda re-tahlil
  useEffect(() => {
    if (!drawnRef.current) return
    const layers = drawnRef.current.getLayers()
    if (layers.length > 0) runAnalysisRef.current(layers)
  }, [year, compareMode, compareYear]) // eslint-disable-line

  // Indeks o'zgarganda: GEE layerni yangilaymiz (faqat GEE tahlil mavjud bo'lsa)
  useEffect(() => {
    if (!geeReadyRef.current || !drawnRef.current) return
    const layers = drawnRef.current.getLayers()
    if (layers.length > 0) fetchAndApplyLayerRef.current(layers, activeIndex)
  }, [activeIndex]) // eslint-disable-line

  // Xarita init — bir marta
  useEffect(() => {
    if (instanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [42.85, 60.08], zoom: 13, zoomControl: false, preferCanvas: true,
    })
    L.tileLayer(
      'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { attribution: '© Google', maxZoom: 21, subdomains: '0123' }
    ).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnRef.current = drawnItems

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2.5 },
          metric: true,
        },
        polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false,
      },
      edit: { featureGroup: drawnItems },
    })
    map.addControl(drawControl)

    function refreshAll() {
      const layers = drawnRef.current.getLayers()
      const list = layers.map((l, i) => ({
        id: i + 1,
        ha: L.GeometryUtil.geodesicArea(l.getLatLngs()[0]) / 10000,
      }))
      setPolygons(list)

      // Eski canvas heatmap ni olib tashlaymiz
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current)
        heatmapLayerRef.current = null
      }

      if (layers.length === 0) {
        geeReadyRef.current = false
        setLayerStats(null)
        setLayerError(null)
        if (geeLayerRef.current) {
          map.removeLayer(geeLayerRef.current)
          geeLayerRef.current = null
        }
      } else {
        // Demo heatmap — GEE tayyor bo'lgunga qadar ko'rsatiladi
        const hm = buildHeatmap(map, layers)
        if (hm) { hm.addTo(map); heatmapLayerRef.current = hm }
      }

      runAnalysisRef.current(layers)
    }

    map.on(L.Draw.Event.CREATED, e => { drawnItems.addLayer(e.layer); refreshAll() })
    map.on(L.Draw.Event.EDITED,  refreshAll)
    map.on(L.Draw.Event.DELETED, refreshAll)

    instanceRef.current = map
    return () => {
      geeLayerRef.current     = null
      heatmapLayerRef.current = null
      map.remove()
      instanceRef.current = null
    }
  }, [])

  // Wizard dan kelgan GeoJSON ni xaritaga qo'shish
  useEffect(() => {
    if (!importedField || !drawnRef.current || !instanceRef.current) return

    drawnRef.current.clearLayers()

    // Eski heatmap ni tozalaymiz
    if (heatmapLayerRef.current) {
      instanceRef.current.removeLayer(heatmapLayerRef.current)
      heatmapLayerRef.current = null
    }

    L.geoJSON(importedField, {
      style: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2.5 },
    }).eachLayer(layer => drawnRef.current.addLayer(layer))

    const layers = drawnRef.current.getLayers()
    const list = layers.map((l, i) => {
      const lls  = l.getLatLngs()
      const ring = Array.isArray(lls[0][0]) ? lls[0][0] : lls[0]
      return { id: i + 1, ha: L.GeometryUtil.geodesicArea(ring) / 10000 }
    })
    setPolygons(list)

    // Demo heatmap ni ko'rsatamiz
    const hm = buildHeatmap(instanceRef.current, layers)
    if (hm) { hm.addTo(instanceRef.current); heatmapLayerRef.current = hm }

    runAnalysisRef.current(layers)

    const bounds = drawnRef.current.getBounds()
    if (bounds.isValid()) instanceRef.current.fitBounds(bounds, { padding: [40, 40] })
  }, [importedField]) // eslint-disable-line

  // ── Hisoblashlar ──
  const isGee      = analysis?.source === 'GEE'
  const INDICES    = isGee ? GEE_INDICES : LOCAL_INDICES
  const totalHa    = polygons.reduce((s, p) => s + p.ha, 0)
  const overall    = analysis && !analysis.empty ? getOverall(analysis, INDICES) : null
  const hasCmpData = compareMode && compareAnalysis && !compareAnalysis.empty
  const showAIDetect = activeTab === 'ai-detect'

  // Maydon paneli uchun qo'shimcha statistika
  const areaStats = (() => {
    if (!analysis || analysis.empty) return null
    const avail = INDICES.filter(i => analysis[i.key])
    if (!avail.length) return null
    const ndviDef = INDICES.find(i => i.key === 'ndvi')
    const best    = avail.reduce((b, i) => i.score(analysis[i.key].avg) > b.score(analysis[b.key].avg) ? i : b)
    const worst   = avail.reduce((w, i) => i.score(analysis[i.key].avg) < w.score(analysis[w.key].avg) ? i : w)
    return {
      ndvi:  ndviDef && analysis.ndvi ? { idx: ndviDef, val: analysis.ndvi.avg } : null,
      best:  { label: best.label,  st: best.status(analysis[best.key].avg)   },
      worst: { label: worst.label, st: worst.status(analysis[worst.key].avg) },
      yr:    analysis.year ?? (isGee ? year : null),
    }
  })()

  function handleAIConfirm(geojson) {
    if (!drawnRef.current || !instanceRef.current) return
    drawnRef.current.clearLayers()

    // Eski heatmap ni tozalaymiz
    if (heatmapLayerRef.current) {
      instanceRef.current.removeLayer(heatmapLayerRef.current)
      heatmapLayerRef.current = null
    }

    L.geoJSON(geojson, {
      style: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2.5 },
    }).eachLayer(layer => drawnRef.current.addLayer(layer))
    const layers = drawnRef.current.getLayers()
    const list = layers.map((l, i) => {
      const lls  = l.getLatLngs()
      const ring = Array.isArray(lls[0][0]) ? lls[0][0] : lls[0]
      return { id: i + 1, ha: L.GeometryUtil.geodesicArea(ring) / 10000 }
    })
    setPolygons(list)

    // Demo heatmap ni ko'rsatamiz
    const hm = buildHeatmap(instanceRef.current, layers)
    if (hm) { hm.addTo(instanceRef.current); heatmapLayerRef.current = hm }

    runAnalysisRef.current(layers)
    const bounds = drawnRef.current.getBounds()
    if (bounds.isValid()) instanceRef.current.fitBounds(bounds, { padding: [40, 40] })
    onTabChange('dala')
  }

  return (
    <div className="dm-overlay">

      {/* ── Yil tanlash paneli ── */}
      <div className="dm-year-bar">
        <span className="dm-year-label">📅 Yil:</span>

        {YEARS.map(y => (
          <button
            key={y}
            className={`dm-year-btn${year === y ? ' dm-year-btn--active' : ''}`}
            style={year === y ? { borderColor: YEAR_CLRS[y], color: YEAR_CLRS[y] } : undefined}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}

        <div className="dm-year-sep" />

        <button
          className={`dm-compare-toggle${compareMode ? ' dm-compare-toggle--active' : ''}`}
          onClick={() => setCompareMode(m => !m)}
          title="Ikki yilni taqqoslash"
        >
          ↔ Taqqoslash
        </button>

        {compareMode && (
          <>
            <span className="dm-year-vs">vs</span>
            {YEARS.map(y => (
              <button
                key={y}
                className={`dm-year-btn dm-year-btn--cmp${compareYear === y ? ' dm-year-btn--cmp-active' : ''}`}
                style={compareYear === y ? { borderColor: YEAR_CLRS[y], color: YEAR_CLRS[y] } : undefined}
                onClick={() => setCompareYear(y)}
              >
                {y}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Indeks layer tanlash (GEE tahlildan keyin ko'rinadi) ── */}
      {analysis?.source === 'GEE' && !analysis.empty && !analyzing && (
        <div className="dm-layer-bar">
          <span className="dm-layer-label">🛰️</span>
          {[
            { key: 'ndvi',  label: 'NDVI',  color: '#1a9850' },
            { key: 'ndwi',  label: 'NDWI',  color: '#0D47A1' },
            { key: 'smi',   label: 'SMI',   color: '#0571b0' },
            { key: 'bsi',   label: 'BSI',   color: '#d73027' },
            { key: 'ndre',  label: 'NDRE',  color: '#313695' },
            { key: 'msavi', label: 'MSAVI', color: '#1B4D2F' },
            { key: 'si',    label: 'SI',    color: '#b35c00' },
          ].filter(i => analysis[i.key]).map(idx => (
            <button
              key={idx.key}
              className={`dm-layer-btn${activeIndex === idx.key ? ' dm-layer-btn--active' : ''}`}
              style={activeIndex === idx.key ? {
                borderColor: idx.color,
                color:       idx.color,
                background:  idx.color + '18',
              } : undefined}
              onClick={() => setActiveIndex(idx.key)}
              disabled={layerLoading}
            >
              {activeIndex === idx.key && layerLoading ? '⏳ ' : ''}{idx.label}
            </button>
          ))}

          {layerLoading && <span className="dm-layer-spin" />}

          {/* Rasm sanasi va o'rtacha qiymat */}
          {layerStats && !layerLoading && (
            <>
              <div className="dm-layer-sep" />
              <div className="dm-layer-stats">
                {layerStats.imageDate && (
                  <span className="dm-layer-date">📅 {layerStats.imageDate}</span>
                )}
                {layerStats.mean !== null && (
                  <span className="dm-layer-mean">
                    ⌀ {Number(layerStats.mean).toFixed(3)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Layer xatosi — toast (auto-dismiss 5s) ── */}
      {layerError && (
        <div className="dm-layer-toast">
          <span className="dm-layer-toast-ico">⚠️</span>
          <span className="dm-layer-toast-msg">{layerError}</span>
          <button className="dm-layer-toast-x" onClick={() => setLayerError(null)}>✕</button>
        </div>
      )}

      {/* ── Xarita ── */}
      <div ref={mapRef} className="dm-map" />

      {/* ── Maydon paneli — chap pastda ── */}
      {polygons.length > 0 && (
        <div className="dm-panel dm-panel--area">
          <div className="dm-panel-title">📐 Maydon</div>
          <div className="dm-panel-total">
            <span className="dm-panel-ha">{totalHa.toFixed(2)}</span>
            <span className="dm-panel-unit">ga</span>
          </div>
          <div className="dm-panel-m2">{(totalHa * 10000).toFixed(0)} m²</div>
          {polygons.length > 1 && (
            <div className="dm-panel-list">
              {polygons.map(p => (
                <div key={p.id} className="dm-panel-row">
                  <span className="dm-panel-idx">#{p.id}</span>
                  <span>{p.ha.toFixed(2)} ga</span>
                </div>
              ))}
            </div>
          )}
          <div className="dm-panel-count">{polygons.length} polygon</div>

          {/* ── Tahlil statistikasi ── */}
          {areaStats && !analyzing && (
            <>
              <div className="dm-area-divider" />

              {areaStats.ndvi && (
                <div className="dm-area-stat">
                  <span className="dm-area-stat-lbl">NDVI</span>
                  <span className={`dm-area-stat-num dm-area-stat-num--${areaStats.ndvi.idx.status(areaStats.ndvi.val)}`}>
                    {areaStats.ndvi.idx.fmt(areaStats.ndvi.val)}
                  </span>
                </div>
              )}

              <div className="dm-area-stat">
                <span className="dm-area-stat-lbl">Eng yaxshi</span>
                <span className={`dm-area-chip dm-area-chip--${areaStats.best.st}`}>
                  {areaStats.best.label}
                </span>
              </div>

              <div className="dm-area-stat">
                <span className="dm-area-stat-lbl">Muammo</span>
                <span className={`dm-area-chip dm-area-chip--${areaStats.worst.st}`}>
                  {areaStats.worst.label}
                </span>
              </div>

              <div className="dm-area-stat dm-area-stat--date">
                <span className="dm-area-stat-lbl">Tahlil</span>
                <span className="dm-area-date">
                  {areaStats.yr ? `${areaStats.yr} • ` : ''}{new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tahlil paneli — o'ng pastda ── */}
      {analyzing && (
        <div className="dm-panel dm-panel--analysis dm-panel--loading">
          <div className="dm-analyze-spinner" />
          <span>{analyzeMsg || 'Tahlillanmoqda...'}</span>
        </div>
      )}

      {analysis && !analysis.empty && !analyzing && (
        <div className="dm-panel dm-panel--analysis">

          {/* Manba badge + xavf badge */}
          <div className="dm-panel-header-row">
            <div className={`dm-source-badge dm-source-badge--${isGee ? 'gee' : 'local'}`}>
              {isGee
                ? `🛰️ GEE • ${year}${hasCmpData ? ` vs ${compareYear}` : ''}`
                : "📂 Mahalliy"
              }
            </div>
            {(() => {
              const rb = getRiskBadge(analysis, INDICES)
              return (
                <span className={`dm-risk-badge dm-risk-badge--${rb.level}`}>
                  {rb.level === 'danger' ? '🔴' : rb.level === 'warning' ? '🟡' : '🟢'} {rb.label}
                </span>
              )
            })()}
          </div>

          {/* ── TAQQOSLASH REJIMI ── */}
          {hasCmpData ? (
            <div className="dm-compare-wrap">
              <div className="dm-cmp-header">
                <span />
                <span className="dm-cmp-yr" style={{ color: YEAR_CLRS[year] }}>{year}</span>
                <span className="dm-cmp-yr" style={{ color: YEAR_CLRS[compareYear] }}>{compareYear}</span>
                <span className="dm-cmp-yr dm-cmp-yr--diff">Farq</span>
              </div>

              {GEE_INDICES.map(idx => {
                const resA = analysis[idx.key]
                const resB = compareAnalysis[idx.key]
                if (!resA || !resB) return null
                const diff     = resB.avg - resA.avg
                const improved = idx.score(resB.avg) - idx.score(resA.avg) > 0.01
                const worsened = idx.score(resB.avg) - idx.score(resA.avg) < -0.01
                const diffCls  = improved ? 'up' : worsened ? 'down' : 'flat'
                const diffSign = diff > 0 ? '+' : ''
                return (
                  <div key={idx.key} className="dm-cmp-row">
                    <span className="dm-cmp-icon">{idx.icon}</span>
                    <span className={`dm-cmp-val dm-cmp-val--${idx.status(resA.avg)}`}>
                      {idx.fmt(resA.avg)}
                    </span>
                    <span className={`dm-cmp-val dm-cmp-val--${idx.status(resB.avg)}`}>
                      {idx.fmt(resB.avg)}
                    </span>
                    <span className={`dm-cmp-diff dm-cmp-diff--${diffCls}`}>
                      {diffCls === 'up' ? '↑' : diffCls === 'down' ? '↓' : '–'}
                      {' '}{diffSign}{Math.abs(diff).toFixed(3)}
                    </span>
                  </div>
                )
              })}
            </div>

          ) : (
            /* ── YAKKA YIL REJIMI ── */
            <>
              {overall && (
                <div className={`dm-overall dm-overall--${overall.status}`}>
                  <span className="dm-overall-label">{overall.label}</span>
                  <span className="dm-overall-sub">{overall.sub}</span>
                </div>
              )}

              <div className="dm-panel-title" style={{ marginTop: 10 }}>
                📊 Indekslar tahlili • {isGee ? year : 'Mahalliy'}
              </div>

              <div className="dm-indices">
                {INDICES.map(idx => {
                  const res = analysis[idx.key]
                  if (!res) return null
                  const st = idx.status(res.avg)
                  return (
                    <div key={idx.key} className="dm-idx-row">
                      <div className="dm-idx-left">
                        <span className="dm-idx-icon">{idx.icon}</span>
                        <div className="dm-idx-info">
                          <span className="dm-idx-label">{idx.label}</span>
                          <span className="dm-idx-name">{idx.name}</span>
                        </div>
                      </div>
                      <div className="dm-idx-right">
                        <span className={`dm-idx-val dm-idx-val--${st}`}>
                          {idx.fmt(res.avg)}
                        </span>
                        <span className={`dm-idx-badge dm-idx-badge--${st}`}>
                          {st === 'good' ? 'Yaxshi' : st === 'mid' ? "O'rtacha" : 'Yomon'}
                        </span>
                      </div>
                      <div className={`dm-idx-text dm-idx-text--${st}`}>
                        {idx.text(res.avg)}
                      </div>
                    </div>
                  )
                })}
              </div>

              {isGee && (
                <button
                  className="dm-pdf-btn"
                  onClick={() => generatePdfReport({ analysis, polygons, year, geeIndices: GEE_INDICES })}
                >
                  <i className="ti ti-file-download" />
                  PDF Yuklab olish
                </button>
              )}
            </>
          )}
        </div>
      )}

      {analysis?.empty && !analyzing && (
        <div className="dm-panel dm-panel--analysis dm-panel--empty">
          {isGee
            ? `⚠️ GEE (${year}): polygon hududi uchun Sentinel-2 ma'lumoti topilmadi.`
            : '⚠️ Chizilgan polygon ichida ma\'lumot topilmadi. GeoJSON qoplagan hududda chizing.'
          }
        </div>
      )}

      {/* ── Onboarding yo'riqnoma ── */}
      {polygons.length === 0 && !analyzing && (
        <div className="dm-onboarding">
          <i className="ti ti-map-pin dm-ob-icon" />
          <div className="dm-ob-title">{t(activeLang, 'obTitle')}</div>
          <ol className="dm-ob-steps">
            <li>{t(activeLang, 'obStep1')}</li>
            <li>{t(activeLang, 'obStep2')}</li>
            <li>{t(activeLang, 'obStep3')}</li>
            <li>{t(activeLang, 'obStep4')}</li>
          </ol>
          <div className="dm-ob-divider">{t(activeLang, 'obOr')}</div>
          <button className="dm-ob-upload" onClick={() => onTabChange('fayl-yuklash')}>
            <i className="ti ti-file-upload" />
            {t(activeLang, 'obUpload')}
          </button>
        </div>
      )}

      {/* ── AI Field Detector modal ── */}
      {showAIDetect && (
        <AIFieldDetector
          instanceRef={instanceRef}
          onClose={() => onTabChange('dala')}
          onConfirm={handleAIConfirm}
          lang={activeLang}
        />
      )}
    </div>
  )
}
