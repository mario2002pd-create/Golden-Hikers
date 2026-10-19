# Golden Hikers

La web de nuestras rutas de senderismo por Navarra: cifras totales, mapa con todos los tracks (en líneas o como mapa de calor) y la lista de salidas.

```bash
npm ci
npm run dev        # genera los datos y abre la web en local
npm run build      # genera los datos y la web final en dist/
npm run comprobar  # compara las cifras con docs/referencia.json (solo avisa)
```

## Añadir una ruta nueva

1. Exporta el GPX desde Strava (en la actividad: «…» → «Exportar GPX»).
2. Déjalo en `data/gpx/` (vale también `.gpx.gz`). El nombre del archivo da igual.
3. Haz commit y push a `main`. La Action vuelve a calcular todo y publica la web.

El script `scripts/build-data.mjs` saca de cada GPX la fecha, los kilómetros, el desnivel positivo y la altitud máxima, y genera `public/rutas.json`. Antes de publicar el track **le quita los primeros y los últimos 200 m**, para no enseñar dónde empieza y acaba cada salida.

## Fijar datos a mano: `data/overrides.json`

La clave puede ser el nombre del archivo o la fecha (`AAAA-MM-DD`). El nombre del archivo tiene prioridad.

```json
{
  "Golden_hikers.gpx": { "nombre": "Zolina" },
  "2026-03-19": { "nombre": "Eltxumendi", "km": 6.33, "desnivel": 363 },
  "carrera_del_domingo.gpx": { "excluir": true }
}
```

Campos: `nombre`, `fecha`, `km`, `desnivel`, `altitudMaxima` y `excluir`. Lo normal es poner solo el nombre, porque el de Strava suele ser genérico.

## Fotos

Las fotos van en `public/fotos/`, ya optimizadas: WebP sin metadatos, en una versión grande (`-l`) y otra pequeña (`-s`). `public/fotos/fotos.json` dice qué papel tiene cada una:

| `papel` | Dónde sale |
|---|---|
| `portada` | Portada a pantalla completa (pantallas horizontales) |
| `portada-movil` | Portada en pantallas verticales (móvil), con `<picture>` |
| `corte` | A sangre, a pantalla completa, entre la portada y el mapa |
| `galeria` | La franja «Por el camino», con la fecha y la ruta como pie |

Cada foto lleva su `alt`, que es el texto alternativo de la web. Para añadir una foto basta con subir sus dos versiones y una entrada nueva en `fotos.json`. El build las mete directamente en el HTML. Sin fotos, la portada usa un cielo de atardecer con las sierras dibujadas a partir de los perfiles de altitud de las rutas.

## Cómo se calculan las cifras

Para parecerse a Strava, los parámetros se han calibrado con las 3 rutas de prueba (están en `PARAMETROS`, en `scripts/build-data.mjs`):

- **Distancia:** se quitan los saltos del GPS (más de 4 m/s respecto al último punto bueno), se suaviza la posición con una media de 5 puntos y no se cuentan los movimientos de menos de 1 m (el temblor del GPS cuando estamos parados).
- **Desnivel:** la altitud se remuestrea cada 10 m recorridos y se suman las subidas con una histéresis de 1,5 m, sin media móvil.

## Publicar en GitHub Pages

1. En GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. Cada push a `main` lanza `.github/workflows/pages.yml`, que hace `npm ci`, `npm run build` y publica `dist/`.

> **Ojo con dos cosas antes de publicar:**
>
> - **GitHub Pages en un repositorio privado exige GitHub Pro** (o un plan de pago de organización). Con el plan gratuito, el repo tiene que ser público.
> - **Si el repositorio se hace público, los GPX originales de `data/gpx/` quedarán visibles para cualquiera**, con el inicio y el final reales de cada ruta. El recorte de 200 m solo se aplica a lo que se publica en la web, no al repositorio. Las fotos, en cambio, se ven igual en la web que en el repo.
