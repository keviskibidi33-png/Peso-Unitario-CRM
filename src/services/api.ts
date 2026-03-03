import axios from 'axios'
import type {
    PesoUnitarioPayload,
    PesoUnitarioSaveResponse,
    PesoUnitarioEnsayoDetail,
    PesoUnitarioEnsayoSummary,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.geofal.com.pe'

const api = axios.create({
    baseURL: API_URL,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            window.dispatchEvent(new CustomEvent('session-expired'))
        }
        return Promise.reject(error)
    },
)

export async function savePesoUnitarioEnsayo(
    payload: PesoUnitarioPayload,
    ensayoId?: number,
): Promise<PesoUnitarioSaveResponse> {
    const { data } = await api.post<PesoUnitarioSaveResponse>('/api/peso-unitario/excel', payload, {
        params: {
            download: false,
            ensayo_id: ensayoId,
        },
    })
    return data
}

export async function saveAndDownloadPesoUnitarioExcel(
    payload: PesoUnitarioPayload,
    ensayoId?: number,
): Promise<{ blob: Blob; ensayoId?: number }> {
    const response = await api.post('/api/peso-unitario/excel', payload, {
        params: {
            download: true,
            ensayo_id: ensayoId,
        },
        responseType: 'blob',
    })

    const ensayoIdHeader = response.headers['x-peso-unitario-id']
    const parsedId = Number(ensayoIdHeader)
    return {
        blob: response.data,
        ensayoId: Number.isFinite(parsedId) ? parsedId : undefined,
    }
}

export async function listPesoUnitarioEnsayos(limit = 100): Promise<PesoUnitarioEnsayoSummary[]> {
    const { data } = await api.get<PesoUnitarioEnsayoSummary[]>('/api/peso-unitario/', {
        params: { limit },
    })
    return data
}

export async function getPesoUnitarioEnsayoDetail(ensayoId: number): Promise<PesoUnitarioEnsayoDetail> {
    const { data } = await api.get<PesoUnitarioEnsayoDetail>(`/api/peso-unitario/${ensayoId}`)
    return data
}

export default api
