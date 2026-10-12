"""Importar: del link de compartir de Telegram a packs listos para WhatsApp.

Flujo de un trabajo (uno por pack de Telegram, identificado por su nombre):
  1. getStickerSet con el token del bot.
  2. Descarga de todos los archivos, en paralelo.
  3. Conversión de cada sticker en un proceso aparte (usa CPU, no red).
  4. Separación estáticos/animados, reparto en packs de 3 a 30, ícono de
     bandeja y validación contra las reglas de WhatsApp.

El resultado queda en disco (result.json) y se reutiliza mientras no caduque,
así que abrir el mismo link dos veces no vuelve a convertir nada.
"""

import json
import logging
import multiprocessing
import re
import shutil
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from . import stickers, telegram, whatsapp
from .storage import cleanup_expired

log = logging.getLogger("uvicorn.error")


class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str = ""
    PACKS_DIR: str = "/data/packs"
    PACK_TTL_HOURS: int = 24
    CONVERT_WORKERS: Optional[int] = None  # None = uno por núcleo

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

_SAFE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_DOWNLOAD_THREADS = 8


class Job:
    def __init__(self, name: str):
        self.name = name
        self.status = "queued"  # queued | downloading | converting | done | error
        self.done = 0
        self.total = 0
        self.error: Optional[str] = None
        self.result: Optional[dict] = None

    def snapshot(self) -> dict:
        return {
            "name": self.name,
            "status": self.status,
            "done": self.done,
            "total": self.total,
            "error": self.error,
            "result": self.result,
        }


class Importer:
    def __init__(self, root: Path, token: str, ttl_hours: int, workers: Optional[int]):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._token = token
        self._ttl_hours = ttl_hours
        self._workers = workers
        self._jobs: dict = {}
        self._lock = threading.Lock()
        self._runner = ThreadPoolExecutor(max_workers=2, thread_name_prefix="import")
        self._pool: Optional[ProcessPoolExecutor] = None

    # -- API pública ------------------------------------------------------------

    def start(self, name: str) -> Job:
        key = name.lower()
        with self._lock:
            job = self._jobs.get(key) or self._from_disk(key)
            if job and job.status != "error" and (job.status != "done" or self._fresh(key)):
                return job
            job = Job(name)
            self._jobs[key] = job
        self._runner.submit(self._run, job, key)
        return job

    def get(self, name: str) -> Optional[Job]:
        key = name.lower()
        with self._lock:
            job = self._jobs.get(key) or self._from_disk(key)
            if job and job.status == "done" and not self._fresh(key):
                job = None  # caducó: el pack de Telegram pudo cambiar desde entonces
            if job:
                self._jobs[key] = job
            else:
                self._jobs.pop(key, None)
            return job

    def pack_dir(self, name: str, identifier: str) -> Path:
        return self.root / name.lower() / identifier

    # -- Trabajo ------------------------------------------------------------------

    def _result_path(self, key: str) -> Path:
        return self.root / key / "result.json"

    def _fresh(self, key: str) -> bool:
        """Si hay resultado y no caducó.

        La limpieza de carpetas viejas sólo corre al empezar otra importación,
        así que la caducidad se revisa aquí también.
        """
        try:
            age = time.time() - self._result_path(key).stat().st_mtime
        except FileNotFoundError:
            return False
        return age < self._ttl_hours * 3600

    def _from_disk(self, key: str) -> Optional[Job]:
        path = self._result_path(key)
        if not self._fresh(key):
            return None
        result = json.loads(path.read_text(encoding="utf-8"))
        job = Job(result["name"])
        job.status, job.result = "done", result
        job.done = job.total = result["total"]
        return job

    def _process_pool(self) -> ProcessPoolExecutor:
        if self._pool is None:
            # spawn y no fork: el proceso del servidor ya tiene hilos corriendo.
            self._pool = ProcessPoolExecutor(max_workers=self._workers, mp_context=multiprocessing.get_context("spawn"))
        return self._pool

    def _run(self, job: Job, key: str) -> None:
        started = time.monotonic()
        try:
            cleanup_expired(str(self.root), self._ttl_hours)
            api = telegram.BotApi(self._token)
            source = api.get_sticker_set(job.name)
            if not source.stickers:
                raise telegram.TelegramError("Ese pack no tiene stickers.")
            job.name = source.name

            work = self.root / key
            shutil.rmtree(work, ignore_errors=True)
            source_dir, out_dir = work / "source", work / "out"
            source_dir.mkdir(parents=True)
            out_dir.mkdir()

            downloaded = self._download(job, api, source.stickers, source_dir)
            converted = self._convert(job, downloaded, source_dir, out_dir)
            if not converted:
                raise ValueError("no se pudo convertir ningún sticker")

            result = self._assemble(key, source, converted, out_dir, work)
            self._result_path(key).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            shutil.rmtree(source_dir, ignore_errors=True)
            shutil.rmtree(out_dir, ignore_errors=True)

            job.result, job.status = result, "done"
            log.info("Import: Set=%s Stickers=%d Packs=%d Skipped=%d Dur=%dms", source.name, result["total"],
                     len(result["packs"]), result["skipped"], (time.monotonic() - started) * 1000)
        except telegram.TelegramError as e:
            job.error, job.status = str(e), "error"
        except Exception:
            log.exception("Import falló: %s", job.name)
            job.error, job.status = "Algo falló al convertir el pack. Intenta de nuevo.", "error"

    def _download(self, job: Job, api: telegram.BotApi, items: list, source_dir: Path) -> list:
        job.status, job.done, job.total = "downloading", 0, len(items)
        ok = []
        with ThreadPoolExecutor(max_workers=_DOWNLOAD_THREADS) as pool:
            futures = {pool.submit(api.download, s.file_id, source_dir / f"{s.index:03d}.{s.extension}"): s for s in items}
            for future in as_completed(futures):
                try:
                    future.result()
                    ok.append(futures[future])
                except telegram.TelegramError as e:
                    log.warning("Descarga falló: %s #%d: %s", job.name, futures[future].index, e)
                job.done += 1
        if not ok:
            raise telegram.TelegramError("No se pudo descargar ningún sticker del pack.")
        return sorted(ok, key=lambda s: s.index)

    def _convert(self, job: Job, items: list, source_dir: Path, out_dir: Path) -> dict:
        job.status, job.done = "converting", 0
        converted = {}
        pool = self._process_pool()
        # WhatsApp no mezcla estáticos y animados en un pack. Si hay animados,
        # los estáticos se guardan como animados y van todos juntos: menos
        # packs, y ninguno con un estático suelto repetido hasta llegar a 3.
        mixed = any(s.kind != "static" for s in items)
        futures = {
            pool.submit(stickers.convert, "static_animated" if mixed and s.kind == "static" else s.kind,
                        str(source_dir / f"{s.index:03d}.{s.extension}"), str(out_dir / f"{s.index:03d}.webp")): s
            for s in items
        }
        for future in as_completed(futures):
            sticker = futures[future]
            try:
                converted[sticker.index] = (sticker, future.result())
            except Exception as e:
                log.warning("Conversión falló: %s #%d (%s): %s", job.name, sticker.index, sticker.kind, e)
            job.done += 1
        return converted

    def _assemble(self, key: str, source: telegram.SourceSet, converted: dict, out_dir: Path, work: Path) -> dict:
        ordered = [converted[i] for i in sorted(converted)]
        # WhatsApp no deja mezclar estáticos y animados en un mismo pack. Con
        # los estáticos ya convertidos a animados (ver _convert), sólo queda un
        # grupo; los dos aparecen si un animado falla y los estáticos no.
        groups = [
            (False, [s for s, info in ordered if not info["animated"]]),
            (True, [s for s, info in ordered if info["animated"]]),
        ]
        chunks = [(animated, chunk) for animated, group in groups for chunk in whatsapp.split_into_packs(group)]

        packs = []
        for n, (animated, chunk) in enumerate(chunks, start=1):
            identifier = whatsapp.pack_identifier(key, n, [s.unique_id for s in chunk])
            pack_dir = work / identifier
            pack_dir.mkdir()
            items = []
            for pos, sticker in enumerate(chunk, start=1):
                file_name = f"{pos:02d}.webp"
                shutil.copyfile(out_dir / f"{sticker.index:03d}.webp", pack_dir / file_name)
                items.append({"file": file_name, "emojis": whatsapp.normalize_emojis(sticker.emoji)})
            stickers.make_tray(pack_dir / items[0]["file"], pack_dir / "tray.png")

            pack = {
                "identifier": identifier,
                "name": whatsapp.pack_name(source.title, n, len(chunks)),
                "publisher": whatsapp.PUBLISHER,
                "animated": animated,
                "tray": "tray.png",
                "url": f"/files/{key}/{identifier}",
                "stickers": items,
            }
            pack["problems"] = whatsapp.validate_pack(pack, pack_dir)
            if pack["problems"]:
                log.warning("Pack inválido %s: %s", identifier, pack["problems"])
            packs.append(pack)

        return {
            "name": source.name,
            "title": source.title,
            "link": f"https://t.me/addstickers/{source.name}",
            "total": len(source.stickers),
            "converted": len(converted),
            "skipped": len(source.stickers) - len(converted),
            "packs": packs,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }


