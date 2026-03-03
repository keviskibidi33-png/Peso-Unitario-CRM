export interface PesoUnitarioPayload {
    muestra: string
    numero_ot: string
    fecha_ensayo: string
    realizado_por: string

    recipiente_molde_numero?: string | null
    recipiente_masa_medida_kg?: number | null
    recipiente_volumen_m3?: number | null
    metodo_compactacion?: "A" | "B" | "C" | "-" | null

    tipo_muestra?: string | null
    tamano_maximo_nominal_visual_in?: string | null
    masa_agregado_g?: number | null
    masa_agregado_seco_g?: number | null
    masa_agregado_seco_constante_g?: number | null

    prueba_d_masa_agregado_mas_medida_kg: Array<number | null>
    prueba_e_masa_agregado_kg: Array<number | null>
    prueba_f_densidad_aparente_kg_m3: Array<number | null>
    densidad_aparente_promedio_kg_m3?: number | null

    vacios_i_gravedad_especifica_base_seca: Array<number | null>
    vacios_j_densidad_agua_kg_m3: Array<number | null>
    vacios_k_porcentaje: Array<number | null>
    vacios_promedio_pct?: number | null

    equipo_molde_codigo?: string | null
    equipo_balanza_codigo?: string | null
    equipo_varilla_codigo?: string | null
    equipo_horno_codigo?: string | null

    observaciones?: string | null
    revisado_por?: string | null
    revisado_fecha?: string | null
    aprobado_por?: string | null
    aprobado_fecha?: string | null
}

export interface PesoUnitarioEnsayoSummary {
    id: number
    numero_ensayo: string
    numero_ot: string
    cliente?: string | null
    muestra?: string | null
    fecha_documento?: string | null
    estado: string
    densidad_aparente_promedio_kg_m3?: number | null
    vacios_promedio_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

export interface PesoUnitarioEnsayoDetail extends PesoUnitarioEnsayoSummary {
    payload?: PesoUnitarioPayload | null
}

export interface PesoUnitarioSaveResponse {
    id: number
    numero_ensayo: string
    numero_ot: string
    estado: string
    densidad_aparente_promedio_kg_m3?: number | null
    vacios_promedio_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}
