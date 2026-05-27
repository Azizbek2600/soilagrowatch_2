import 'dotenv/config'
import express from 'express'
import cors    from 'cors'
import ee      from '@google/earthengine'
import fs      from 'fs'

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'] }))
app.use(express.json({ limit: '1mb' }))

// ─── GEE state ──────────────────────────────────────────────────────────────
let geeReady = false

// ─── GEE initialization ─────────────────────────────────────────────────────
// OAuth 2.0 credentials (~/.config/earthengine/credentials) yoki
// GEE_KEY_PATH orqali service account (Org Policy ruxsat bersa)
function initGEE() {
  return new Promise((resolve, reject) => {
    const keyPath = process.env.GEE_KEY_PATH

    if (keyPath && fs.existsSync(keyPath)) {
      const privateKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
      console.log(`[GEE] Service account: ${privateKey.client_email}`)
      ee.data.authenticateViaPrivateKey(
        privateKey,
        () => ee.initialize(null, null,
          () => { geeReady = true; console.log('[GEE] ✅ Tayyor (service account)'); resolve() },
          err  => reject(new Error(`ee.initialize xatosi: ${err}`))
        ),
        err => reject(new Error(`authenticateViaPrivateKey xatosi: ${err}`))
      )
    } else {
      // OAuth 2.0 / Application Default Credentials
      // earthengine authenticate → ~/.config/earthengine/credentials
      console.log('[GEE] OAuth / ADC bilan urinilmoqda...')
      ee.initialize(null, null,
        () => { geeReady = true; console.log('[GEE] ✅ Tayyor (OAuth/ADC)'); resolve() },
        err  => reject(new Error(`GEE init xatosi: ${err}`))
      )
    }
  })
}

// ─── Guard middleware ────────────────────────────────────────────────────────
function requireGEE(req, res, next) {
  if (!geeReady) return res.status(503).json({ error: 'GEE hozir tayyor emas' })
  next()
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// "date" — yil (2024) yoki "YYYY-MM-DD" string bo'lishi mumkin
function parseDateRange(dateParam) {
  const raw = String(dateParam || 2024)
  // Faqat yil (4 raqam) bo'lsa, vegetatsiya mavsumiini oladi
  if (/^\d{4}$/.test(raw)) {
    const yr = parseInt(raw)
    return { startDate: `${yr}-04-01`, endDate: `${yr}-10-15`, yr }
  }
  // To'liq sana bo'lsa: ± 60 kun oralig'i
  const center = new Date(raw)
  if (isNaN(center)) {
    const yr = 2024
    return { startDate: `${yr}-04-01`, endDate: `${yr}-10-15`, yr }
  }
  const yr         = center.getFullYear()
  const startMs    = center.getTime() - 60 * 24 * 3600 * 1000
  const endMs      = center.getTime() + 60 * 24 * 3600 * 1000
  const fmt        = d => new Date(d).toISOString().slice(0, 10)
  return { startDate: fmt(startMs), endDate: fmt(endMs), yr }
}

// ─── S2 image builder ─────────────────────────────────────────────────────────
// Tahlil uchun: median kompozit (bir necha rasmdan)
function buildS2Median(geom, startDate, endDate) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .median()
    .divide(10000)   // 0–10000 → 0–1
    .clip(geom)
}

// Vizualizatsiya uchun: eng toza bitta rasm (aniq sana beradi)
function buildS2Best(geom, startDate, endDate) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .sort('CLOUDY_PIXEL_PERCENTAGE')
    .first()
    .divide(10000)
    .clip(geom)
}

// ─── Promise wrappers ─────────────────────────────────────────────────────────
function eeGetInfo(eeObj) {
  return new Promise((resolve, reject) => {
    eeObj.getInfo((result, err) => {
      if (err) {
        const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
        reject(new Error(msg))
      } else {
        resolve(result)
      }
    })
  })
}

