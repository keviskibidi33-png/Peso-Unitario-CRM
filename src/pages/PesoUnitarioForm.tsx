import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Download, Loader2, Scale, Trash2 } from 'lucide-react'
import { getPesoUnitarioEnsayoDetail, saveAndDownloadPesoUnitarioExcel, savePesoUnitarioEnsayo } from '@/services/api'
import type { PesoUnitarioPayload } from '@/types'

const DRAFT_KEY = 'peso_unitario_form_draft_v1'
const DEBOUNCE_MS = 700
const REVISORES = ['-', 'FABIAN LA ROSA'] as const
const APROBADORES = ['-', 'IRMA COAQUIRA'] as const
const empty3 = () => [null, null, null] as Array<number | null>

const EQUIPO_OPTIONS = {
  equipo_molde_codigo: ['-', 'INS-0005 (MOLDE 1)', 'INS-0004 (MOLDE 2)', 'INS-0003 (MOLDE 3)', 'INS-0135 (MOLDE 4)'],
  equipo_balanza_codigo: ['-', 'EQP-0054 (MOLDE 1-2)', 'EQP-0059 (MOLDE 3-4)'],
  equipo_varilla_codigo: ['-', 'INS-0132'],
  equipo_horno_codigo: ['-', 'EQP-0049'],
} as const

const withCurrentOption = (value: string | null | undefined, base: readonly string[]) => {
  const current = (value ?? '').trim()
  if (!current || base.includes(current)) return base
  return [...base, current]
}

type TripleFieldKey =
  | 'prueba_d_masa_agregado_mas_medida_kg'
  | 'prueba_e_masa_agregado_kg'
  | 'prueba_f_densidad_aparente_kg_m3'
  | 'vacios_i_gravedad_especifica_base_seca'
  | 'vacios_j_densidad_agua_kg_m3'
  | 'vacios_k_porcentaje'

const parseNum = (v: string) => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const shortYear = () => new Date().getFullYear().toString().slice(-2)
const formatTodayShortDate = () => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

const normalizeMuestraCode = (raw: string): string => {
  const value = raw.trim().toUpperCase()
  if (!value) return ''
  const compact = value.replace(/\s+/g, '')
  const match = compact.match(/^(\d+)(?:-SU)?(?:-(\d{2}))?$/)
  return match ? `${match[1]}-SU-${match[2] || shortYear()}` : value
}

const normalizeNumeroOtCode = (raw: string): string => {
  const value = raw.trim().toUpperCase()
  if (!value) return ''
  const compact = value.replace(/\s+/g, '')
  const patterns = [/^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/, /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/]
  for (const pattern of patterns) {
    const m = compact.match(pattern)
    if (m) return `${m[1]}-${m[2] || shortYear()}`
  }
  return value
}

const normalizeFlexibleDate = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  const yy = shortYear()
  const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
  const build = (d: string, m: string, y: string = yy) => `${pad2(d)}/${pad2(m)}/${pad2(y)}`
  if (value.includes('/')) {
    const [d = '', m = '', yRaw = ''] = value.split('/').map((p) => p.trim())
    if (!d || !m) return value
    let y = yRaw.replace(/\D/g, '')
    if (y.length === 4) y = y.slice(-2)
    if (y.length === 1) y = `0${y}`
    return build(d, m, y || yy)
  }
  if (digits.length === 4) return build(digits.slice(0, 2), digits.slice(2, 4))
  if (digits.length === 6) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6))
  return value
}

