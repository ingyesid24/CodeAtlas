# Contribuir a CodeAtlas

Gracias por ayudar a construir CodeAtlas. El objetivo es mantener una base pequeña, legible y fácil de verificar.

## Preparación

1. Crea una rama enfocada en un solo cambio.
2. Instala las versiones bloqueadas con `npm ci`.
3. Ejecuta la aplicación con `npm run electron:dev`.

## Antes de enviar un pull request

```bash
npm run check
```

El cambio debe compilar y todas las pruebas deben pasar.

## Convenciones para pruebas

- Coloca las pruebas del motor en `tests/analyzer/`.
- Nombra los archivos como `*.test.ts`.
- Prueba un comportamiento observable por caso.
- Crea repositorios ficticios con `tests/helpers/tmpProject.ts`.
- Limpia siempre los directorios temporales en `afterEach`.
- Usa `path.join()` en expectativas que contengan subdirectorios.
- Añade una prueba de regresión cuando corrijas un error.

## Alcance de los cambios

- Evita mezclar refactors y nuevas funcionalidades en el mismo pull request.
- No incluyas `dist/`, `dist-electron/`, `release/` ni `coverage/`.
- Explica qué problema resuelve el cambio y cómo fue verificado.
- Mantén el analizador desacoplado de Electron y React.

## Seguridad

No abras acceso directo a Node.js desde el renderer. Cualquier capacidad nueva debe exponerse mediante una API mínima en `preload.ts`, validarse en el proceso principal y tener tipos explícitos.
