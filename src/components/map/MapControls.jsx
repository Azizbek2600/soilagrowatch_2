import { useState } from 'react'
import { t } from '../../i18n'
import './MapControls.css'

export default function MapControls({ mapRef, basemap, onBasemapChange, overlays, onOverlayChange, rightOffset = 18, lang }) {
  const [layersOpen,  setLayersOpen]  = useState(false)
  const [basemapOpen, setBasemapOpen] = useState(false)
  const L = lang ?? 'uz'

  const BASEMAPS = [
    { id: 'satellite', labelKey: 'satellite', icon: 'ti-satellite'    },
    { id: 'street',    labelKey: 'street',    icon: 'ti-map-2'        },
    { id: 'terrain',   labelKey: 'terrain',   icon: 'ti-mountain'     },
  ]

  function handleGeolocate() {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => {}
    )
  }

  return (
    <div className="mc-root" style={{ right: rightOffset }}>

      {/* Zoom */}
      <div className="mc-group">
        <button className="mc-btn" onClick={() => mapRef.current?.zoomIn()}  title={t(L, 'zoomIn')}>
          <i className="ti ti-plus" />
        </button>
        <div className="mc-divider" />
        <button className="mc-btn" onClick={() => mapRef.current?.zoomOut()} title={t(L, 'zoomOut')}>
          <i className="ti ti-minus" />
        </button>
      </div>

      {/* Geolocation */}
      <div className="mc-group">
        <button className="mc-btn" onClick={handleGeolocate} title={t(L, 'myLocation')}>
          <i className="ti ti-current-location" />
        </button>
      </div>

      {/* Basemap switcher */}
      <div className="mc-group mc-popover-wrap">
        <button
          className={`mc-btn${basemapOpen ? ' mc-btn--active' : ''}`}
          onClick={() => { setBasemapOpen(o => !o); setLayersOpen(false) }}
          title={t(L, 'mapType')}
        >
          <i className="ti ti-layers-intersect" />
        </button>
        {basemapOpen && (
          <div className="mc-popover mc-popover--left">
            <div className="mc-pop-title">{t(L, 'mapType')}</div>
            {BASEMAPS.map(b => (
              <button
                key={b.id}
                className={`mc-pop-item${basemap === b.id ? ' mc-pop-item--active' : ''}`}
                onClick={() => { onBasemapChange(b.id); setBasemapOpen(false) }}
              >
                <i className={`ti ${b.icon}`} />
                {t(L, b.labelKey)}
                {basemap === b.id && <i className="ti ti-check mc-check" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layers toggle */}
      <div className="mc-group mc-popover-wrap">
        <button
          className={`mc-btn${layersOpen ? ' mc-btn--active' : ''}`}
          onClick={() => { setLayersOpen(o => !o); setBasemapOpen(false) }}
          title={t(L, 'layersLabel')}
        >
          <i className="ti ti-stack-2" />
        </button>
        {layersOpen && (
          <div className="mc-popover mc-popover--left">
            <div className="mc-pop-title">{t(L, 'layersLabel')}</div>
            <button
              className={`mc-pop-item${overlays.degradation ? ' mc-pop-item--on' : ''}`}
              onClick={() => onOverlayChange(o => ({ ...o, degradation: !o.degradation }))}
            >
              <i className="ti ti-layers-difference" />
              {t(L, 'degradation')}
              <div className={`mc-toggle-pill${overlays.degradation ? ' mc-toggle-pill--on' : ''}`}>
                {overlays.degradation ? t(L, 'on') : t(L, 'off')}
              </div>
            </button>
            <button
              className={`mc-pop-item${overlays.ndvi ? ' mc-pop-item--on' : ''}`}
              onClick={() => onOverlayChange(o => ({ ...o, ndvi: !o.ndvi }))}
            >
              <i className="ti ti-leaf" />
              {t(L, 'ndviLabel')}
              <div className={`mc-toggle-pill${overlays.ndvi ? ' mc-toggle-pill--on' : ''}`}>
                {overlays.ndvi ? t(L, 'on') : t(L, 'off')}
              </div>
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
