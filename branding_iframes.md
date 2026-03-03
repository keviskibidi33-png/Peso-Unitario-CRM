# Branding Iframes - Peso Unitario

Documento de referencia para mantener consistente el branding del microfrontend de **Peso Unitario** y su visualizacion embebida en iframe dentro del CRM.

## Alcance

- Microfrontend: `peso-unitario-crm`
- Shell embebedor: `crm-geofal` modulo Peso Unitario
- Flujo: CRM abre `https://peso-unitario.geofal.com.pe` en dialog modal con `token` y opcionalmente `ensayo_id`

## Reglas visuales

- Mantener estructura de hoja tecnica fiel a `Template_PesoUni.xlsx`.
- Preservar bloque ASTM C29/C29M-23.
- Mantener consistencia visual con modulos recientes de laboratorio.
- Botonera final con acciones `Guardar` y `Guardar y Descargar`.

## Contrato iframe

- Entrada por query params: `token`, `ensayo_id`.
- Mensajes hijo -> padre: `TOKEN_REFRESH_REQUEST`, `CLOSE_MODAL`.
- Mensaje padre -> hijo: `TOKEN_REFRESH`.
