"""API de StickerBridge: packs de stickers de Telegram listos para WhatsApp.

La conversión y sus rutas están en imports.py; aquí sólo se arma la app.
"""

import mimetypes
import shutil
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import imports

app = FastAPI(title="StickerBridge API")
app.include_router(imports.router)

# Los stickers convertidos se sirven tal cual para la vista previa de la app.
# Python 3.11 no conoce .webp y los serviría como application/octet-stream.
mimetypes.add_type("image/webp", ".webp")
app.mount("/files", StaticFiles(directory=imports.settings.PACKS_DIR), name="files")

# La versión web de la app (expo start --web) corre en otro puerto.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/health")
def health():
    disk = shutil.disk_usage(imports.settings.PACKS_DIR)
    return {"ok": True, "diskFreeMB": disk.free // (1024 * 1024), "timestamp": datetime.now().isoformat()}
