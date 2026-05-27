import { useState, useCallback, useEffect } from 'react'

const API = '/api/fields'

const MOCK_FIELDS = []

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
