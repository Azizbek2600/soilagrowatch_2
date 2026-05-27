import { useState, useCallback, useEffect } from 'react'

const API = '/api/fields'

const MOCK_FIELDS = [
  {
    id: 1,
    name: "Shimoliy dala #1",
    area_ha: 14.2,
    geojson: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[60.07,42.860],[60.095,42.860],[60.095,42.872],[60.07,42.872],[60.07,42.860]]],
      },
      properties: {},
    },
    degradation: "O'rtacha",
    advice: "Sug'orish me'yorini optimallashtiring. Azot o'g'itlarini qo'shing. Muntazam monitoring o'tkazing.",
    google_maps_url: "https://maps.google.com/?q=42.866,60.0825",
    created_at: "2024-03-15",
  },
  {
    id: 2,
    name: "Janubiy dala #2",
    area_ha: 8.7,
    geojson: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[60.050,42.838],[60.072,42.838],[60.072,42.852],[60.050,42.852],[60.050,42.838]]],
      },
      properties: {},
    },
    degradation: "Past",
    advice: "Dala yaxshi holda. Muntazam monitoring davom etsin. Organik o'g'itlarni har yili qo'llashni davom ettiring.",
    google_maps_url: "https://maps.google.com/?q=42.845,60.061",
    created_at: "2024-04-10",
  },
  {
    id: 3,
    name: "G'arbiy maydon",
    area_ha: 22.1,
    geojson: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[60.020,42.855],[60.045,42.855],[60.045,42.875],[60.020,42.875],[60.020,42.855]]],
      },
      properties: {},
    },
    degradation: "Yuqori",
    advice: "Zudlik bilan desalinizatsiya tadbirlari o'tkazing. Drenaj tizimini yaxshilang. Gipsni tuproqqa qo'llash tavsiya etiladi.",
    google_maps_url: "https://maps.google.com/?q=42.865,60.0325",
    created_at: "2024-02-28",
  },
]

export function useFields() {
  const [fields,  setFields]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetchFields = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(API, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFields(Array.isArray(data) ? data : (data.fields ?? []))
    } catch {
      setFields(MOCK_FIELDS)
    } finally {
      setLoading(false)
    }
  }, [])

  const addField = useCallback(async (fieldData) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldData),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const saved = await res.json()
      setFields(prev => [...prev, saved])
      return saved
    } catch {
      const local = { ...fieldData, id: Date.now() }
      setFields(prev => [...prev, local])
      return local
    }
  }, [])

  const deleteField = useCallback(async (id) => {
    setFields(prev => prev.filter(f => f.id !== id))
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' })
    } catch { /* already removed from UI */ }
  }, [])

  const updateField = useCallback(async (id, data) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...data } : f))
    try {
      await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch { /* UI already updated */ }
  }, [])

  useEffect(() => { fetchFields() }, [fetchFields])

  return { fields, loading, error, fetchFields, addField, deleteField, updateField }
}
