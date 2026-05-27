import { useState } from 'react'
import './Sidebar.css'

const TOOLTIPS = {
  ndvi:  "Vegetatsiya indeksi. 0 dan 1 gacha. Yuqori = zich o'simlik, past = quruq yer.",
  ndwi:  "Namlik indeksi. Manfiy = quruq, musbat = suv/nam.",
  si:    "Sho'rlanish indeksi. Yuqori = ko'p tuz, past = sog'lom tuproq.",
  bsi:   "Yalang'och tuproq indeksi. Yuqori = o'simlik yo'q, past = qoplangan.",
  ndre:  "Qizil chegara indeksi. O'simlik sog'lig'ini aniq o'lchaydi.",
  msavi: "Tuproq ta'sirini kamaytiruvchi vegetatsiya indeksi.",
  smi:   "Tuproq namligi indeksi. Yuqori = nam, past = quruq.",
}

const TUPROQ_INDICES = [
  { id: 'umumiy', label: 'Umumiy', icon: 'ti-chart-area'           },
  { id: 'ndvi',   label: 'NDVI',   icon: 'ti-leaf'                 },
  { id: 'ndwi',   label: 'NDWI',   icon: 'ti-droplet'              },
  { id: 'si',     label: 'SI',     icon: 'ti-wave-sine'            },
  { id: 'bsi',    label: 'BSI',    icon: 'ti-mountain'             },
  { id: 'ndre',   label: 'NDRE',   icon: 'ti-heart-rate-monitor',  badge: 'GEE' },
  { id: 'msavi',  label: 'MSAVI',  icon: 'ti-layers-difference',   badge: 'GEE' },
  { id: 'smi',    label: 'SMI',    icon: 'ti-droplets',            badge: 'GEE' },
]

const NAV_TOP = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { id: 'xarita',    label: 'Xarita',    icon: 'ti-map', badge: 'Faol' },
]

const NAV_TOOLS = [
  { id: 'dala',         label: 'Dala chizish',     icon: 'ti-pencil'      },
  { id: 'ai-detect',    label: 'AI aniqlash',       icon: 'ti-sparkles',   badge: 'AI'   },
  { id: 'fayl-yuklash', label: 'Fayl yuklash',     icon: 'ti-file-upload' },
  { id: 'laboratoriya', label: 'Laboratoriya',     icon: 'ti-flask'       },
  { id: 'obhavo',       label: 'Ob-havo',           icon: 'ti-cloud'       },
  { id: 'ai-chat',      label: 'AI Chat',           icon: 'ti-robot',      badge: 'Beta' },
]

const BOTTOM = [
  { id: 'sozlamalar', label: 'Sozlamalar', icon: 'ti-settings' },
  { id: 'profil',     label: 'Profil',     icon: 'ti-user'     },
]

export default function Sidebar({ activeTab, onTabChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const isSubActive = TUPROQ_INDICES.some(i => i.id === activeTab)
  const [dropOpen, setDropOpen] = useState(() => isSubActive)
  const [tip, setTip] = useState({ visible: false, text: '', x: 0, y: 0 })

  function showTip(e, text) {
    const rect = e.currentTarget.getBoundingClientRect()
    setTip({ visible: true, text, x: rect.right + 10, y: rect.top + rect.height / 2 })
  }

  function hideTip() {
    setTip(s => ({ ...s, visible: false }))
  }

  function handleSubItem(id) {
    onTabChange(id)
    if (!dropOpen) setDropOpen(true)
  }

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>

      {/* ── Logo / collapse ── */}
      <div className="sb-logo">
        {!collapsed && (
          <span className="sb-logo-text">
            <span className="sb-logo-green">Soil</span>AgroWatch
          </span>
        )}
        <button
          className="sb-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Kengaytirish' : "Yig'ish"}
        >
          <i className={`ti ${collapsed ? 'ti-chevron-right' : 'ti-chevron-left'}`} />
        </button>
      </div>

      {/* ── Main nav ── */}
      <nav className="sb-nav">

        {/* ASOSIY */}
        {!collapsed && <div className="sb-group-title">ASOSIY</div>}
        {NAV_TOP.map(item => (
          <button
            key={item.id}
            className={`sb-item${activeTab === item.id ? ' sb-item--active' : ''}`}
            onClick={() => onTabChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <i className={`ti ${item.icon} sb-item-icon`} />
            {!collapsed && (
              <>
                <span className="sb-item-label">{item.label}</span>
                {item.badge && <span className="sb-badge">{item.badge}</span>}
              </>
            )}
          </button>
        ))}

        {/* TUPROQ TAHLILI — DROPDOWN */}
        {!collapsed && <div className="sb-group-title" style={{ marginTop: 6 }}>TAHLIL</div>}

        {/* Dropdown trigger */}
        <button
          className={`sb-item sb-dropdown-trigger${isSubActive ? ' sb-item--active' : ''}`}
          onClick={() => collapsed ? onTabChange('umumiy') : setDropOpen(o => !o)}
          title={collapsed ? 'Tuproq tahlili' : undefined}
        >
          <i className="ti ti-layers-intersect sb-item-icon" />
          {!collapsed && (
            <>
              <span className="sb-item-label">Tuproq tahlili</span>
              <i className={`ti ti-chevron-down sb-drop-chevron${dropOpen ? ' sb-drop-chevron--open' : ''}`} />
            </>
          )}
        </button>

        {/* Sub-items */}
        {!collapsed && (
          <div className={`sb-sub-list${dropOpen ? ' sb-sub-list--open' : ''}`}>
            {TUPROQ_INDICES.map(item => (
              <button
                key={item.id}
                className={`sb-sub-item${activeTab === item.id ? ' sb-sub-item--active' : ''}`}
                onClick={() => handleSubItem(item.id)}
              >
                <i className={`ti ${item.icon} sb-item-icon`} />
                <span className="sb-item-label">{item.label}</span>
                {TOOLTIPS[item.id] && (
                  <span
                    className="sb-tip-wrap"
                    onClick={e => e.stopPropagation()}
                    onMouseEnter={e => showTip(e, TOOLTIPS[item.id])}
                    onMouseLeave={hideTip}
                  >
                    <i className="ti ti-info-circle sb-tip-icon" />
                  </span>
                )}
                {item.badge && (
                  <span className="sb-badge sb-badge--gee">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* VOSITALAR */}
        {!collapsed && <div className="sb-group-title" style={{ marginTop: 6 }}>VOSITALAR</div>}
        {NAV_TOOLS.map(item => (
          <button
            key={item.id}
            className={`sb-item${activeTab === item.id ? ' sb-item--active' : ''}`}
            onClick={() => onTabChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <i className={`ti ${item.icon} sb-item-icon`} />
            {!collapsed && (
              <>
                <span className="sb-item-label">{item.label}</span>
                {item.badge && <span className="sb-badge">{item.badge}</span>}
              </>
            )}
          </button>
        ))}

      </nav>

      {/* ── Bottom actions ── */}
      <div className="sb-bottom">
        {BOTTOM.map(item => (
          <button
            key={item.id}
            className={`sb-item${activeTab === item.id ? ' sb-item--active' : ''}`}
            onClick={() => onTabChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <i className={`ti ${item.icon} sb-item-icon`} />
            {!collapsed && <span className="sb-item-label">{item.label}</span>}
          </button>
        ))}
      </div>

      {/* ── Fixed tooltip (overflow-dan chiqib ketmaslik uchun) ── */}
      {tip.visible && (
        <div
          className="sb-tip-fixed"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}

    </aside>
  )
}