const getEnsayoId = () => {
  const raw = new URLSearchParams(window.location.search).get('ensayo_id')
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

const initialState = (): PesoUnitarioPayload => ({
  muestra: '',
  numero_ot: '',
  fecha_ensayo: formatTodayShortDate(),
  realizado_por: '',
  recipiente_molde_numero: '',
  recipiente_masa_medida_kg: null,
  recipiente_volumen_m3: null,
  metodo_compactacion: '-',
  tipo_muestra: '',
  tamano_maximo_nominal_visual_in: '',
  masa_agregado_g: null,
  masa_agregado_seco_g: null,
  masa_agregado_seco_constante_g: null,
  prueba_d_masa_agregado_mas_medida_kg: empty3(),
  prueba_e_masa_agregado_kg: empty3(),
  prueba_f_densidad_aparente_kg_m3: empty3(),
  densidad_aparente_promedio_kg_m3: null,
  vacios_i_gravedad_especifica_base_seca: empty3(),
  vacios_j_densidad_agua_kg_m3: empty3(),
  vacios_k_porcentaje: empty3(),
  vacios_promedio_pct: null,
  equipo_molde_codigo: '-',
  equipo_balanza_codigo: '-',
  equipo_varilla_codigo: '-',
  equipo_horno_codigo: '-',
  observaciones: '',
  revisado_por: '-',
  revisado_fecha: formatTodayShortDate(),
  aprobado_por: '-',
  aprobado_fecha: formatTodayShortDate(),
})

function avg(values: Array<number | null>): number | null {
  const arr = values.filter((v): v is number => v !== null)
  return arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4)) : null
}

function preparePayload(payload: PesoUnitarioPayload): PesoUnitarioPayload {
  const next: PesoUnitarioPayload = {
    ...payload,
    prueba_d_masa_agregado_mas_medida_kg: [...payload.prueba_d_masa_agregado_mas_medida_kg],
    prueba_e_masa_agregado_kg: [...payload.prueba_e_masa_agregado_kg],
    prueba_f_densidad_aparente_kg_m3: [...payload.prueba_f_densidad_aparente_kg_m3],
    vacios_i_gravedad_especifica_base_seca: [...payload.vacios_i_gravedad_especifica_base_seca],
    vacios_j_densidad_agua_kg_m3: [...payload.vacios_j_densidad_agua_kg_m3],
    vacios_k_porcentaje: [...payload.vacios_k_porcentaje],
  }

  for (let i = 0; i < 3; i += 1) {
    const d = next.prueba_d_masa_agregado_mas_medida_kg[i]
    if (next.prueba_e_masa_agregado_kg[i] == null && d != null && next.recipiente_masa_medida_kg != null) {
      next.prueba_e_masa_agregado_kg[i] = Number((d - next.recipiente_masa_medida_kg).toFixed(4))
    }

    const e = next.prueba_e_masa_agregado_kg[i]
    if (next.prueba_f_densidad_aparente_kg_m3[i] == null && e != null && next.recipiente_volumen_m3) {
      next.prueba_f_densidad_aparente_kg_m3[i] = Number((e / next.recipiente_volumen_m3).toFixed(4))
    }

    const iVal = next.vacios_i_gravedad_especifica_base_seca[i]
    const jVal = next.vacios_j_densidad_agua_kg_m3[i]
    const fVal = next.prueba_f_densidad_aparente_kg_m3[i]
    if (next.vacios_k_porcentaje[i] == null && iVal != null && jVal != null && fVal != null && iVal * jVal !== 0) {
      next.vacios_k_porcentaje[i] = Number((100 * ((iVal * jVal - fVal) / (iVal * jVal))).toFixed(4))
    }
  }

  if (next.densidad_aparente_promedio_kg_m3 == null) next.densidad_aparente_promedio_kg_m3 = avg(next.prueba_f_densidad_aparente_kg_m3)
  if (next.vacios_promedio_pct == null) next.vacios_promedio_pct = avg(next.vacios_k_porcentaje)
  return next
}

const inputClass = 'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35'

