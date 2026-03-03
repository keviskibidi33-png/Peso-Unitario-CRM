# Peso Unitario CRM Frontend

Microfrontend del modulo **Peso Unitario ASTM C29/C29M-23** para Geofal.

- Dominio productivo: `https://peso-unitario.geofal.com.pe`
- Backend API: `https://api.geofal.com.pe` (rutas `/api/peso-unitario`)

## Objetivo

- Registrar y editar ensayos de peso unitario.
- Mantener guardado incremental en BD (`EN PROCESO`/`COMPLETO`).
- Exportar Excel con plantilla oficial `Template_PesoUni.xlsx`.
- Cerrar modal del CRM luego de guardar.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Axios
- React Hot Toast

## Variables de entorno

- `VITE_API_URL=https://api.geofal.com.pe`
- `VITE_CRM_LOGIN_URL=https://crm.geofal.com.pe/login`

## Desarrollo local

```bash
npm install
npm run dev
```
