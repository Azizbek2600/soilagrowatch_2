import { useState } from 'react'
import { t } from '../../i18n'
import './FieldListPanel.css'

export default function FieldListPanel({
  fields, loading, selectedId, lang,
  onSelect, onZoom, onDelete, onDraw, onUpload,
  open, onToggle,
}) {
  const [search,  setSearch]  = useState('')
  const [checked, setChecked] = useState(new Set())

  const filtered = fields.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggleCheck(id, e) {
    e.stopPropagation()
    setChecked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const DEGRAD_DOT = {
    "Yo'q": '#10B981', 'Past': '#10B981',
    "O'rtacha": '#F59E0B', 'Yuqori': '#EF4444',
    'Juda yuqori': '#EF4444',
    // computed keys
    'Yaxshi holat': '#10B981', 'Good condition': '#10B981',
    "O'rtacha": '#F59E0B', 'Average': '#F59E0B',
    'Yuqori degradatsiya': '#EF4444', 'High degradation': '#EF4444',
  }

  const activeLang = lang ?? 'uz'

  return (
    <>
      {/* Toggle pill */}
      <button
        className={`flp-toggle${open ? ' flp-toggle--open' : ''}`}
        onClick={onToggle}
        title={open ? t(activeLang, 'collapse') : t(activeLang, 'fields')}
      >
        <i className={`ti ${open ? 'ti-chevron-left' : 'ti-list'}`} />
      </button>

      {/* Panel */}
      <div className={`flp-panel${open ? ' flp-panel--open' : ''}`}>

        {/* Header */}
        <div className="flp-header">
          <div className="flp-header-left">
            <i className="ti ti-map-2 flp-header-icon" />
            <span className="flp-title">{t(activeLang, 'fields')}</span>
          </div>
          <span className="flp-count">{fields.length}</span>
        </div>

        {/* Search */}
        <div className="flp-search-wrap">
          <i className="ti ti-search flp-search-ico" />
          <input
            className="flp-search-inp"
            type="text"
            placeholder={t(activeLang, 'search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="flp-search-clr" onClick={() => setSearch('')}>
              <i className="ti ti-x" />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flp-action-row">
          <button className="flp-add-btn flp-add-btn--primary" onClick={onDraw}>
            <i className="ti ti-pencil" />
            {t(activeLang, 'newField')}
          </button>
          <button className="flp-add-btn flp-add-btn--upload" onClick={onUpload} title="Shapefile, GeoJSON, KML">
            <i className="ti ti-file-upload" />
            {t(activeLang, 'file')}
          </button>
        </div>

        {/* List */}
        <div className="flp-list">
          {loading && (
            <div className="flp-state">
              <div className="flp-spinner" />
              <span>{t(activeLang, 'loading')}</span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flp-state">
              <i className="ti ti-map-off flp-state-icon" />
              <span>{search ? t(activeLang, 'notFound') : t(activeLang, 'noFields')}</span>
              {!search && (
                <button className="flp-state-cta" onClick={onDraw}>
                  <i className="ti ti-plus" /> {t(activeLang, 'add')}
                </button>
              )}
            </div>
          )}

          {!loading && filtered.map(field => {
            const dot = DEGRAD_DOT[field.degradation] ?? '#9BA3AF'
            const isActive = selectedId === field.id
            return (
              <div
                key={field.id}
                className={`flp-item${isActive ? ' flp-item--active' : ''}`}
                onClick={() => onSelect(field)}
              >
                <input
                  type="checkbox"
                  className="flp-cb"
                  checked={checked.has(field.id)}
                  onChange={e => toggleCheck(field.id, e)}
                  onClick={e => e.stopPropagation()}
                />

                <div className="flp-item-body">
                  <div className="flp-item-row">
                    <span className="flp-item-name">{field.name}</span>
                    <span className="flp-degrad-dot" style={{ background: dot }} title={field.degradation ?? ''} />
                  </div>
                  <div className="flp-item-meta">
                    <i className="ti ti-rulers" />
                    {field.area_ha != null ? field.area_ha.toFixed(2) : '—'} ga
                    {field.created_at && (
                      <span className="flp-item-date">· {field.created_at}</span>
                    )}
                  </div>
                </div>

                <div className="flp-actions">
                  <button
                    className="flp-act-btn"
                    title={t(activeLang, 'viewOnMap')}
                    onClick={e => { e.stopPropagation(); onZoom(field) }}
                  >
                    <i className="ti ti-focus-2" />
                  </button>
                  <button
                    className="flp-act-btn flp-act-btn--del"
                    title={t(activeLang, 'delete')}
                    onClick={e => { e.stopPropagation(); onDelete(field.id) }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer stats */}
        {fields.length > 0 && !loading && (
          <div className="flp-footer">
            <span>
              {t(activeLang, 'totalArea')}:{' '}
              <strong>{fields.reduce((s, f) => s + (f.area_ha ?? 0), 0).toFixed(1)} ga</strong>
            </span>
            <span>{fields.length} {t(activeLang, 'field')}</span>
          </div>
        )}
      </div>
    </>
  )
}
