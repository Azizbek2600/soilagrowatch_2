import './FieldDetailsPanel.css'

const DEGRAD_META = {
  "Yo'q":         { color: '#10B981', bg: '#D1FAE5', border: '#A7F3D0' },
  'Past':         { color: '#10B981', bg: '#D1FAE5', border: '#A7F3D0' },
  "O'rtacha":     { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  'Yuqori':       { color: '#EF4444', bg: '#FEE2E2', border: '#FECACA' },
  'Juda yuqori':  { color: '#EF4444', bg: '#FEE2E2', border: '#FECACA' },
}

export default function FieldDetailsPanel({ field, onClose }) {
  if (!field) return null

  const dm = DEGRAD_META[field.degradation] ?? { color: '#9BA3AF', bg: '#F3F4F6', border: '#E4E7EC' }

  const coords = field.geojson?.geometry?.coordinates?.[0] ?? []

  return (
    <div className="fdp-panel fdp-panel--open">

      {/* Header */}
      <div className="fdp-header">
        <div className="fdp-header-left">
          <i className="ti ti-map-pin fdp-hdr-icon" />
          <span className="fdp-title" title={field.name}>{field.name}</span>
        </div>
        <button className="fdp-close" onClick={onClose} title="Yopish">
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Body */}
      <div className="fdp-body">

        {/* Stats grid */}
        <div className="fdp-stats">
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">Maydon</span>
            <span className="fdp-stat-val">{field.area_ha != null ? field.area_ha.toFixed(2) : '—'} ga</span>
          </div>
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">m²</span>
            <span className="fdp-stat-val">
              {field.area_ha != null ? Math.round(field.area_ha * 10000).toLocaleString() : '—'}
            </span>
          </div>
          <div className="fdp-stat">
            <span className="fdp-stat-lbl">Sana</span>
            <span className="fdp-stat-val">{field.created_at ?? '—'}</span>
          </div>
        </div>

        {/* Degradation */}
        <div className="fdp-section">
          <div className="fdp-section-title">
            <i className="ti ti-alert-triangle" />
            Degradatsiya holati
          </div>
          <div
            className="fdp-degrad-badge"
            style={{ background: dm.bg, color: dm.color, borderColor: dm.border }}
          >
            <span className="fdp-dot" style={{ background: dm.color }} />
            {field.degradation ?? "Ma'lumot yo'q"}
          </div>
        </div>

        {/* AI Advice */}
        {field.advice && (
          <div className="fdp-section">
            <div className="fdp-section-title">
              <i className="ti ti-robot" />
              Agro-maslahat (AI)
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
              Koordinatalar
            </div>
            <div className="fdp-coords-box">
              {coords.slice(0, 4).map(([lng, lat], i) => (
                <div key={i} className="fdp-coord-row">
                  <span className="fdp-coord-idx">{i + 1}</span>
                  <span className="fdp-coord-val">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                </div>
              ))}
              {coords.length > 5 && (
                <div className="fdp-coord-more">+{coords.length - 5} ta nuqta</div>
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
            Google Maps'da ko'rish
            <i className="ti ti-external-link fdp-ext-ico" />
          </a>
        )}

      </div>
    </div>
  )
}