importer = Importer(Path(settings.PACKS_DIR), settings.TELEGRAM_BOT_TOKEN, settings.PACK_TTL_HOURS,
                    settings.CONVERT_WORKERS)

router = APIRouter(prefix="/v1")


class ImportRequest(BaseModel):
    link: str


def _job_or_404(name: str) -> Job:
    job = importer.get(name) if _SAFE_NAME.match(name) else None
    if job is None:
        raise HTTPException(status_code=404, detail="No hay ninguna importación de ese pack.")
    return job


@router.post("/imports")
def create_import(req: ImportRequest):
    name = telegram.parse_set_name(req.link)
    if not name:
        raise HTTPException(
            status_code=400,
            detail="Ese link no es de un pack de stickers. En Telegram abre el pack, toca Compartir y copia el enlace.",
        )
    return importer.start(name).snapshot()


@router.get("/imports/{name}")
def get_import(name: str):
    return _job_or_404(name).snapshot()


@router.get("/imports/{name}/packs/{identifier}/whatsapp")
def whatsapp_payload(name: str, identifier: str, title: Optional[str] = Query(None, max_length=500)):
    """El pack listo para WhatsApp; `title` es el nombre que eligió el usuario."""
    job = _job_or_404(name)
    if job.status != "done":
        raise HTTPException(status_code=409, detail="El pack todavía se está convirtiendo.")
    packs = job.result["packs"]
    pack = next((p for p in packs if p["identifier"] == identifier), None)
    if pack is None:
        raise HTTPException(status_code=404, detail="Ese pack no existe. Vuelve a abrir el link para convertirlo de nuevo.")
    if pack["problems"]:
        raise HTTPException(status_code=422, detail="WhatsApp rechazaría este pack: " + "; ".join(pack["problems"]))
    pack_dir = importer.pack_dir(name, identifier)
    title = whatsapp.clean_title(title)
    if title:
        pack = whatsapp.renamed(pack, title, packs.index(pack) + 1, len(packs))
    return whatsapp.ios_payload(pack, pack_dir)
