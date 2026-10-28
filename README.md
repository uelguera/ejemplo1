# ejemplo1 — Lista de tareas

Un servidor en **Python** y un cliente de línea de comandos en **Node.js**. Sin dependencias externas.

```
 node cliente/tareas.js  ──HTTP/JSON──▶  python servidor/servidor.py  ──▶  tareas.json
```

## Probarlo

En una terminal:

```bash
python servidor/servidor.py
```

En otra:

```bash
node cliente/tareas.js agregar "Aprender Claude Code"
node cliente/tareas.js listar
node cliente/tareas.js completar 1
node cliente/tareas.js listar pendientes      # o: listar completadas
node cliente/tareas.js desmarcar 1
node cliente/tareas.js editar 1 "Aprender Claude Code a fondo"
node cliente/tareas.js eliminar 1
```

## Pruebas

```bash
cd servidor && python -m unittest -v
cd cliente && npm test
```
