"""API de tareas: servidor HTTP mínimo con la librería estándar de Python.

Endpoints:
    GET    /tareas          -> lista todas las tareas
                               (?estado=pendientes o ?estado=completadas para filtrar)
    POST   /tareas          -> crea una tarea  (cuerpo: {"titulo": "..."})
    PATCH  /tareas/<id>     -> sin cuerpo, marca una tarea como completada;
                               con cuerpo {"titulo": "...", "completada": true|false}
                               (ambos opcionales) cambia esos campos
    DELETE /tareas/<id>     -> elimina una tarea

Variables de entorno opcionales:
    TAREAS_PUERTO   -> puerto (por defecto 8000; 0 = uno libre cualquiera)
    TAREAS_ARCHIVO  -> archivo JSON de datos (por defecto servidor/tareas.json)
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

PUERTO = int(os.environ.get("TAREAS_PUERTO", 8000))
ARCHIVO_DATOS = Path(os.environ.get("TAREAS_ARCHIVO", Path(__file__).parent / "tareas.json"))
FILTROS = {"pendientes": False, "completadas": True}


class Almacen:
    """Guarda las tareas en un archivo JSON."""

    def __init__(self, ruta: Path):
        self.ruta = ruta

    def leer(self) -> list[dict]:
        if not self.ruta.exists():
            return []
        return json.loads(self.ruta.read_text(encoding="utf-8"))

    def escribir(self, tareas: list[dict]) -> None:
        self.ruta.write_text(json.dumps(tareas, indent=2, ensure_ascii=False), encoding="utf-8")

    def crear(self, titulo: str) -> dict:
        tareas = self.leer()
        nuevo_id = max((t["id"] for t in tareas), default=0) + 1
        tarea = {"id": nuevo_id, "titulo": titulo, "completada": False}
        tareas.append(tarea)
        self.escribir(tareas)
        return tarea

    def actualizar(self, id_tarea: int, cambios: dict) -> dict | None:
        tareas = self.leer()
        for tarea in tareas:
            if tarea["id"] == id_tarea:
                tarea.update(cambios)
                self.escribir(tareas)
                return tarea
        return None

    def eliminar(self, id_tarea: int) -> bool:
        tareas = self.leer()
        restantes = [t for t in tareas if t["id"] != id_tarea]
        if len(restantes) == len(tareas):
            return False
        self.escribir(restantes)
        return True


def crear_manejador(almacen: Almacen):
    """Devuelve una clase de manejador HTTP que usa el almacén dado."""

    class Manejador(BaseHTTPRequestHandler):
        def _responder(self, estado: int, cuerpo=None) -> None:
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8") if cuerpo is not None else b""
            self.send_response(estado)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def _id_de_ruta(self) -> int | None:
            partes = self.path.strip("/").split("/")
            if len(partes) == 2 and partes[0] == "tareas" and partes[1].isdigit():
                return int(partes[1])
            return None

        def _leer_cuerpo(self) -> dict | None:
            """Devuelve el cuerpo JSON como diccionario ({} si viene vacío) o None si no es válido."""
            largo = int(self.headers.get("Content-Length", 0))
            try:
                cuerpo = json.loads(self.rfile.read(largo) or b"{}")
            except json.JSONDecodeError:
                return None
            return cuerpo if isinstance(cuerpo, dict) else None

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path != "/tareas":
                return self._responder(404, {"error": "Ruta no encontrada"})
            tareas = almacen.leer()
            estado = parse_qs(url.query).get("estado", [None])[0]
            if estado is not None:
                if estado not in FILTROS:
                    return self._responder(400, {"error": "El filtro 'estado' debe ser 'pendientes' o 'completadas'"})
                tareas = [t for t in tareas if t["completada"] == FILTROS[estado]]
            self._responder(200, tareas)

        def do_POST(self):
            if self.path != "/tareas":
                return self._responder(404, {"error": "Ruta no encontrada"})
            cuerpo = self._leer_cuerpo()
            if cuerpo is None:
                return self._responder(400, {"error": "JSON inválido"})
            titulo = str(cuerpo.get("titulo", "")).strip()
            if not titulo:
                return self._responder(400, {"error": "El campo 'titulo' es obligatorio"})
            self._responder(201, almacen.crear(titulo))

        def do_PATCH(self):
            id_tarea = self._id_de_ruta()
            if id_tarea is None:
                return self._responder(404, {"error": "Tarea no encontrada"})
            cuerpo = self._leer_cuerpo()
            if cuerpo is None:
                return self._responder(400, {"error": "JSON inválido"})
            cambios = {}
            if "titulo" in cuerpo:
                titulo = str(cuerpo["titulo"]).strip()
                if not titulo:
                    return self._responder(400, {"error": "El campo 'titulo' no puede estar vacío"})
                cambios["titulo"] = titulo
            if "completada" in cuerpo:
                if not isinstance(cuerpo["completada"], bool):
                    return self._responder(400, {"error": "El campo 'completada' debe ser true o false"})
                cambios["completada"] = cuerpo["completada"]
            if not cambios:
                cambios["completada"] = True  # sin cuerpo: completar, como siempre
            tarea = almacen.actualizar(id_tarea, cambios)
            if tarea is None:
                return self._responder(404, {"error": "Tarea no encontrada"})
            self._responder(200, tarea)

        def do_DELETE(self):
            id_tarea = self._id_de_ruta()
            if id_tarea is None or not almacen.eliminar(id_tarea):
                return self._responder(404, {"error": "Tarea no encontrada"})
            self._responder(204)

        def log_message(self, formato, *args):
            print(f"[servidor] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

    return Manejador


def main() -> None:
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), crear_manejador(Almacen(ARCHIVO_DATOS)))
    puerto = servidor.server_address[1]  # el real, por si PUERTO era 0
    print(f"Servidor de tareas escuchando en http://127.0.0.1:{puerto}  (Ctrl+C para detener)", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