export default function PesoUnitarioForm() {
  const [form, setForm] = useState<PesoUnitarioPayload>(() => initialState())
  const [loading, setLoading] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [ensayoId, setEnsayoId] = useState<number | null>(() => getEnsayoId())

  useEffect(() => {
    const raw = localStorage.getItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
    if (!raw) return
    try { setForm({ ...initialState(), ...JSON.parse(raw) }) } catch {}
  }, [ensayoId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      localStorage.setItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`, JSON.stringify(form))
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [form, ensayoId])

  useEffect(() => {
    if (!ensayoId) return
    let cancel = false
    const run = async () => {
      setLoadingEdit(true)
      try {
        const detail = await getPesoUnitarioEnsayoDetail(ensayoId)
        if (!cancel && detail.payload) setForm({ ...initialState(), ...detail.payload })
      } catch {
        toast.error('No se pudo cargar ensayo de Peso Unitario.')
      } finally {
        if (!cancel) setLoadingEdit(false)
      }
    }
    void run()
    return () => { cancel = true }
  }, [ensayoId])

  const payload = useMemo(() => preparePayload(form), [form])

  const setField = useCallback(<K extends keyof PesoUnitarioPayload>(key: K, value: PesoUnitarioPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setTriple = useCallback((key: TripleFieldKey, idx: number, raw: string) => {
    setForm((prev) => {
      const next = [...prev[key]]
      next[idx] = parseNum(raw)
      return { ...prev, [key]: next }
    })
  }, [])

  const clearAll = useCallback(() => {
    if (!window.confirm('Se limpiaran los datos no guardados. Deseas continuar?')) return
    localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
    setForm(initialState())
  }, [ensayoId])

  const save = useCallback(async (download: boolean) => {
    if (!form.muestra || !form.numero_ot || !form.fecha_ensayo || !form.realizado_por) {
      toast.error('Complete Muestra, N OT, Fecha de Ensayo y Realizado por.')
      return
    }
    setLoading(true)
    try {
      const p = preparePayload(form)
      if (download) {
        const { blob } = await saveAndDownloadPesoUnitarioExcel(p, ensayoId ?? undefined)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `PESO_UNITARIO_${form.numero_ot}_${new Date().toISOString().slice(0, 10)}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        await savePesoUnitarioEnsayo(p, ensayoId ?? undefined)
      }
      localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
      setForm(initialState())
      setEnsayoId(null)
      if (window.parent !== window) window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
      toast.success(download ? 'Peso Unitario guardado y descargado.' : 'Peso Unitario guardado.')
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail || 'No se pudo generar Peso Unitario.' : 'No se pudo generar Peso Unitario.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [ensayoId, form])

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1280px] space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50"><Scale className="h-5 w-5 text-slate-900" /></div>
          <div><h1 className="text-base font-semibold text-slate-900 md:text-lg">PESO UNITARIO - ASTM C29/C29M-23</h1><p className="text-xs text-slate-600">Replica del formato Excel oficial</p></div>
        </div>

        {loadingEdit ? <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm"><Loader2 className="h-4 w-4 animate-spin" />Cargando ensayo...</div> : null}

        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-300 bg-white px-3 py-3">
            <table className="w-full table-fixed border border-slate-300 text-sm">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-800"><tr><th className="border-r border-slate-300 py-1">MUESTRA</th><th className="border-r border-slate-300 py-1">N° OT</th><th className="border-r border-slate-300 py-1">FECHA DE ENSAYO</th><th className="py-1">REALIZADO</th></tr></thead>
              <tbody><tr>
                <td className="border-r border-t border-slate-300 p-1"><input className={inputClass} value={form.muestra} onChange={(e) => setField('muestra', e.target.value)} onBlur={() => setField('muestra', normalizeMuestraCode(form.muestra))} autoComplete="off" data-lpignore="true" /></td>
                <td className="border-r border-t border-slate-300 p-1"><input className={inputClass} value={form.numero_ot} onChange={(e) => setField('numero_ot', e.target.value)} onBlur={() => setField('numero_ot', normalizeNumeroOtCode(form.numero_ot))} autoComplete="off" data-lpignore="true" /></td>
                <td className="border-r border-t border-slate-300 p-1"><input className={inputClass} value={form.fecha_ensayo} onChange={(e) => setField('fecha_ensayo', e.target.value)} onBlur={() => setField('fecha_ensayo', normalizeFlexibleDate(form.fecha_ensayo))} autoComplete="off" data-lpignore="true" placeholder="DD/MM/AA" /></td>
                <td className="border-t border-slate-300 p-1"><input className={inputClass} value={form.realizado_por} onChange={(e) => setField('realizado_por', e.target.value)} autoComplete="off" data-lpignore="true" /></td>
              </tr></tbody>
            </table>
          </div>

          <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-center">
            <p className="text-2xl font-semibold leading-tight text-slate-900">Standard Test Method for Bulk Density (Unit Weight) and Voids in Aggregate</p>
            <p className="text-2xl font-semibold text-slate-900">ASTM C29/C29M-23</p>
          </div>

          <div className="space-y-3 p-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <table className="w-full text-sm"><tbody>
                  <tr><td className="w-8 border-b border-r border-slate-300 px-2 py-1 text-center">a</td><td className="border-b border-r border-slate-300 px-2 py-1">Molde</td><td className="w-48 border-b border-slate-300 p-1"><input className={inputClass} value={form.recipiente_molde_numero ?? ''} onChange={(e) => setField('recipiente_molde_numero', e.target.value)} /></td></tr>
                  <tr><td className="border-b border-r border-slate-300 px-2 py-1 text-center">b</td><td className="border-b border-r border-slate-300 px-2 py-1">Masa de medida (kg)</td><td className="border-b border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.recipiente_masa_medida_kg ?? ''} onChange={(e) => setField('recipiente_masa_medida_kg', parseNum(e.target.value))} /></td></tr>
                  <tr><td className="border-r border-slate-300 px-2 py-1 text-center">c</td><td className="border-r border-slate-300 px-2 py-1">Volumen de la medida (m³)</td><td className="p-1"><input type="number" step="any" className={inputClass} value={form.recipiente_volumen_m3 ?? ''} onChange={(e) => setField('recipiente_volumen_m3', parseNum(e.target.value))} /></td></tr>
                </tbody></table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-300"><table className="w-full text-sm"><tbody>
                {(['A', 'B', 'C'] as const).map((m, idx) => (
                  <tr key={m}><td className="border-b border-slate-300 px-2 py-1"><button type="button" className={`flex h-8 w-full items-center justify-between rounded-md border px-2 text-xs font-semibold ${form.metodo_compactacion === m ? 'border-slate-700 bg-slate-200 text-slate-900' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => setField('metodo_compactacion', form.metodo_compactacion === m ? '-' : m)}><span>{m}: {idx === 0 ? 'Varillado' : idx === 1 ? 'Percusion' : 'Suelto'}</span><span>{form.metodo_compactacion === m ? 'X' : ''}</span></button></td></tr>
                ))}
              </tbody></table></div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="w-64 border-b border-r border-slate-300 px-2 py-1">Tipo de muestra</td>
                    <td className="border-b border-r border-slate-300 p-1"><input className={inputClass} value={form.tipo_muestra ?? ''} onChange={(e) => setField('tipo_muestra', e.target.value)} /></td>
                    <td className="w-64 border-b border-r border-slate-300 px-2 py-1">Masa del agregado (g)</td>
                    <td className="border-b border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.masa_agregado_g ?? ''} onChange={(e) => setField('masa_agregado_g', parseNum(e.target.value))} /></td>
                  </tr>
                  <tr>
                    <td className="border-b border-r border-slate-300 px-2 py-1">Tamaño maximo nominal agregado (visual) (in)</td>
                    <td className="border-b border-r border-slate-300 p-1"><input className={inputClass} value={form.tamano_maximo_nominal_visual_in ?? ''} onChange={(e) => setField('tamano_maximo_nominal_visual_in', e.target.value)} /></td>
                    <td className="border-b border-r border-slate-300 px-2 py-1">Masa del agregado seco (g)</td>
                    <td className="border-b border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.masa_agregado_seco_g ?? ''} onChange={(e) => setField('masa_agregado_seco_g', parseNum(e.target.value))} /></td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-300 px-2 py-1"></td>
                    <td className="border-r border-slate-300 p-1"></td>
                    <td className="border-r border-slate-300 px-2 py-1">Masa del agregado seco constante (g)</td>
                    <td className="p-1"><input type="number" step="any" className={inputClass} value={form.masa_agregado_seco_constante_g ?? ''} onChange={(e) => setField('masa_agregado_seco_constante_g', parseNum(e.target.value))} /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-800"><tr><th className="border-b border-r border-slate-300 px-2 py-1 text-left" colSpan={2}>Peso Unitario</th><th className="w-28 border-b border-r border-slate-300 py-1">1</th><th className="w-28 border-b border-r border-slate-300 py-1">2</th><th className="w-28 border-b border-r border-slate-300 py-1">3</th><th className="w-16 border-b border-slate-300 py-1">Und.</th></tr></thead>
                <tbody>
                  <tr><td className="w-8 border-t border-r border-slate-300 px-2 py-1 text-center">d</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa del agregado mas medida</td>{[0,1,2].map((i)=><td key={`d-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.prueba_d_masa_agregado_mas_medida_kg[i] ?? ''} onChange={(e)=>setTriple('prueba_d_masa_agregado_mas_medida_kg', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">kg</td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">e</td><td className="border-t border-r border-slate-300 px-2 py-1">Masa del agregado (d-b)</td>{[0,1,2].map((i)=><td key={`e-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={payload.prueba_e_masa_agregado_kg[i] ?? ''} onChange={(e)=>setTriple('prueba_e_masa_agregado_kg', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">kg</td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">f</td><td className="border-t border-r border-slate-300 px-2 py-1">Densidad aparente del agregado (e/c)</td>{[0,1,2].map((i)=><td key={`f-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={payload.prueba_f_densidad_aparente_kg_m3[i] ?? ''} onChange={(e)=>setTriple('prueba_f_densidad_aparente_kg_m3', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">kg/m³</td></tr>
                  <tr className="bg-slate-50"><td className="border-t border-r border-slate-300 px-2 py-1"></td><td className="border-t border-r border-slate-300 px-2 py-1 font-semibold">Promedio densidad aparente</td><td className="border-t border-r border-slate-300 p-1" colSpan={3}><input type="number" step="any" className={inputClass} value={payload.densidad_aparente_promedio_kg_m3 ?? ''} onChange={(e)=>setField('densidad_aparente_promedio_kg_m3', parseNum(e.target.value))} /></td><td className="border-t border-slate-300 px-2 py-1 text-center">kg/m³</td></tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-800"><tr><th className="border-b border-r border-slate-300 px-2 py-1 text-left" colSpan={2}>Contenido de Vacios</th><th className="w-28 border-b border-r border-slate-300 py-1">1</th><th className="w-28 border-b border-r border-slate-300 py-1">2</th><th className="w-28 border-b border-r border-slate-300 py-1">3</th><th className="w-16 border-b border-slate-300 py-1">Und.</th></tr></thead>
                <tbody>
                  <tr><td className="w-8 border-t border-r border-slate-300 px-2 py-1 text-center">i</td><td className="border-t border-r border-slate-300 px-2 py-1">Gravedad especifica base seca</td>{[0,1,2].map((i)=><td key={`i-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.vacios_i_gravedad_especifica_base_seca[i] ?? ''} onChange={(e)=>setTriple('vacios_i_gravedad_especifica_base_seca', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">-</td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">j</td><td className="border-t border-r border-slate-300 px-2 py-1">Densidad del agua</td>{[0,1,2].map((i)=><td key={`j-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={form.vacios_j_densidad_agua_kg_m3[i] ?? ''} onChange={(e)=>setTriple('vacios_j_densidad_agua_kg_m3', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">kg/m³</td></tr>
                  <tr><td className="border-t border-r border-slate-300 px-2 py-1 text-center">k</td><td className="border-t border-r border-slate-300 px-2 py-1">% de vacios</td>{[0,1,2].map((i)=><td key={`k-${i}`} className="border-t border-r border-slate-300 p-1"><input type="number" step="any" className={inputClass} value={payload.vacios_k_porcentaje[i] ?? ''} onChange={(e)=>setTriple('vacios_k_porcentaje', i, e.target.value)} /></td>)}<td className="border-t border-slate-300 px-2 py-1 text-center">%</td></tr>
                  <tr className="bg-slate-50"><td className="border-t border-r border-slate-300 px-2 py-1"></td><td className="border-t border-r border-slate-300 px-2 py-1 font-semibold">Promedio % vacios</td><td className="border-t border-r border-slate-300 p-1" colSpan={3}><input type="number" step="any" className={inputClass} value={payload.vacios_promedio_pct ?? ''} onChange={(e)=>setField('vacios_promedio_pct', parseNum(e.target.value))} /></td><td className="border-t border-slate-300 px-2 py-1 text-center">%</td></tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr_280px_280px]">
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs font-semibold text-slate-800"><tr><th className="border-b border-r border-slate-300 py-1">Equipo utilizado</th><th className="border-b border-slate-300 py-1">Codigo</th></tr></thead>
                  <tbody>
                    <tr><td className="border-t border-r border-slate-300 px-2 py-1">Molde</td><td className="border-t border-slate-300 p-1"><select className={inputClass} value={form.equipo_molde_codigo ?? '-'} onChange={(e) => setField('equipo_molde_codigo', e.target.value)}>{withCurrentOption(form.equipo_molde_codigo, EQUIPO_OPTIONS.equipo_molde_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td></tr>
                    <tr><td className="border-t border-r border-slate-300 px-2 py-1">Balanza</td><td className="border-t border-slate-300 p-1"><select className={inputClass} value={form.equipo_balanza_codigo ?? '-'} onChange={(e) => setField('equipo_balanza_codigo', e.target.value)}>{withCurrentOption(form.equipo_balanza_codigo, EQUIPO_OPTIONS.equipo_balanza_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td></tr>
                    <tr><td className="border-t border-r border-slate-300 px-2 py-1">Varilla de apisonamiento</td><td className="border-t border-slate-300 p-1"><select className={inputClass} value={form.equipo_varilla_codigo ?? '-'} onChange={(e) => setField('equipo_varilla_codigo', e.target.value)}>{withCurrentOption(form.equipo_varilla_codigo, EQUIPO_OPTIONS.equipo_varilla_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td></tr>
                    <tr><td className="border-t border-r border-slate-300 px-2 py-1">Horno</td><td className="border-t border-slate-300 p-1"><select className={inputClass} value={form.equipo_horno_codigo ?? '-'} onChange={(e) => setField('equipo_horno_codigo', e.target.value)}>{withCurrentOption(form.equipo_horno_codigo, EQUIPO_OPTIONS.equipo_horno_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td></tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-300"><div className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">Observaciones</div><div className="p-2"><textarea className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35" rows={4} value={form.observaciones ?? ''} onChange={(e)=>setField('observaciones', e.target.value)} /></div></div>
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50"><div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Revisado</div><div className="space-y-2 p-2"><select className={inputClass} value={form.revisado_por ?? '-'} onChange={(e)=>setField('revisado_por', e.target.value)}>{REVISORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select><input className={inputClass} value={form.revisado_fecha ?? ''} onChange={(e)=>setField('revisado_fecha', e.target.value)} onBlur={() => setField('revisado_fecha', normalizeFlexibleDate(form.revisado_fecha ?? ''))} placeholder="Fecha" /></div></div>
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50"><div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Aprobado</div><div className="space-y-2 p-2"><select className={inputClass} value={form.aprobado_por ?? '-'} onChange={(e)=>setField('aprobado_por', e.target.value)}>{APROBADORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select><input className={inputClass} value={form.aprobado_fecha ?? ''} onChange={(e)=>setField('aprobado_fecha', e.target.value)} onBlur={() => setField('aprobado_fecha', normalizeFlexibleDate(form.aprobado_fecha ?? ''))} placeholder="Fecha" /></div></div>
            </div>

            <div className="border-t-2 border-blue-900 px-3 py-2 text-center text-[11px] leading-tight text-slate-700"><p>WEB: www.geofal.com.pe  E-MAIL: laboratorio@geofal.com.pe / geofal.sac@gmail.com</p><p>Av. Maranon 763, Los Olivos-Lima | Telefono 01522-1851</p></div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button onClick={clearAll} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"><Trash2 className="h-4 w-4" />Limpiar todo</button>
          <button onClick={() => void save(false)} disabled={loading} className="h-11 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar'}</button>
          <button onClick={() => void save(true)} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Procesando...</> : <><Download className="h-4 w-4" />Guardar y Descargar</>}</button>
        </div>
      </div>
    </div>
  )
}
