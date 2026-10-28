// Pruebas de punta a punta: levantan el servidor Python real (puerto libre y
// archivo temporal) y ejecutan el CLI como lo haría una persona en la terminal.

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);
const PYTHON = process.env.PYTHON ?? "python";
const RUTA_SERVIDOR = fileURLToPath(new URL("../servidor/servidor.py", import.meta.url));
const RUTA_CLI = fileURLToPath(new URL("./tareas.js", import.meta.url));

let carpeta, archivo, servidor, url;

// Arranca el servidor y espera a que anuncie en qué puerto escucha.
function levantarServidor() {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(PYTHON, ["-u", RUTA_SERVIDOR], {
      env: { ...process.env, TAREAS_PUERTO: "0", TAREAS_ARCHIVO: archivo },
    });
    let salida = "";
    proceso.stdout.on("data", (trozo) => {
      salida += trozo;
      const encontrado = salida.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (encontrado) resolver({ proceso, url: encontrado[0] });
    });
    proceso.on("error", rechazar);
    proceso.on("exit", (codigo) => rechazar(new Error(`El servidor terminó (código ${codigo}): ${salida}`)));
  });
}

// Ejecuta el CLI y devuelve su código de salida, lo que imprimió y los errores.
async function cli(...args) {
  const opciones = { env: { ...process.env, TAREAS_URL: url } };
  try {
    const { stdout } = await ejecutar(process.execPath, [RUTA_CLI, ...args], opciones);
    return { codigo: 0, salida: stdout.trim(), error: "" };
  } catch (fallo) {
    return { codigo: fallo.code, salida: fallo.stdout.trim(), error: fallo.stderr.trim() };
  }
}

before(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "tareas-"));
  archivo = join(carpeta, "tareas.json");
  ({ proceso: servidor, url } = await levantarServidor());
});

beforeEach(() => {
  writeFileSync(archivo, "[]"); // cada prueba empieza con la lista vacía
});

after(() => {
  servidor?.kill();
  rmSync(carpeta, { recursive: true, force: true });
});

test("listar sin tareas avisa que no hay", async () => {
  assert.deepEqual(await cli("listar"), { codigo: 0, salida: "No hay tareas.", error: "" });
});

test("agregar acepta el título sin comillas", async () => {
  assert.equal((await cli("agregar", "Comprar", "pan")).salida, "Creada: [ ] 1. Comprar pan");
  assert.equal((await cli("listar")).salida, "[ ] 1. Comprar pan");
});

test("completar y desmarcar cambian la casilla", async () => {
  await cli("agregar", "Una");
  assert.equal((await cli("completar", "1")).salida, "Completada: [x] 1. Una");
  assert.equal((await cli("desmarcar", "1")).salida, "Desmarcada: [ ] 1. Una");
});

test("listar filtra por pendientes y completadas", async () => {
  await cli("agregar", "Una");
  await cli("agregar", "Dos");
  await cli("completar", "2");
  assert.equal((await cli("listar", "pendientes")).salida, "[ ] 1. Una");
  assert.equal((await cli("listar", "completadas")).salida, "[x] 2. Dos");
  await cli("desmarcar", "2");
  assert.equal((await cli("listar", "completadas")).salida, "No hay tareas completadas.");
});

test("editar cambia el título", async () => {
  await cli("agregar", "Original");
  assert.equal((await cli("editar", "1", "Nuevo", "título")).salida, "Editada: [ ] 1. Nuevo título");
});

test("eliminar quita la tarea", async () => {
  await cli("agregar", "Una");
  assert.equal((await cli("eliminar", "1")).salida, "Eliminada la tarea 1.");
  assert.equal((await cli("listar")).salida, "No hay tareas.");
});

test("respaldar guarda las tareas en un archivo nuevo de la carpeta indicada", async () => {
  await cli("agregar", "Una");
  await cli("agregar", "Dos");
  await cli("completar", "2");
  const destino = join(carpeta, "respaldos");
  const { codigo, salida } = await cli("respaldar", destino);
  assert.equal(codigo, 0);
  assert.match(salida, /^Copia de seguridad guardada \(2 tareas\): .*tareas-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
  const archivos = readdirSync(destino);
  assert.equal(archivos.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(destino, archivos[0]), "utf-8")), [
    { id: 1, titulo: "Una", completada: false },
    { id: 2, titulo: "Dos", completada: true },
  ]);
});

test("los errores del servidor se muestran y salen con código 1", async () => {
  assert.deepEqual(await cli("completar", "99"), { codigo: 1, salida: "", error: "Error: Tarea no encontrada" });
  assert.equal((await cli("listar", "hechas")).error, "Error: El filtro 'estado' debe ser 'pendientes' o 'completadas'");
  await cli("agregar", "Una");
  assert.equal((await cli("editar", "1")).error, "Error: El campo 'titulo' no puede estar vacío");
});

test("un comando desconocido muestra el uso", async () => {
  const resultado = await cli("volar");
  assert.equal(resultado.codigo, 1);
  assert.match(resultado.salida, /^Uso: node tareas\.js/);
});

// Pide al sistema un puerto libre y lo suelta: ahí no escucha nadie.
function puertoSinServidor() {
  return new Promise((resolver) => {
    const temporal = createServer().listen(0, "127.0.0.1", () => {
      const { port } = temporal.address();
      temporal.close(() => resolver(port));
    });
  });
}

test("sin servidor explica cómo levantarlo", async () => {
  const urlVacia = `http://127.0.0.1:${await puertoSinServidor()}`;
  const opciones = { env: { ...process.env, TAREAS_URL: urlVacia } };
  const fallo = await ejecutar(process.execPath, [RUTA_CLI, "listar"], opciones).catch((e) => e);
  assert.equal(fallo.code, 1);
  assert.match(fallo.stderr, /No se pudo conectar a .*¿Está corriendo el servidor\?/);
});
