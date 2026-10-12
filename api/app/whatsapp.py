"""Reglas de WhatsApp para packs de stickers de terceros.

Salen de la documentación oficial (github.com/WhatsApp/stickers). WhatsApp
rechaza el pack completo si una sola regla falla, y en iOS no dice cuál; por
eso el servidor valida todo antes de ofrecer el botón de "Agregar".
"""

import base64
import hashlib
import math
import re
from pathlib import Path

from PIL import Image

STICKER_SIZE = 512
STATIC_MAX_BYTES = 100 * 1024
ANIMATED_MAX_BYTES = 500 * 1024
ANIMATED_MAX_DURATION_MS = 10_000
ANIMATED_MIN_FRAME_MS = 8
TRAY_SIZE = 96
TRAY_MAX_BYTES = 50 * 1024
MIN_STICKERS = 3
MAX_STICKERS = 30
MAX_EMOJIS = 3
MAX_TEXT = 128
PUBLISHER = "StickerBridge · ArmitaGG3"

_IDENTIFIER = re.compile(r"^[\w\-.,' ]+$")


def split_into_packs(items: list) -> list:
    """Reparte en packs de 3 a 30, lo más parejos posible.

    Con 31 stickers salen 16 + 15 y no 30 + 1, que WhatsApp rechazaría. Si el
    grupo entero tiene menos de 3, se repiten stickers hasta llegar al mínimo.
    """
    if not items:
        return []
    if len(items) < MIN_STICKERS:
        items = (items * MIN_STICKERS)[:MIN_STICKERS]
    parts = math.ceil(len(items) / MAX_STICKERS)
    base, extra = divmod(len(items), parts)
    packs, start = [], 0
    for i in range(parts):
        end = start + base + (1 if i < extra else 0)
        packs.append(items[start:end])
        start = end
    return packs


def pack_name(title: str, part: int, parts: int) -> str:
    suffix = f" ({part}/{parts})" if parts > 1 else ""
    return title[: MAX_TEXT - len(suffix)].strip() + suffix


def pack_identifier(key: str, part: int, sticker_ids: list) -> str:
    """Identificador del pack en WhatsApp, que cambia si cambia su contenido.

    WhatsApp reconoce los packs por identificador. Si el mismo identificador
    llegara con otros stickers (el pack de Telegram creció, o se repartió
    distinto), no queda claro si WhatsApp lo actualiza o lo ignora; con uno
    nuevo lo agrega como pack aparte.
    """
    digest = hashlib.sha1("\n".join(sticker_ids).encode()).hexdigest()[:6]
    return f"tg_{key}_{part}_{digest}"


def clean_title(text) -> str:
    """El nombre que escribió el usuario, en una línea y sin espacios de más.

    Vacío si no escribió nada que se vea: entonces se usa el de Telegram.
    """
    if not isinstance(text, str):
        return ""
    visible = "".join(ch if ch.isprintable() else " " for ch in text)
    return " ".join(visible.split())[:MAX_TEXT]


def renamed(pack: dict, title: str, part: int, parts: int) -> dict:
    """El pack con el nombre que eligió el usuario.

    También cambia el identificador, por la misma razón que pack_identifier:
    así WhatsApp lo agrega con el nombre nuevo en vez de quedarse con el viejo.
    """
    digest = hashlib.sha1(title.encode()).hexdigest()[:6]
    return {**pack, "name": pack_name(title, part, parts), "identifier": f"{pack['identifier']}_{digest}"}


def normalize_emojis(emoji) -> list:
    """WhatsApp pide de 1 a 3 emojis por sticker; Telegram da uno."""
    emojis = [e for e in ([emoji] if isinstance(emoji, str) else (emoji or [])) if e]
    return emojis[:MAX_EMOJIS] or ["🙂"]


