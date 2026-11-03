# Publicar el panel en Vercel

1. Publicar este repositorio en GitHub e importarlo en Vercel como proyecto Vite.
2. Seleccionar su rama de producción real: la copia preparada usa `master`; no asumir `main`.
3. Definir `VITE_API_BASE_URL` en Production con la URL **HTTPS** del backend de Render, sin barra final.
4. Desplegar y agregar la URL estable del panel a `CORS_ORIGINS` del backend.
5. Validar login, chat SSE y descargas autenticadas. Las descargas ya usan la misma URL configurable.

`vercel.json` incluye el build y las rutas del panel. Cada push a la rama de producción dispara un nuevo build; el resto de las ramas puede generar previews. Configurar protección de ramas en GitHub con `Frontend CI` requerido antes del merge.

Para comprobar el build local:

```bash
npm ci
npm run lint
VITE_API_BASE_URL=https://api.example.invalid npm run build
```

La URL de ejemplo solo sirve para compilar, no para usar el panel. En desarrollo, `npm run dev` conserva `http://localhost:3000` por defecto. Una compilación de producción sin URL HTTPS falla explícitamente. Cambiar una variable en Vercel requiere redeploy porque Vite la incorpora al JavaScript público.

No poner claves Gemini, JWT ni tokens Meta en variables `VITE_*`. Para el procedimiento completo del backend y alta del primer supervisor, ver `docs/DESPLIEGUE_RENDER_VERCEL.md` en `TrimIA-Backend`.
