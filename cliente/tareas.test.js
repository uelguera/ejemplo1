import { test } from "node:test";
import assert from "node:assert/strict";
import { formatearTarea, nombreRespaldo } from "./tareas.js";

test("tarea pendiente se muestra con casilla vacía", () => {
  assert.equal(formatearTarea({ id: 1, titulo: "Leer", completada: false }), "[ ] 1. Leer");
});

test("tarea completada se muestra marcada", () => {
  assert.equal(formatearTarea({ id: 2, titulo: "Escribir", completada: true }), "[x] 2. Escribir");
});

test("el nombre del respaldo lleva fecha y hora con ceros a la izquierda", () => {
  assert.equal(nombreRespaldo(new Date(2026, 9, 28, 9, 5, 3)), "tareas-2026-10-28_09-05-03.json");
});
