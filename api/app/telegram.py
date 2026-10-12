"""Lado Telegram: leer el link de compartir y bajar el pack con la Bot API.

El token del bot vive solo en el servidor. Ningún mensaje de error que salga de
aquí incluye la URL de la petición, porque en la Bot API el token va en la URL.
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

API = "https://api.telegram.org"

# Telegram exige que el nombre empiece con letra; luego letras, dígitos y "_".
_SET_NAME = r"([A-Za-z][A-Za-z0-9_]{0,63})"
_LINK_PATTERNS = [
    # https://t.me/addstickers/Nombre (también telegram.me y telegram.dog)
    re.compile(r"(?:t\.me|telegram\.me|telegram\.dog)/(?:addstickers|addemoji)/" + _SET_NAME, re.I),
    # tg://addstickers?set=Nombre
    re.compile(r"tg://(?:addstickers|addemoji)\?set=" + _SET_NAME, re.I),
]


def parse_set_name(text: Optional[str]) -> Optional[str]:
    """Saca el nombre del pack de lo que Telegram pone al darle "Copiar enlace".

    Busca el link dentro del texto, así que también funciona si el usuario pega
    un mensaje completo que lo contenga.
    """
    if not text:
        return None
    for pattern in _LINK_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


class TelegramError(Exception):
    """Error que se le puede mostrar al usuario tal cual."""


class StickerSetNotFound(TelegramError):
    pass


@dataclass
class SourceSticker:
    index: int
    file_id: str
    unique_id: str
    kind: str  # "static" | "video" | "lottie"
    emoji: Optional[str]

    @property
    def extension(self) -> str:
        return {"static": "webp", "video": "webm", "lottie": "tgs"}[self.kind]


@dataclass
class SourceSet:
    name: str
    title: str
    stickers: list


def _kind(sticker: dict) -> str:
    if sticker.get("is_video"):
        return "video"
    if sticker.get("is_animated"):
        return "lottie"
    return "static"


class BotApi:
    def __init__(self, token: str, http: Optional[httpx.Client] = None):
        if not token:
            raise TelegramError("Falta TELEGRAM_BOT_TOKEN en el servidor.")
        self._token = token
        self._http = http or httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))

    def _call(self, method: str, **params) -> dict:
        try:
            resp = self._http.get(f"{API}/bot{self._token}/{method}", params=params)
        except httpx.HTTPError as e:
            raise TelegramError(f"No se pudo contactar a Telegram ({type(e).__name__}).") from None
        try:
            data = resp.json()
        except ValueError:
            raise TelegramError(f"Telegram respondió algo inesperado (HTTP {resp.status_code}).") from None
        if not data.get("ok"):
            description = data.get("description", "")
            if resp.status_code == 401:
                raise TelegramError("El token del bot de Telegram no es válido.")
            if "STICKERSET_INVALID" in description:
                raise StickerSetNotFound("Ese pack no existe o fue borrado en Telegram.")
            raise TelegramError(f"Telegram rechazó la petición: {description or resp.status_code}")
        return data["result"]

    def get_sticker_set(self, name: str) -> SourceSet:
        result = self._call("getStickerSet", name=name)
        stickers = [
            SourceSticker(
                index=i,
                file_id=s["file_id"],
                unique_id=s["file_unique_id"],
                kind=_kind(s),
                emoji=s.get("emoji"),
            )
            for i, s in enumerate(result.get("stickers", []))
        ]
        return SourceSet(name=result["name"], title=result.get("title") or result["name"], stickers=stickers)

    def download(self, file_id: str, dest: Path) -> None:
        file_path = self._call("getFile", file_id=file_id)["file_path"]
        try:
            with self._http.stream("GET", f"{API}/file/bot{self._token}/{file_path}") as resp:
                if resp.status_code != 200:
                    raise TelegramError(f"No se pudo descargar un sticker (HTTP {resp.status_code}).")
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as out:
                    for chunk in resp.iter_bytes():
                        out.write(chunk)
                tmp.replace(dest)
        except httpx.HTTPError as e:
            raise TelegramError(f"Se cortó la descarga de un sticker ({type(e).__name__}).") from None