def validate_pack(pack: dict, pack_dir: Path) -> list:
    """Devuelve la lista de problemas; vacía si WhatsApp debería aceptarlo."""
    problems = []
    for field in ("identifier", "name", "publisher"):
        value = pack.get(field) or ""
        if not value or len(value) > MAX_TEXT:
            problems.append(f"{field}: vacío o de más de {MAX_TEXT} caracteres")
    if pack.get("identifier") and not _IDENTIFIER.match(pack["identifier"]):
        problems.append("identifier: caracteres no permitidos")

    stickers = pack.get("stickers", [])
    if not MIN_STICKERS <= len(stickers) <= MAX_STICKERS:
        problems.append(f"el pack tiene {len(stickers)} stickers; WhatsApp acepta de {MIN_STICKERS} a {MAX_STICKERS}")

    problems += _validate_tray(pack_dir / pack["tray"])
    animated = bool(pack.get("animated"))
    for sticker in stickers:
        problems += [f"{sticker['file']}: {p}" for p in _validate_sticker(pack_dir / sticker["file"], animated)]
        if not 1 <= len(sticker.get("emojis", [])) <= MAX_EMOJIS:
            problems.append(f"{sticker['file']}: necesita de 1 a {MAX_EMOJIS} emojis")
    return problems


def _validate_tray(path: Path) -> list:
    if not path.exists():
        return ["falta el ícono de bandeja"]
    problems = []
    if path.stat().st_size > TRAY_MAX_BYTES:
        problems.append(f"ícono de bandeja pesa más de {TRAY_MAX_BYTES // 1024} KB")
    with Image.open(path) as im:
        if im.format != "PNG":
            problems.append("ícono de bandeja no es PNG")
        if im.size != (TRAY_SIZE, TRAY_SIZE):
            problems.append(f"ícono de bandeja mide {im.size}, debe ser {TRAY_SIZE}x{TRAY_SIZE}")
    return problems


def _validate_sticker(path: Path, animated: bool) -> list:
    if not path.exists():
        return ["no existe"]
    problems = []
    size = path.stat().st_size
    limit = ANIMATED_MAX_BYTES if animated else STATIC_MAX_BYTES
    if size > limit:
        problems.append(f"pesa {size // 1024} KB, el límite es {limit // 1024} KB")
    with Image.open(path) as im:
        if im.format != "WEBP":
            problems.append("no es WebP")
        if im.size != (STICKER_SIZE, STICKER_SIZE):
            problems.append(f"mide {im.size}, debe ser {STICKER_SIZE}x{STICKER_SIZE}")
        frames = getattr(im, "n_frames", 1)
        if animated and frames < 2:
            problems.append("es estático dentro de un pack animado")
        if not animated and frames > 1:
            problems.append("es animado dentro de un pack estático")
        if animated:
            total = 0
            for i in range(frames):
                im.seek(i)
                im.load()  # Pillow llena "duration" al decodificar el frame, no al moverse a él
                duration = im.info.get("duration", 0)
                if duration < ANIMATED_MIN_FRAME_MS:
                    problems.append(f"frame {i} dura {duration} ms, el mínimo es {ANIMATED_MIN_FRAME_MS}")
                    break
                total += duration
            if total > ANIMATED_MAX_DURATION_MS:
                problems.append(f"dura {total} ms, el máximo es {ANIMATED_MAX_DURATION_MS}")
    return problems


def ios_payload(pack: dict, pack_dir: Path) -> dict:
    """El JSON que WhatsApp para iPhone lee del portapapeles.

    Mismo formato que StickerPack.sendToWhatsApp() del ejemplo oficial de iOS:
    imágenes en base64, bandeja en PNG y stickers en WebP.
    """
    def b64(name: str) -> str:
        return base64.b64encode((pack_dir / name).read_bytes()).decode("ascii")

    return {
        "identifier": pack["identifier"],
        "name": pack["name"],
        "publisher": pack["publisher"],
        "tray_image": b64(pack["tray"]),
        "animated_sticker_pack": bool(pack["animated"]),
        "stickers": [{"image_data": b64(s["file"]), "emojis": s["emojis"]} for s in pack["stickers"]],
    }