// GEE tile URL ni olish
// Callback: (mapObj, err) — mapObj.urlFormat yoki eski token format
function eeGetMap(image, visParams) {
  return new Promise((resolve, reject) => {
    image.getMap(visParams, (mapObj, err) => {
      if (err) {
        const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
        reject(new Error(`getMap xatosi: ${msg}`))
        return
      }

      console.log('[eeGetMap] raw result keys:', Object.keys(mapObj || {}))
      console.log('[eeGetMap] mapid:', mapObj?.mapid)
      console.log('[eeGetMap] token:', mapObj?.token ? mapObj.token.slice(0, 30) + '...' : 'yo\'q')
      console.log('[eeGetMap] urlFormat:', mapObj?.urlFormat?.slice(0, 100))

      // urlFormat — eng ishonchli variant (v1.7.x+)
      let urlFormat = mapObj?.urlFormat

      // Eski format: mapid + token → Leaflet URL
      if (!urlFormat && mapObj?.mapid && mapObj?.token) {
        const mapid = mapObj.mapid
        const token = mapObj.token
        // Eski GEE tile URL formati (token URL ichida)
        urlFormat = `https://earthengine.googleapis.com/map/${mapid}/{z}/{x}/{y}?token=${token}`
        console.log('[eeGetMap] eski format bilan qurildi')
      }

      // v1alpha formatni Leaflet uchun moslash ({Z}/{X}/{Y} → {z}/{x}/{y})
      if (urlFormat) {
        urlFormat = urlFormat
          .replace('{Z}', '{z}').replace('{X}', '{x}').replace('{Y}', '{y}')
      }

      if (!urlFormat) {
        reject(new Error(`getMap noma'lum format. Kalitlar: ${JSON.stringify(Object.keys(mapObj || {}))}`))
        return
      }

      console.log('[eeGetMap] ✅ tileUrl:', urlFormat.slice(0, 100))
      resolve({ urlFormat, mapid: mapObj?.mapid, token: mapObj?.token })
    })
  })
}

// ─── Index computation (tahlil uchun — median, 0–1 range) ────────────────────
function computeIndexForAnalyze(s2, key) {
  switch (key) {
    case 'ndvi':  return s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
    case 'ndwi':  return s2.normalizedDifference(['B3', 'B8']).rename('NDWI')
    case 'smi':   return s2.normalizedDifference(['B8A', 'B11']).add(1).divide(2).rename('SMI')
    case 'bsi':
      return s2.expression(
        '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))',
        { SWIR: s2.select('B11'), RED: s2.select('B4'), NIR: s2.select('B8'), BLUE: s2.select('B2') }
      ).rename('BSI')
    case 'si':    return s2.select('B4').multiply(s2.select('B3')).sqrt().rename('SI')
    case 'ndre':  return s2.normalizedDifference(['B8A', 'B5']).rename('NDRE')
    case 'msavi':
      return s2.expression(
        '(2 * NIR + 1 - sqrt((2 * NIR + 1) ** 2 - 8 * (NIR - RED))) / 2',
        { NIR: s2.select('B8'), RED: s2.select('B4') }
      ).rename('MSAVI')
    default:      return s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
  }
}

// ─── Index computation (vizualizatsiya uchun — best single image) ─────────────
// SMI bu yerda B8A/B11 ratio (0.5–2 oralig'i, vis parametrlariga mos)
function computeIndexForVis(s2, key) {
  switch (key) {
    case 'ndvi':  return s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
    case 'ndwi':  return s2.normalizedDifference(['B3', 'B8']).rename('NDWI')
    case 'smi':
      // Tuproq namligi: B8A(NIR) / B11(SWIR1) nisbati
      // Quruq: ~0.5, Nam: ~2+
      return s2.select('B8A').divide(s2.select('B11')).rename('SMI')
    case 'bsi':
      return s2.expression(
        '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))',
        { SWIR: s2.select('B11'), RED: s2.select('B4'), NIR: s2.select('B8'), BLUE: s2.select('B2') }
      ).rename('BSI')
    case 'si':    return s2.select('B4').multiply(s2.select('B3')).sqrt().rename('SI')
    case 'ndre':  return s2.normalizedDifference(['B8A', 'B5']).rename('NDRE')
    case 'msavi':
      return s2.expression(
        '(2 * NIR + 1 - sqrt((2 * NIR + 1) ** 2 - 8 * (NIR - RED))) / 2',
        { NIR: s2.select('B8'), RED: s2.select('B4') }
      ).rename('MSAVI')
    default:      return s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
  }
}

