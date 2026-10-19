"""Serve SportPredict's frontend and its local JSON API from one origin."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from urllib.parse import urlsplit

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from sportpredict.service import Service

ROOT = Path(__file__).parent
service = Service()
logger = logging.getLogger("sportpredict")


def perform(operation, *args):
    with service.lock:
        try:
            return JSONResponse(operation(*args))
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            return JSONResponse({"error": str(error)}, status_code=400)
        except Exception:
            logger.exception("Application request failed")
            return JSONResponse({"error": "No se pudo completar la operación. Revisa el registro del servidor."}, status_code=500)


async def api(request: Request):
    name = request.path_params["name"]
    ident = request.path_params.get("ident")
    method = request.method
    if method == "GET":
        operations = {"bootstrap": service.bootstrap, "profile": service.profile,
                      "statistics": service.statistics, "history": service.history,
                      "fixtures": service.fixtures, "health": lambda: {"status": "ok"}}
        if name == "matches":
            try:
                limit = min(100, max(1, int(request.query_params.get("limit", 12))))
                offset = max(0, int(request.query_params.get("offset", 0)))
            except ValueError:
                return JSONResponse({"error": "Paginación inválida."}, 400)
            return await run_in_threadpool(perform, service.matches,
                                          request.query_params.get("search", ""),
                                          request.query_params.get("team", ""), limit, offset)
        if name == "dataset":
            with service.lock:
                content = service.frame.drop(columns=["id"]).to_csv(index=False, date_format="%Y-%m-%d")
            return Response(content, media_type="text/csv",
                            headers={"Content-Disposition": 'attachment; filename="sportpredict.csv"'})
        if name in operations:
            return await run_in_threadpool(perform, operations[name])
    if method in {"POST", "PUT"}:
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 5 * 1024 * 1024:
                return JSONResponse({"error": "Tamaño máximo: 5 MB."}, 413)
        if name == "dataset" and method == "POST":
            return await run_in_threadpool(perform, service.import_data, bytes(raw), request.query_params.get("name", "datos.csv"))
        try:
            body = json.loads(raw or b"{}")
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            return JSONResponse({"error": "El cuerpo de la solicitud no es válido."}, 400)
        operations = {"predict": service.predict, "save": service.save_prediction,
                      "profile": service.update_profile, "fixtures": service.add_fixture}
        if name == "result" and ident:
            return await run_in_threadpool(perform, service.record_result, ident, body)
        if name in operations:
            return await run_in_threadpool(perform, operations[name], body)
    if method == "DELETE" and name == "history" and ident:
        return await run_in_threadpool(perform, service.delete_prediction, ident)
    return JSONResponse({"error": "Ruta no encontrada."}, 404)


class LocalOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
            if urlsplit(origin).netloc != request.headers.get("host"):
                return JSONResponse({"error": "Origen no permitido."}, 403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


app = Starlette(routes=[
    Route("/api/{name}", api, methods=["GET", "POST", "PUT", "DELETE"]),
    Route("/api/{name}/{ident}", api, methods=["GET", "POST", "PUT", "DELETE"]),
    Mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend"),
])
app.add_middleware(LocalOriginMiddleware)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
