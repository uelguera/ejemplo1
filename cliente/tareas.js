#!/usr/bin/env node
// Cliente de línea de comandos para la API de tareas (servidor en Python).
//
// Uso:
//   node tareas.js listar
//   node tareas.js listar pendientes      (o: completadas)
//   node tareas.js agregar "Comprar pan"
//   node tareas.js completar 1
//   node tareas.js desmarcar 1
//   node tareas.js editar 1 "Comprar pan integral"
//   node tareas.js eliminar 1
//   node tareas.js respaldar              (copia en respaldos/ del proyecto)
//   node tareas.js respaldar E:\copias    (o en la carpeta indicada)

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.TAREAS_URL ?? "http://127.0.0.1:8000";
const CARPETA_RESPALDOS = fileURLToPath(new URL("../respaldos/", import.meta.url));

export function formatearTarea(tarea) {
  const marca = tarea.completada ? "[x]" : "[ ]";
  return `${marca} ${tarea.id}. ${tarea.titulo}`;
}

// Nombre con fecha y hora local, p. ej. tareas-2026-10-28_16-30-05.json
export function nombreRespaldo(fecha = new Date()) {
  const dos = (numero) => String(numero).padStart(2, "0");
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  const hora = `${dos(fecha.getHours())}-${dos(fecha.getMinutes())}-${dos(fecha.getSeconds())}`;
  return `tareas-${dia}_${hora}.json`;
}

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(URL_BASE + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!respuesta.ok) {
    throw new Error(datos?.error ?? `Error HTTP ${respuesta.status}`);
  }
  return datos;
}

const comandos = {
  async listar(estado) {
    const ruta = estado ? `/tareas?estado=${encodeURIComponent(estado)}` : "/tareas";
    const tareas = await pedir("GET", ruta);
    console.log(tareas.length ? tareas.map(formatearTarea).join("\n") : `No hay tareas${estado ? ` ${estado}` : ""}.`);
  },
  async agregar(...palabras) {
    const tarea = await pedir("POST", "/tareas", { titulo: palabras.join(" ") });
    console.log(`Creada: ${formatearTarea(tarea)}`);
  },
  async completar(id) {
    const tarea = await pedir("PATCH", `/tareas/${id}`);
    console.log(`Completada: ${formatearTarea(tarea)}`);
  },
  async desmarcar(id) {
    const tarea = await pedir("PATCH", `/tareas/${id}`, { completada: false });
    console.log(`Desmarcada: ${formatearTarea(tarea)}`);
  },
  async editar(id, ...palabras) {
    const tarea = await pedir("PATCH", `/tareas/${id}`, { titulo: palabras.join(" ") });
    console.log(`Editada: ${formatearTarea(tarea)}`);
  },
  async eliminar(id) {
    await pedir("DELETE", `/tareas/${id}`);
    console.log(`Eliminada la tarea ${id}.`);
  },
  async respaldar(carpeta = CARPETA_RESPALDOS) {
    const tareas = await pedir("GET", "/tareas");
    await mkdir(carpeta, { recursive: true });
    const ruta = resolve(carpeta, nombreRespaldo());
    await writeFile(ruta, JSON.stringify(tareas, null, 2) + "\n", "utf-8");
    const cantidad = `${tareas.length} ${tareas.length === 1 ? "tarea" : "tareas"}`;
    console.log(`Copia de seguridad guardada (${cantidad}): ${ruta}`);
  },
};

async function main() {
  const [comando, ...args] = process.argv.slice(2);
  const accion = comandos[comando];
  if (!accion) {
    console.log("Uso: node tareas.js <listar [pendientes|completadas] | agregar \"titulo\" | completar <id> | desmarcar <id> | editar <id> \"titulo\" | eliminar <id> | respaldar [carpeta]>");
    process.exitCode = 1;
    return;
  }
  try {
    await accion(...args);
  } catch (error) {
    const mensaje = error.cause?.code === "ECONNREFUSED"
      ? `No se pudo conectar a ${URL_BASE}. ¿Está corriendo el servidor? (python servidor/servidor.py)`
      : error.message;
    console.error(`Error: ${mensaje}`);
    process.exitCode = 1;
  }
}

// Solo ejecuta main() si se llama directamente (no al importarlo desde las pruebas).
if (import.meta.main) {
  main();
}
