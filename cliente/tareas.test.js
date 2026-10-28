import { test } from "node:test";
import assert from "node:assert/strict";
import { formatearTarea } from "./tareas.js";

test("tarea pendiente se muestra con casilla vacía", () => {
  assert.equal(formatearTarea({ id: 1, titulo: "Leer", completada: false }), "[ ] 1. Leer");
});

test("tarea completada se muestra marcada", () => {
  assert.equal(formatearTarea({ id: 2, titulo: "Escribir", completada: true }), "[x] 2. Escribir");
});
