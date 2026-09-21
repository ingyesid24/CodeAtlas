# Changelog

Todas las versiones notables de CodeAtlas se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es [SemVer](https://semver.org/lang/es/).

## [1.3.0] - 2026-09-21

Fase: análisis AST.

### Añadido

- Parser de AST real (`@typescript-eslint/typescript-estree`) para el análisis de código.
- Imports/`require`: soporte de imports multilínea y template literals sin interpolación.
- Variables de entorno: detección de destructuring (`const { PORT } = process.env`).
- Rutas Express: soporte de llamadas multilínea y template literals sin interpolación.
- Respaldo por regex si un archivo no se puede parsear (sintaxis rota).

### Cambiado

- `envscan.ts`, `routescan.ts` e `importscan.ts` migrados de regex a AST.
- Versión de `1.2.0` a `1.3.0`.

### Corregido

- Los comentarios y strings ya no generan falsos positivos: `// app.get('/x')`, `// import './y'` o textos que mencionan `process.env.X` ya no cuentan como código.
- Rutas Express multilínea ahora se detectan correctamente.

### Pruebas

- Suite ampliada a 133 tests: imports multilínea, destructuring de `process.env`, rutas multilínea, plantillas sin interpolación y comentarios/strings ignorados.

## [1.2.0] - 2026-09-21

Fase: actualizaciones automáticas.

### Añadido

- Sistema de actualizaciones con `electron-updater` y GitHub Releases como proveedor.
- Comprobación automática de nuevas versiones al iniciar la app (solo binarios empaquetados).
- Notificación dentro de la app cuando hay una versión nueva: versión disponible, versión actual y botones "Descargar actualización" / "Más tarde".
- Progreso de descarga en tiempo real.
- Aviso "Reiniciar e instalar" cuando la descarga termina.
- Comprobación manual con el botón "Buscar actualizaciones" en la cabecera.
- Publicación de metadatos de actualización (`latest*.yml` y `*.blockmap`) en GitHub Releases para que `electron-updater` pueda detectar versiones nuevas en Linux (AppImage), Windows (NSIS) y macOS (zip).

### Nota para usuarios de v0.1

Las versiones anteriores a 1.2.0 no tienen el actualizador integrado: si tienes instalado v0.1/v1.1, instala una vez manualmente la v1.2.0 desde GitHub Releases. A partir de esa versión las futuras actualizaciones se notificarán automáticamente dentro de la app.

## [1.1.0] - 2026-09-21

Fase: estabilidad y adopción.

### Añadido

- Búsqueda de nodos en el mapa por nombre, ruta o detalle, insensible a mayúsculas, con recuento de coincidencias y botón para limpiar.
- Exportación del grafo arquitectónico a un archivo JSON desde la app (`Exportar grafo`), con diálogo de guardado y validación del payload en el proceso principal.
- Límite de tamaño para archivos fuente: `MAX_SOURCE_FILE_BYTES` (512 KB) omite bundles minificados y código generado del análisis de rutas, variables e imports.
- Documentación del formato `ArchitectureGraph` (nodos, aristas y esquema) en el README.
- `CHANGELOG.md`.

### Cambiado

- Versión de `0.1.0` a `1.1.0`.
- README: estado actual de v1.1, tabla de plataformas alineada con el CI (Linux publica `.AppImage`; `.snap` solo en build local).

### Corregido

- El mapa ahora conserva las aristas correctas al combinar el toggle de tipos con la búsqueda (el filtro se aplica de forma componible sobre el grafo original, sin mutarlo).

### Pruebas

- Suite ampliada a 124 tests: búsqueda (`filterGraphByQuery`/`matchesNodeQuery`) y límite de tamaño en `collectSourceFiles`.

## [0.1.0] - 2026-08-12

MVP: analizador JavaScript/TypeScript y aplicación Electron.

### Añadido

- Electron, React, TypeScript y Vite.
- Selección segura de un repositorio local mediante IPC.
- Árbol de archivos con exclusión de dependencias y artefactos de build.
- Detección y parseo de `package.json`.
- Detección de usos de `process.env`.
- Detección heurística de rutas Express y NestJS (decoradores `@Controller`/`@Get`/`@Post` y similares), con método, ruta completa, archivo y línea.
- Detección de imports y `require`, resolviendo rutas relativas entre módulos.
- Modelo de grafo común para archivos, rutas, variables, paquetes y dependencias (`ArchitectureGraph`, `schemaVersion: 1`).
- Mapa interactivo con React Flow: pan, zoom, minimapa y nodos coloreados por tipo.
- Selección de nodo: resaltado de dependencias y panel de detalles con "Depende de" / "Usado por".
- Apertura de archivo y línea en el IDE preferido: VS Code, Cursor, Windsurf, Zed, Sublime, JetBrains, Xcode y Visual Studio (detección automática).
- Manejo de directorios inaccesibles y errores de IPC.
- Análisis en un `worker_threads` dedicado con barra de progreso por fases.
- Toggle de tipos de nodo en el mapa (ocultar `dependency` por defecto).
- Suite automatizada del analizador con Vitest.
- Workflow de GitHub Actions para compilar Linux, Windows y macOS y publicar releases al crear un tag `v*`.

[1.3.0]: https://github.com/ingyesid24/CodeAtlas/releases/tag/v1.3.0
[1.2.0]: https://github.com/ingyesid24/CodeAtlas/releases/tag/v1.2.0
[1.1.0]: https://github.com/ingyesid24/CodeAtlas/releases/tag/v1.1.0
[0.1.0]: https://github.com/ingyesid24/CodeAtlas/releases/tag/v0.1.0