# CodeAtlas

> Understand any codebase in minutes.

CodeAtlas es una aplicación de escritorio que analiza proyectos locales y presenta su estructura y señales arquitectónicas en una interfaz navegable. La versión `0.1` se concentra en proyectos JavaScript y TypeScript.

## Versión, fase y descargas

| Campo          | Valor                                                  |
| -------------- | ------------------------------------------------------ |
| **Versión**    | `0.1.0` (`package.json`) — visible en la barra de la app |
| **Fase**       | MVP (v0.1) · desarrollo activo                         |
| **Licencia**   | MIT                                                    |

### Plataformas disponibles

| Sistema operativo | Artefacto                                   |
| ----------------- | ------------------------------------------- |
| Linux             | `.AppImage` (y `.snap`)                     |
| Windows           | Instalador `.exe` (NSIS) y portable `.exe`  |
| macOS             | `.dmg` y `.zip`                             |

### Descargar

Los binarios se generan automáticamente con GitHub Actions al crear un tag `v*` y se publican en [GitHub Releases](https://github.com/ingyesid24/CodeAtlas/releases). Descarga el artefacto de tu sistema operativo en la última release.

> Los binarios no están firmados: en Windows el SmartScreen y en macOS Gatekeeper mostrarán una advertencia al primer arranque (se salta con "Más información → Ejecutar de todas formas" / clic derecho → Abrir).

## Estado actual

El MVP incluye:

- Electron, React, TypeScript y Vite.
- Selección segura de un repositorio local mediante IPC.
- Árbol de archivos con exclusión de dependencias y artefactos de build.
- Detección y parseo de `package.json`.
- Detección de usos de `process.env`.
- Detección heurística de rutas Express y NestJS (decoradores `@Controller`/`@Get`/`@Post` y similares), con método, ruta completa, archivo y línea. Sus límites se documentan en la sección [Límites de los detectores heurísticos](#límites-de-los-detectores-heurísticos-v01).
- Detección de imports y `require`, resolviendo rutas relativas entre módulos.
- Modelo de grafo común para archivos, rutas, variables, paquetes y dependencias.
- Mapa interactivo con React Flow: pan, zoom, minimapa y nodos coloreados por tipo.
- Selección de nodo: resaltado de dependencias y panel de detalles con "Depende de" / "Usado por".
- Apertura de archivo y línea en el IDE preferido: VS Code, Cursor, Windsurf, Zed, Sublime, JetBrains, Xcode y Visual Studio (detección automática).
- Manejo de directorios inaccesibles y errores de IPC.
- Análisis en un `worker_threads` dedicado: Electron nunca se congela y la interfaz muestra una barra de progreso con fases y porcentaje en vivo.
- Suite automatizada del analizador con Vitest.

## Límites de los detectores heurísticos (v0.1)

Los detectores del analizador son **heurísticos basados en expresiones regulares**, no en un AST real: pueden arrojar falsos positivos y falsos negativos. Son útiles para orientarse en un proyecto desconocido, no para auditorías exhaustivas. La suite de pruebas cubre los comportamientos descritos aquí.

### Rutas Express (`src/analyzer/routescan.ts`)

Detecta llamadas `app|router|api` o variables terminadas en `Router`/`App` con métodos `get/post/put/patch/delete/all/use` y una ruta literal entre comillas. Límites:

- Solo rutas de una línea: las llamadas multilínea no se detectan.
- Solo rutas literales: las plantillas o variables (`app.get(\`/users/${id}\`, ...)`) se omiten.
- Solo receptores con nombres reconocibles: si el router se renombra (`const myRouter = express.Router()` → `myRouter.get(...)` no es `*Router`), no se detecta.
- Falsos positivos: `app.use('/estatico', express.static(...))` se registra como ruta, y cualquier variable que cumpla el patrón de nombre (p. ej. `userRouter.get(...)`) aunque no sea Express.
- Los comentarios (`// app.get('/x')`) se detectan como rutas.

### Rutas NestJS (`src/analyzer/nestscan.ts`)

Detecta decoradores `@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Options`, `@Head` y `@All` con argumento literal, componiendo prefijo del controlador y subruta. Límites:

- Los decoradores deben estar al inicio de línea (con solo espacios antes).
- Argumentos de ruta solo literales: variables y template literals no se resuelven.
- Las rutas de método sin un `@Controller` activo previo en el archivo se ignoran.
- Con varios `@Controller` en un mismo archivo, cada ruta se atribuye al último prefijo vigente.

### Variables de entorno (`src/analyzer/envscan.ts`)

Detecta `process.env.NOMBRE` y `process.env['NOMBRE']` en código JS/TS. Límites:

- No detecta destructuring (`const { PORT } = process.env`) ni acceso dinámico (`process.env[nombre]`).
- Los comentarios que mencionan `process.env.X` cuentan como uso.
- No lee archivos `.env` ni `.env.example`; solo detecta usos en el código.

### Imports (`src/analyzer/importscan.ts`)

Detecta `import`, `export ... from`, `import(...)` y `require(...)` con comillas simples o dobles; resuelve specifiers relativos probando extensiones e index de carpeta. Límites:

- No soporta specifiers con backticks ni imports multilínea (`import {\n a \n} from '...'`).
- Los comentarios con imports se detectan como imports reales.
- Los specifiers de `node_modules` y los alias de tsconfig (`@/...`) quedan sin `target` resuelto.
- Solo se escanean `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs` y `.cjs`.

### Escáner de estructura (`src/analyzer/scanner.ts`)

- Lista fija de carpetas ignoradas (`node_modules`, `.git`, `dist`, `build`…): carpetas de dependencias con otros nombres sí se escanean.
- No sigue symlinks: módulos montados por symlink quedan fuera del análisis.
- Los archivos ocultos se omiten salvo `.env`.
- El análisis es un snapshot estático: no hay watch ni análisis incremental.

### Alcance

- v0.1 analiza únicamente proyectos JavaScript y TypeScript.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.

## Desarrollo

```bash
npm install
npm run electron:dev
```

El comando compila el proceso principal, inicia Vite en `http://localhost:5173` y abre Electron con recarga en caliente.

## Pruebas

La suite usa proyectos temporales aislados. No analiza ni modifica repositorios reales.

```bash
# Ejecutar una vez
npm test

# Modo interactivo durante el desarrollo
npm run test:watch

# Verificar los tipos de las pruebas
npm run test:typecheck
```

La cobertura funcional actual incluye:

- Árbol, conteos, orden y carpetas ignoradas.
- Directorios inexistentes o sin permisos.
- `package.json` raíz, paquetes anidados y JSON inválido.
- Variables de entorno, agrupación y exclusiones.
- Rutas Express y NestJS, métodos HTTP, composición de prefijos y falsos positivos.
- Imports ES, `require`, re-exports, resolución de extensiones e index.
- IDs, nodos, relaciones y deduplicación del grafo arquitectónico.
- Integración completa mediante `analyzeProject()`.
- Progreso del análisis: fases, avance por archivo y rango monótono [0, 1].
- Mapeo visual: ids estables, posiciones deterministas, regiones por tipo y colores.

Antes de proponer un cambio ejecuta:

```bash
npm run check
```

Este comando verifica tipos, ejecuta las pruebas y construye el renderer y Electron.

## Build de producción

```bash
npm run electron:build
```

Genera los artefactos del sistema operativo actual en `release/`:

| Sistema   | Comando                                 | Artefactos                                    |
| --------- | --------------------------------------- | --------------------------------------------- |
| Linux     | `npm run electron:build`                | `.AppImage` y `.snap`                         |
| Windows   | `npm run electron:build` (en Windows)   | `.exe` (instalador NSIS y portable)           |
| macOS     | `npm run electron:build` (en macOS)     | `.dmg` y `.zip`                               |

Cada plataforma se compila en su propio sistema: Windows no se puede empaquetar desde Linux (requiere Wine) y macOS solo se empaqueta en macOS. El workflow `.github/workflows/build.yml` compila las tres plataformas en GitHub Actions y publica un release automáticamente al crear un tag `v*`. La firma se habilita configurando `CSC_LINK`/`CSC_KEY_PASSWORD` (macOS y Windows) en el CI.

En Linux, la primera vez que se ejecuta el AppImage la app se integra sola en el menú y el dock de GNOME (genera la entrada `.desktop` y el ícono en `~/.local/share`).

## Estructura

```text
codeatlas/
├── electron/
│   ├── main.ts              # Ventana, validación, IPC y ciclo de vida del worker
│   ├── analyzerWorker.ts    # Ejecuta el análisis en worker_threads y reporta progreso
│   ├── preload.ts           # API segura para el renderer
│   └── tsconfig.json
├── src/
│   ├── analyzer/
│   │   ├── scanner.ts       # Árbol y package.json
│   │   ├── envscan.ts       # Variables de entorno
│   │   ├── routescan.ts     # Rutas Express
│   │   ├── nestscan.ts      # Rutas NestJS (decoradores)
│   │   ├── importscan.ts    # Imports y require entre módulos
│   │   ├── graph.ts         # Grafo común y IDs estables
│   │   ├── types.ts         # Contratos del análisis
│   │   └── index.ts         # Orquestación
│   ├── editors/
│   │   └── registry.ts      # IDEs soportados y builders de apertura
│   ├── components/
│   │   ├── TreeView.tsx
│   │   ├── GraphView.tsx      # Lienzo React Flow y panel de detalles
│   │   ├── graphMapper.ts     # Grafo del análisis → React Flow
│   │   └── graphLabels.ts     # Etiquetas y colores por tipo
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── analyzer/            # Pruebas unitarias e integración
│   ├── graphview/           # Pruebas del mapeo visual
│   └── helpers/             # Fixtures temporales
├── tsconfig.json            # Renderer
├── tsconfig.test.json       # Pruebas
├── vite.config.mts
└── vitest.config.mts
```

## Arquitectura

El renderer no accede directamente a Node.js. `preload.ts` expone una API mínima mediante `contextBridge`, el proceso principal valida las entradas IPC y el analizador usa únicamente APIs de Node (`fs` y `path`).

El análisis corre en un hilo aparte (`electron/analyzerWorker.ts`, vía `worker_threads`): el proceso principal valida la ruta, lanza el worker y reenvía al renderer los eventos de progreso por IPC; el renderer no se congela aunque el proyecto sea grande.

`ArchitectureGraph` es un modelo de dominio serializable e independiente de React Flow. Sus IDs y rutas están normalizados para que el mismo análisis sea estable en distintos sistemas operativos. `graphMapper.ts` convierte el modelo en nodos y aristas de React Flow con posiciones deterministas, y `GraphView.tsx` lo renderiza en el mapa interactivo de módulos.

Esta separación permite mover el análisis a un worker o sustituir el motor en el futuro sin reescribir la interfaz.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir un pull request.