// ─── Visualization palettes ───────────────────────────────────────────────────
// Foydalanuvchi so'ragan parametrlar:
// NDVI: 0–0.8, NDWI: -0.5–0.5, SMI: 0.5–2 (B8A/B11 ratio)
const FIELD_VIS = {
  ndvi:  { min: 0,    max: 0.8,  palette: ['#d73027', '#fee08b', '#1a9850'] },
  ndwi:  { min: -0.5, max: 0.5,  palette: ['#8c510a', '#f6e8c3', '#01665e'] },
  smi:   { min: 0.5,  max: 2.0,  palette: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'] },
  bsi:   { min: -0.5, max: 0.5,  palette: ['#1a9850', '#91cf60', '#ffffbf', '#fc8d59', '#d73027'] },
  si:    { min: 0,    max: 0.25, palette: ['#1a9850', '#d9f0a3', '#ffffcc', '#fd8d3c', '#b10026'] },
  ndre:  { min: -0.1, max: 0.5,  palette: ['#d73027', '#f46d43', '#ffffbf', '#74add1', '#313695'] },
  msavi: { min: -0.1, max: 0.6,  palette: ['#d73027', '#fc8d59', '#ffffbf', '#91cf60', '#1a9850'] },
}

// Tahlil uchun statistika vis (analyze endpointda ishlatilmaydi, faqat reference)
const ANALYZE_VIS = {
  ndvi:  { min: -0.2, max: 0.9,  palette: ['#8B4513','#D2691E','#F4A460','#9ACD32','#32CD32','#006400'] },
  ndwi:  { min: -0.5, max: 0.5,  palette: ['#8B0000','#FF6B35','#FFE0B2','#B3E5FC','#039BE5','#0D47A1'] },
  smi:   { min: 0,    max: 1,    palette: ['#d73027','#f46d43','#fdae61','#abd9e9','#74add1','#4575b4'] },
  bsi:   { min: -0.5, max: 0.5,  palette: ['#1a9850','#91cf60','#d9ef8b','#fee08b','#fc8d59','#d73027'] },
}

// ─── POST /api/analyze ───────────────────────────────────────────────────────
// Input:  { coordinates: [[lng,lat],...], year: 2024 }
// Output: { success, year, period, imageCount, data: {NDVI,NDWI,SI,BSI,NDRE,MSAVI,SMI} }
app.post('/api/analyze', requireGEE, async (req, res) => {
  const { coordinates, year = 2024 } = req.body
  if (!coordinates || !Array.isArray(coordinates)) {
    return res.status(400).json({ error: 'coordinates (GeoJSON ring array) kerak' })
  }

  const { startDate, endDate, yr } = parseDateRange(year)
  console.log(`\n[/api/analyze] yil=${yr}, ${startDate}–${endDate}, ${coordinates.length} nuqta`)

  try {
    const geom = ee.Geometry.Polygon([coordinates])
    const s2   = buildS2Median(geom, startDate, endDate)

    const ndvi  = s2.normalizedDifference(['B8', 'B4']).rename('NDVI')
    const ndwi  = s2.normalizedDifference(['B3', 'B8']).rename('NDWI')
    const si    = s2.select('B4').multiply(s2.select('B3')).sqrt().rename('SI')
    const bsi   = s2.expression(
      '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))',
      { SWIR: s2.select('B11'), RED: s2.select('B4'), NIR: s2.select('B8'), BLUE: s2.select('B2') }
    ).rename('BSI')
    const ndre  = s2.normalizedDifference(['B8A', 'B5']).rename('NDRE')
    const msavi = s2.expression(
      '(2 * NIR + 1 - sqrt((2 * NIR + 1) ** 2 - 8 * (NIR - RED))) / 2',
      { NIR: s2.select('B8'), RED: s2.select('B4') }
    ).rename('MSAVI')
    const smi = s2.normalizedDifference(['B8A', 'B11']).add(1).divide(2).rename('SMI')

    const combined = ndvi.addBands([ndwi, si, bsi, ndre, msavi, smi])

    const statsDict = combined.reduceRegion({
      reducer:    ee.Reducer.mean(),
      geometry:   geom,
      scale:      10,
      maxPixels:  1e9,
      bestEffort: true,
    })

    const imgCount = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(geom)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .size()

    const [stats, count] = await Promise.all([
      eeGetInfo(statsDict),
      eeGetInfo(imgCount),
    ])

    console.log('[/api/analyze] stats:', stats)
    console.log('[/api/analyze] image count:', count)

    if (!stats || Object.values(stats).every(v => v === null)) {
      return res.json({
        success: false,
        error:   "Ushbu hudud va davrda Sentinel-2 ma'lumoti topilmadi",
      })
    }

    res.json({
      success:    true,
      year:       yr,
      period:     `${startDate} – ${endDate}`,
      imageCount: count,
      data: {
        NDVI:  stats.NDVI  ?? null,
        NDWI:  stats.NDWI  ?? null,
        SI:    stats.SI    ?? null,
        BSI:   stats.BSI   ?? null,
        NDRE:  stats.NDRE  ?? null,
        MSAVI: stats.MSAVI ?? null,
        SMI:   stats.SMI   ?? null,
      },
    })
  } catch (err) {
    console.error('[/api/analyze] xato:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/gee/field-layer ───────────────────────────────────────────────
// Input:  { geometry: [[lng,lat],...], index: 'ndvi'|'ndwi'|'smi'|'bsi'|..., date: '2024' | '2024-06-15' }
// Output: { tileUrl, index, year, period, imageDate, statistics: { mean, min, max } }
app.post('/api/gee/field-layer', requireGEE, async (req, res) => {
  const { geometry, index = 'ndvi', date, year } = req.body

  if (!geometry || !Array.isArray(geometry)) {
    return res.status(400).json({ error: 'geometry (GeoJSON ring array) kerak' })
  }

  // date yoki year parametrini qabul qilamiz (backward compat)
  const dateParam = date ?? year ?? 2024
  const key       = (index || 'ndvi').toLowerCase()
  const visParams = FIELD_VIS[key] || FIELD_VIS.ndvi
  const { startDate, endDate, yr } = parseDateRange(dateParam)

  console.log(`\n[/api/gee/field-layer] index=${key}, dateParam=${dateParam} → ${startDate}–${endDate}`)

  try {
    const geom = ee.Geometry.Polygon([geometry])

    // Eng toza rasmni topamiz
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(geom)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .sort('CLOUDY_PIXEL_PERCENTAGE')

    // Kolleksiya bo'sh emasligini tekshiramiz
    const collSize = await eeGetInfo(collection.size())
    console.log(`[/api/gee/field-layer] kolleksiya hajmi: ${collSize}`)

    if (collSize === 0) {
      return res.status(404).json({
        error: `${startDate} – ${endDate} oraliqda ${key.toUpperCase()} uchun toza rasm topilmadi (bulut > 30%)`,
      })
    }

    const bestImage = collection.first()

    // Rasmning aniq sanasini olamiz
    const imageDateStr = await eeGetInfo(bestImage.date().format('YYYY-MM-dd'))
    console.log(`[/api/gee/field-layer] eng yaxshi rasm sanasi: ${imageDateStr}`)

    // Normalize va clip
    const s2       = bestImage.divide(10000).clip(geom)
    const indexImg = computeIndexForVis(s2, key)
    const bandName = key.toUpperCase()

    // Statistika reducer (mean + min + max)
    const statsReducer = ee.Reducer.mean()
      .combine(ee.Reducer.min(),  '', true)
      .combine(ee.Reducer.max(), '', true)

    const statsDict = indexImg.reduceRegion({
      reducer:    statsReducer,
      geometry:   geom,
      scale:      10,
      maxPixels:  1e9,
      bestEffort: true,
    })

    // Tile URL va statistikani parallel olamiz
    const [mapResult, statsResult] = await Promise.all([
      eeGetMap(indexImg, visParams),
      eeGetInfo(statsDict),
    ])

    console.log('[/api/gee/field-layer] statsResult:', statsResult)

    // Statistika kalitlari: "NDVI_mean", "NDVI_min", "NDVI_max" yoki "NDVI"
    const mean = statsResult?.[`${bandName}_mean`] ?? statsResult?.[bandName] ?? null
    const min  = statsResult?.[`${bandName}_min`]  ?? null
    const max  = statsResult?.[`${bandName}_max`]  ?? null

    res.json({
      tileUrl:    mapResult.urlFormat,
      index:      key,
      year:       yr,
      period:     `${startDate} – ${endDate}`,
      imageDate:  imageDateStr,
      statistics: { mean, min, max },
    })
  } catch (err) {
    console.error('[/api/gee/field-layer] xato:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/health ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', geeReady, timestamp: new Date().toISOString() })
})

// ─── Start ───────────────────────────────────────────────────────────────────
initGEE()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Server: http://localhost:${PORT}`)
      console.log(`✅ GEE tayyor`)
      console.log(`📡 Endpointlar:`)
      console.log(`   POST /api/analyze          — Sentinel-2 statistika (median)`)
      console.log(`   POST /api/gee/field-layer  — Vizual tile layer heatmap`)
      console.log(`   GET  /api/health\n`)
    })
  })
  .catch(err => {
    console.error('❌ GEE ishga tushmadi:', err.message)
    console.log('\n💡 Yechimlar:')
    console.log('   1. earthengine authenticate  (OAuth 2.0)')
    console.log('   2. GEE_KEY_PATH=./key.json  (.env ga qo\'shing)\n')
    app.listen(PORT, () => {
      console.log(`⚠️  Server: http://localhost:${PORT} (GEE yo'q — local fallback)\n`)
    })
  })
