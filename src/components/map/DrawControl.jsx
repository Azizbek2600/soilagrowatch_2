/**
 * DrawControl — custom polygon drawer (Leaflet Draw ga bog'liq emas)
 *
 * Foydalanish:
 *   const ctrl = new DrawControl(map)
 *   ctrl.onVertexAdded = (count, areaHa) => ...
 *   ctrl.onComplete    = ({ geoJSON, area_ha }) => ...
 *   ctrl.enable()
 *   ctrl.completeShape()   // "Yakunlash" tugmasi
 *   ctrl.disable()         // bekor qilish
 */

import L from 'leaflet'
import 'leaflet-draw'  // L.GeometryUtil uchun

// ── Vertex icon HTML factory ──────────────
function vertexHTML(isFirst) {
  return isFirst
    ? '<div class="mpv mpv--first"></div>'
    : '<div class="mpv"></div>'
}

function makeIcon(isFirst = false, size = 20) {
  return new L.DivIcon({
    iconSize:   new L.Point(size, size),
    iconAnchor: new L.Point(size / 2, size / 2),
    className:  '',
    html:       vertexHTML(isFirst),
  })
}

// ── Main class ────────────────────────────
export default class DrawControl {
  constructor(map) {
    this._map     = map
    this._active  = false
    this._verts   = []    // L.LatLng[]
    this._markers = []    // L.Marker[]
    this._line    = null  // preview polyline
    this._fill    = null  // preview polygon fill
    this._guide   = null  // dashed guide to cursor

    // callbacks (set before enable())
    this.onVertexAdded = null   // (count: number, area_ha: number) => void
    this.onComplete    = null   // ({ geoJSON, area_ha }) => void

    this._click    = this._onClick.bind(this)
    this._move     = this._onMouseMove.bind(this)
    this._dblclick = (e) => L.DomEvent.stop(e)  // prevent accidental finish on dblclick
  }

  // ── Public API ────────────────────────────
  enable() {
    if (this._active) return
    this._active = true
    this._map.on('click',    this._click)
    this._map.on('mousemove', this._move)
    this._map.on('dblclick', this._dblclick)  // block leaflet default dblclick-zoom
    this._map.getContainer().classList.add('mp-draw-cursor')
  }

  disable() {
    if (!this._active) return
    this._active = false
    this._map.off('click',    this._click)
    this._map.off('mousemove', this._move)
    this._map.off('dblclick', this._dblclick)
    this._map.getContainer().classList.remove('mp-draw-cursor')
    this._clearAll()
  }

  /** Programmatic finish ("Yakunlash" tugmasi) */
  completeShape() {
    if (this._verts.length < 3) return
    this._finish()
  }

  get vertexCount() { return this._verts.length }

  // ── Private ───────────────────────────────
  _onClick(e) {
    // Birinchi nuqtaga 20px ichida → polygon yopiladi
    if (this._verts.length >= 3) {
      const fp = this._map.latLngToContainerPoint(this._verts[0])
      const cp = this._map.latLngToContainerPoint(e.latlng)
      if (Math.hypot(cp.x - fp.x, cp.y - fp.y) <= 20) {
        this._finish()
        return
      }
    }
    this._addVertex(e.latlng)
  }

  _onMouseMove(e) {
    if (this._verts.length === 0) return
    this._drawGuide(e.latlng)
  }

  _addVertex(latlng) {
    const isFirst = this._verts.length === 0
    this._verts.push(latlng)

    const m = L.marker(latlng, {
      icon:          makeIcon(isFirst),
      interactive:   false,
      zIndexOffset:  500,
      pane:          'markerPane',
    })
    m.addTo(this._map)
    this._markers.push(m)

    this._drawPreview()

    const area = this._calcArea()
    if (this.onVertexAdded) this.onVertexAdded(this._verts.length, area)
  }

  _drawPreview() {
    this._remove(this._line)
    this._remove(this._fill)

    if (this._verts.length >= 2) {
      this._line = L.polyline(this._verts, {
        color: '#F59E0B', weight: 3, opacity: 0.92,
        interactive: false,
      }).addTo(this._map)
    }

    if (this._verts.length >= 3) {
      this._fill = L.polygon(this._verts, {
        color:       '#F59E0B',
        fillColor:   '#F59E0B',
        fillOpacity: 0.14,
        weight:      0,
        interactive: false,
      }).addTo(this._map)
    }
  }

  _drawGuide(cursor) {
    this._remove(this._guide)
    const last = this._verts[this._verts.length - 1]
    this._guide = L.polyline([last, cursor], {
      color:     '#F59E0B',
      weight:    2,
      opacity:   0.5,
      dashArray: '7 9',
      interactive: false,
    }).addTo(this._map)
  }

  _calcArea() {
    if (this._verts.length < 3) return 0
    try { return L.GeometryUtil.geodesicArea(this._verts) / 10000 }
    catch { return 0 }
  }

  _finish() {
    const verts  = [...this._verts]
    const area   = this._calcArea()
    const geoJSON = L.polygon(verts).toGeoJSON()
    this.disable()
    if (this.onComplete) this.onComplete({ geoJSON, area_ha: area })
  }

  _remove(layer) {
    if (layer) try { this._map.removeLayer(layer) } catch {}
  }

  _clearAll() {
    this._remove(this._line);  this._line  = null
    this._remove(this._fill);  this._fill  = null
    this._remove(this._guide); this._guide = null
    this._markers.forEach(m => this._remove(m))
    this._markers = []
    this._verts   = []
  }
}
