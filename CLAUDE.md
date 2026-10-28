# ejemplo1 — Lista de tareas (Python + Node.js)

Proyecto de aprendizaje para practicar Claude Code. Es pequeño a propósito.

## Arquitectura

- `servidor/servidor.py` — API HTTP en Python (solo librería estándar). Guarda en `servidor/tareas.json`.
- `servidor/web/index.html` — página web (HTML, CSS y JS en un archivo) que `servidor.py` sirve en `/` y usa la misma API.
- `cliente/tareas.js` — CLI en Node.js que llama a la API con `fetch`.

## Comandos

| Tarea | Comando |
|---|---|
| Levantar servidor | `python servidor/servidor.py` (puerto 8000) |
| Usar el cliente | `node cliente/tareas.js listar [pendientes\|completadas]` · `agregar "..."` · `completar <id>` · `desmarcar <id>` · `editar <id> "..."` · `eliminar <id>` |
| Pruebas Python | `cd servidor && python -m unittest -v` |
| Pruebas Node | `cd cliente && npm test` (levantan el servidor real: necesitan `python`) |

Ambas suites de pruebas deben pasar antes de dar una tarea por terminada.

## Reglas

- Sin dependencias externas (ni pip ni npm) salvo que el usuario lo pida.
- Código, nombres y mensajes en español.
- El usuario está aprendiendo Claude Code: explica brevemente qué haces y por qué.
