"""Pruebas del servidor: levantan la API en un puerto libre con un archivo temporal."""

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from servidor import Almacen, crear_manejador


class PruebasApi(unittest.TestCase):
    def setUp(self):
        self.carpeta = tempfile.TemporaryDirectory()
        almacen = Almacen(Path(self.carpeta.name) / "tareas.json")
        self.servidor = ThreadingHTTPServer(("127.0.0.1", 0), crear_manejador(almacen))
        self.base = f"http://127.0.0.1:{self.servidor.server_address[1]}"
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.carpeta.cleanup()

    def pedir(self, metodo, ruta, cuerpo=None):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        peticion = urllib.request.Request(self.base + ruta, data=datos, method=metodo)
        peticion.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(peticion) as r:
                texto = r.read()
                return r.status, json.loads(texto) if texto else None
        except urllib.error.HTTPError as e:
            with e:  # cierra la respuesta de error para evitar ResourceWarning
                return e.code, json.loads(e.read())

    def test_lista_vacia_al_inicio(self):
        self.assertEqual(self.pedir("GET", "/tareas"), (200, []))

    def test_crear_y_listar(self):
        estado, tarea = self.pedir("POST", "/tareas", {"titulo": "Aprender Claude Code"})
        self.assertEqual(estado, 201)
        self.assertEqual(tarea, {"id": 1, "titulo": "Aprender Claude Code", "completada": False})
        self.assertEqual(self.pedir("GET", "/tareas")[1], [tarea])

    def test_crear_sin_titulo_falla(self):
        estado, cuerpo = self.pedir("POST", "/tareas", {"titulo": "   "})
        self.assertEqual(estado, 400)
        self.assertIn("error", cuerpo)

    def test_completar(self):
        self.pedir("POST", "/tareas", {"titulo": "Una"})
        estado, tarea = self.pedir("PATCH", "/tareas/1")
        self.assertEqual(estado, 200)
        self.assertTrue(tarea["completada"])

    def test_eliminar(self):
        self.pedir("POST", "/tareas", {"titulo": "Una"})
        self.assertEqual(self.pedir("DELETE", "/tareas/1"), (204, None))
        self.assertEqual(self.pedir("GET", "/tareas")[1], [])

    def test_editar_titulo(self):
        self.pedir("POST", "/tareas", {"titulo": "Original"})
        self.pedir("PATCH", "/tareas/1")  # la completamos antes de editarla
        estado, tarea = self.pedir("PATCH", "/tareas/1", {"titulo": "  Nuevo título  "})
        self.assertEqual(estado, 200)
        self.assertEqual(tarea, {"id": 1, "titulo": "Nuevo título", "completada": True})
        self.assertEqual(self.pedir("GET", "/tareas")[1], [tarea])

    def test_editar_sin_titulo_falla(self):
        self.pedir("POST", "/tareas", {"titulo": "Original"})
        estado, cuerpo = self.pedir("PATCH", "/tareas/1", {"titulo": "   "})
        self.assertEqual(estado, 400)
        self.assertIn("error", cuerpo)
        self.assertEqual(self.pedir("GET", "/tareas")[1][0]["titulo"], "Original")

    def test_desmarcar(self):
        self.pedir("POST", "/tareas", {"titulo": "Una"})
        self.pedir("PATCH", "/tareas/1")
        estado, tarea = self.pedir("PATCH", "/tareas/1", {"completada": False})
        self.assertEqual(estado, 200)
        self.assertEqual(tarea, {"id": 1, "titulo": "Una", "completada": False})

    def test_completada_no_booleana_falla(self):
        self.pedir("POST", "/tareas", {"titulo": "Una"})
        estado, cuerpo = self.pedir("PATCH", "/tareas/1", {"completada": "no"})
        self.assertEqual(estado, 400)
        self.assertIn("error", cuerpo)
        self.assertFalse(self.pedir("GET", "/tareas")[1][0]["completada"])

    def test_filtrar_por_estado(self):
        for titulo in ("Una", "Dos", "Tres"):
            self.pedir("POST", "/tareas", {"titulo": titulo})
        self.pedir("PATCH", "/tareas/2")
        pendientes = self.pedir("GET", "/tareas?estado=pendientes")[1]
        completadas = self.pedir("GET", "/tareas?estado=completadas")[1]
        self.assertEqual([t["id"] for t in pendientes], [1, 3])
        self.assertEqual([t["id"] for t in completadas], [2])
        self.assertEqual(len(self.pedir("GET", "/tareas")[1]), 3)

    def test_filtro_invalido_falla(self):
        estado, cuerpo = self.pedir("GET", "/tareas?estado=todas")
        self.assertEqual(estado, 400)
        self.assertIn("error", cuerpo)

    def test_tarea_inexistente_da_404(self):
        self.assertEqual(self.pedir("PATCH", "/tareas/99")[0], 404)
        self.assertEqual(self.pedir("PATCH", "/tareas/99", {"titulo": "Otro"})[0], 404)
        self.assertEqual(self.pedir("DELETE", "/tareas/99")[0], 404)


if __name__ == "__main__":
    unittest.main()
