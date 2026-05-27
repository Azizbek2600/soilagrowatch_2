import { t } from '../../i18n'
import './FieldDetailsPanel.css'

// ── NDVI computation — same cluster formula as MapPage heatmap ──
function _hmSeed(n) {
  const x = Math.sin(n * 9301.0 + 49297.0) * 233280.0
  return x - Math.floor(x)
}
function _pip(point, ring) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}
function computeAvgNDVI(coords) {
  if (!coords || coords.length < 3) return null
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
    nx: _hmSeed(S + i * 17), ny: _hmSeed(S + i * 31 + 7), base: _hmSeed(S + i * 53 + 13),
  }))
  clusters.sort((a, b) => b.base - a.base)
  clusters[0].base =  0.55 + _hmSeed(S + 100) * 0.20
  clusters[1].base =  0.35 + _hmSeed(S + 200) * 0.15
  clusters[2].base =  0.15 + _hmSeed(S + 300) * 0.12
  clusters[3].base =  0.05 + _hmSeed(S + 400) * 0.10
  clusters[4].base = -0.08 + _hmSeed(S + 500) * 0.10
  const G = 12
  let sum = 0, count = 0
  for (let row = 0; row < G; row++) {
    for (let col = 0; col < G; col++) {
      const nx = (col + 0.5) / G, ny = (row + 0.5) / G
      const lng = minLng + nx * dLng, lat = minLat + ny * dLat
      if (!_pip([lng, lat], ring)) continue
      let wSum = 0, vSum = 0
      for (const cl of clusters) {
        const w = 1 / ((nx - cl.nx) ** 2 + (ny - cl.ny) ** 2 + 1e-4)
        wSum += w; vSum += w * cl.base
      }
      const jitter = (_hmSeed(S + row * 137 + col * 37) - 0.5) * 0.08
      sum += Math.max(-0.15, Math.min(0.85, vSum / wSum + jitter))
      count++
    }
  }
  return count > 0 ? sum / count : null
}
function ndviToDegradKey(ndvi) {
  if (ndvi === null) return null
  if (ndvi < 0.20) return { key: 'highDegradation', color: '#EF4444', bg: '#FEE2E2', border: '#FECACA' }
  if (ndvi < 0.40) return { key: 'average',          color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' }
  return               { key: 'goodCondition',     color: '#10B981', bg: '#D1FAE5', border: '#A7F3D0' }
}

export default function FieldDetailsPanel({ field, onClose, lang }) {
  if (!field) return null

  const activeLang = lang ?? 'uz'
  const coords   = field.geojson?.geometry?.coordinates?.[0] ?? []
  const avgNDVI  = computeAvgNDVI(coords)
  const computed = ndviToDegradKey(avgNDVI)
  const dm       = computed ?? { color: '#9BA3AF', bg: '#F3F4F6', border: '#E4E7EC' }
  const degradLabel = computed ? t(activeLang, computed.key) : (field.degradation ?? t(activeLang, 'noData'))

  return (
    <div className="fdp-panel fdp-panel--open">

      {/* Header */}
      <div className="fdp-header">
        <div className="fdp-header-left">
          <i className="ti ti-map-pin fdp-hdr-icon" />
          <span className="fdp-title" title={field.name}>{field.name}</span>
        </div>
        <button className="fdp-close" onClick={onClose} title={t(activeLang, 'collapse')}>
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Body */}
      <div className="fdp-body">

        {/* Stats grid */}
        <div className="fdp-stats">
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">{t(activeLang, 'area')}</span>
            <span className="fdp-stat-val">{field.area_ha != null ? field.area_ha.toFixed(2) : '—'} ga</span>
          </div>
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">m²</span>
            <span className="fdp-stat-val">
              {field.area_ha != null ? Math.round(field.area_ha * 10000).toLocaleString() : '—'}
            </span>
          </div>
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">{t(activeLang, 'date')}</span>
            <span className="fdp-stat-val">{field.created_at ?? '—'}</span>
          </div>
        </div>

        {/* Degradation */}
        <div className="fdp-section">
          <div className="fdp-section-title">
            <i className="ti ti-alert-triangle" />
            {t(activeLang, 'degradationStatus')}
          </div>
          <div
            className="fdp-degrad-badge"
            style={{ background: dm.bg, color: dm.color, borderColor: dm.border }}
          >
            <span className="fdp-dot" style={{ background: dm.color }} />
            <span>{degradLabel}</span>
            {avgNDVI !== null && (
              <span className="fdp-ndvi-tag">NDVI {avgNDVI.toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* AI Advice */}
        {field.advice && (
          <div className="fdp-section">
            <div className="fdp-section-title">
              <i className="ti ti-robot" />
              {t(activeLang, 'agriAdvice')}
            </div>
            <div className="fdp-advice-box">
              <i className="ti ti-bulb fdp-bulb" />
              <p>{field.advice}</p>
            </div>
          </div>
        )}

        {/* Coordinates */}
        {coords.length > 0 && (
          <div className="fdp-section">
            <div className="fdp-section-title">
              <i className="ti ti-location" />
              {t(activeLang, 'coordinates')}
            </div>
            <div className="fdp-coords-box">
              {coords.slice(0, 4).map(([lng, lat], i) => (
                <div key={i} className="fdp-coord-row">
                  <span className="fdp-coord-idx">{i + 1}</span>
                  <span className="fdp-coord-val">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                </div>
              ))}
              {coords.length > 5 && (
                <div className="fdp-coord-more">+{coords.length - 5}</div>
              )}
            </div>
          </div>
        )}

        {/* Google Maps */}
        {field.google_maps_url && (
          <a
            href={field.google_maps_url}
            target="_blank"
            rel="noreferrer"
            className="fdp-gmaps-link"
          >
            <i className="ti ti-map-2" />
            {t(activeLang, 'viewOnMaps')}
            <i className="ti ti-external-link fdp-ext-ico" />
          </a>
        )}

      </div>
    </div>
  )
}
