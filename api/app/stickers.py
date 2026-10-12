"""Conversión de un sticker de Telegram al formato que WhatsApp acepta.

Telegram tiene tres tipos y WhatsApp solo entiende WebP de 512x512:

- estático (.webp): se centra en el lienzo y se comprime hasta caber en 100 KB.
  Si el pack también trae animados, se guarda como animado de dos frames para
  que todos vayan juntos (convert_static_animated).
- video (.webm VP9 con transparencia): se decodifica con ffmpeg y se reencoda
  como WebP animado de hasta 500 KB.
- animado (.tgs, Lottie comprimido): se renderiza con rlottie y se reencoda
  igual que el video.

Cada función corre en un proceso aparte (ver imports.py), así que no comparten
estado y solo reciben y devuelven cosas serializables.
"""

import io
import math
import subprocess
from pathlib import Path

from PIL import Image

from . import whatsapp

CANVAS = whatsapp.STICKER_SIZE

# Escalones (fps, calidad, calidad del canal alfa, peso relativo), del que
# mejor se ve al que menos pesa; se usa el primero que quepa en 500 KB.
# Medido con packs reales: el peso es casi proporcional al número de frames;
# bajar la calidad de color ahorra poco y bajar la del alfa ahorra mucho,
# porque WebP lo guarda sin pérdida si no se le dice otra cosa. El peso
# relativo (1.0 = calidad 70 con alfa sin pérdida) sale de esas mediciones y
# sirve para estimar qué escalón cabe sin tener que probarlos todos.
_ANIMATED_LADDER = [
    (24, 80, 80, 1.10), (20, 70, 60, 0.88), (20, 60, 40, 0.70), (16, 60, 40, 0.70),
    (15, 50, 30, 0.585), (12, 50, 30, 0.585), (12, 40, 20, 0.50), (10, 40, 20, 0.50),
    (10, 30, 10, 0.42), (8, 30, 10, 0.42), (6, 20, 5, 0.37),
]
_STATIC_QUALITIES = [95, 85, 75, 60, 45, 30, 15]
# Tasa a la que se decodifica el video una sola vez; los escalones submuestrean.
_VIDEO_DECODE_FPS = 30


def fit_canvas(image: Image.Image, scale: float = 1.0) -> Image.Image:
    """Centra la imagen en un lienzo transparente de 512x512 sin deformarla."""
    image = image.convert("RGBA")
    box = int(CANVAS * scale)
    ratio = min(box / image.width, box / image.height)
    size = (max(1, round(image.width * ratio)), max(1, round(image.height * ratio)))
    if size != image.size:
        image = image.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(image, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2), image)
    return canvas


# -- Estáticos ----------------------------------------------------------------

def convert_static(src: Path, dst: Path) -> dict:
    with Image.open(src) as im:
        frame = fit_canvas(im)

    # Lossless primero: en ilustraciones planas suele pesar menos y se ve perfecto.
    data = _encode_still(frame, lossless=True)
    if len(data) > whatsapp.STATIC_MAX_BYTES:
        for quality in _STATIC_QUALITIES:
            data = _encode_still(frame, quality=quality)
            if len(data) <= whatsapp.STATIC_MAX_BYTES:
                break
        else:
            raise ValueError("No se pudo comprimir el sticker estático a 100 KB.")

    dst.write_bytes(data)
    return {"animated": False, "bytes": len(data), "frames": 1}


def _encode_still(frame: Image.Image, quality: int = 100, lossless: bool = False) -> bytes:
    buf = io.BytesIO()
    # method=4 y no 6: con stickers reales pesa lo mismo (±1 KB) y tarda 0.04 s
    # en vez de casi 4 s por sticker.
    frame.save(buf, format="WEBP", lossless=lossless, quality=quality, method=4)
    return buf.getvalue()


# -- Animados -----------------------------------------------------------------

class _VideoFrames:
    """Frames de un .webm ya decodificados a 30 fps y ajustados al lienzo."""

    def __init__(self, src: Path):
        self.frames = _decode_video(src)
        self.duration_ms = len(self.frames) * 1000 / _VIDEO_DECODE_FPS

    def at(self, t_ms: float) -> Image.Image:
        i = min(int(t_ms * _VIDEO_DECODE_FPS / 1000), len(self.frames) - 1)
        return self.frames[i]


def _decode_video(src: Path) -> list:
    size = CANVAS * CANVAS * 4
    filters = (
        f"fps={_VIDEO_DECODE_FPS},"
        f"scale={CANVAS}:{CANVAS}:force_original_aspect_ratio=decrease:flags=lanczos,"
        "format=rgba,"
        f"pad={CANVAS}:{CANVAS}:(ow-iw)/2:(oh-ih)/2:color=0x00000000"
    )
    max_seconds = str(whatsapp.ANIMATED_MAX_DURATION_MS / 1000)
    # El decodificador nativo de VP9 en ffmpeg tira el canal alfa; libvpx lo
    # conserva. Si el archivo no es VP9, se reintenta con el decodificador por defecto.
    for decoder in (["-c:v", "libvpx-vp9"], []):
        cmd = ["ffmpeg", "-v", "error", *decoder, "-i", str(src), "-t", max_seconds,
               "-vf", filters, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode == 0 and len(proc.stdout) >= size:
            raw = proc.stdout
            return [Image.frombuffer("RGBA", (CANVAS, CANVAS), raw[i:i + size], "raw", "RGBA", 0, 1)
                    for i in range(0, len(raw) - size + 1, size)]
    raise ValueError(f"ffmpeg no pudo leer el video: {proc.stderr.decode(errors='replace')[-300:]}")


class _LottieFrames:
    """Frames de un .tgs, renderizados bajo demanda y cacheados."""

    def __init__(self, src: Path):
        from rlottie_python import LottieAnimation  # import local: solo lo usan los procesos de conversión

        self.anim = LottieAnimation.from_tgs(str(src))
        self.total = self.anim.lottie_animation_get_totalframe()
        self.fps = self.anim.lottie_animation_get_framerate() or 60
        self.duration_ms = min(self.total * 1000 / self.fps, whatsapp.ANIMATED_MAX_DURATION_MS)
        self._cache = {}

    def at(self, t_ms: float) -> Image.Image:
        i = min(int(t_ms * self.fps / 1000), self.total - 1)
        if i not in self._cache:
            self._cache[i] = fit_canvas(self.anim.render_pillow_frame(frame_num=i, width=CANVAS, height=CANVAS))
        return self._cache[i]


def convert_video(src: Path, dst: Path) -> dict:
    return _convert_animated(_VideoFrames(src), dst)


def convert_lottie(src: Path, dst: Path) -> dict:
    return _convert_animated(_LottieFrames(src), dst)


def _sample(source, fps: int, scale: float = 1.0):
    """Frames y duraciones a una tasa dada, conservando la duración total."""
    count = max(1, math.ceil(source.duration_ms * fps / 1000))
    frames, durations = [], []
    elapsed = 0
    for n in range(count):
        frame = source.at(n * 1000 / fps)
        if scale != 1.0:
            frame = fit_canvas(frame, scale)
        # Duraciones enteras que suman exactamente la duración real.
        end = round((n + 1) * 1000 / fps)
        frames.append(frame)
        durations.append(max(whatsapp.ANIMATED_MIN_FRAME_MS, end - elapsed))
        elapsed = end
    if len(frames) == 1:
        # WhatsApp distingue animado de estático por el número de frames.
        frames.append(_distinct_copy(frames[0]))
        durations = [max(whatsapp.ANIMATED_MIN_FRAME_MS, durations[0] // 2)] * 2
    return frames, durations


def _distinct_copy(frame: Image.Image) -> Image.Image:
    """Una copia del frame que el codificador no funda con el original.

    libwebp junta los frames idénticos en uno solo, y con un frame WhatsApp lo
    toma como estático. Un píxel de la esquina con alfa 1 (o 0, si la esquina
    es opaca) no se ve, pero sobrevive a cualquier calidad de compresión.
    """
    copy = frame.copy()
    r, g, b, a = copy.getpixel((0, 0))
    copy.putpixel((0, 0), (r, g, b, 1 if a == 0 else 0))
    return copy


def _encode_animation(frames: list, durations: list, quality: int, alpha_quality: int,
                      lossless: bool = False) -> bytes:
    buf = io.BytesIO()
    # kmin=kmax=0: sin keyframes forzados. Mismo peso y ~35 % más rápido; un
    # sticker se reproduce de corrido, nunca se salta a la mitad.
    frames[0].save(buf, format="WEBP", save_all=True, append_images=frames[1:], duration=durations, loop=0,
                   quality=quality, alpha_quality=alpha_quality, lossless=lossless, method=4, kmin=0, kmax=0)
    return buf.getvalue()


def _next_step(step: int, size: int) -> int:
    """El siguiente escalón que, por estimación, debería caber.

    Así un sticker pesado brinca directo a donde cabe en vez de reencodarse en
    cada escalón intermedio. Si la estimación se queda corta, el siguiente
    intento vuelve a estimar desde ahí.
    """
    fps, _, _, weight = _ANIMATED_LADDER[step]
    for candidate in range(step + 1, len(_ANIMATED_LADDER)):
        c_fps, _, _, c_weight = _ANIMATED_LADDER[candidate]
        if size * (c_fps / fps) * (c_weight / weight) <= whatsapp.ANIMATED_MAX_BYTES * 0.95:
            return candidate
    return len(_ANIMATED_LADDER) - 1 if step < len(_ANIMATED_LADDER) - 1 else len(_ANIMATED_LADDER)


def _convert_animated(source, dst: Path) -> dict:
    step, attempts = 0, 0
    while step < len(_ANIMATED_LADDER):
        fps, quality, alpha_quality, _ = _ANIMATED_LADDER[step]
        frames, durations = _sample(source, fps)
        data = _encode_animation(frames, durations, quality, alpha_quality)
        attempts += 1
        if len(data) <= whatsapp.ANIMATED_MAX_BYTES:
            dst.write_bytes(data)
            return {"animated": True, "bytes": len(data), "frames": len(frames), "fps": fps,
                    "quality": quality, "attempts": attempts}
        step = _next_step(step, len(data))

    # Último recurso: el dibujo un poco más chico dentro del lienzo pesa menos.
    fps, quality, alpha_quality, _ = _ANIMATED_LADDER[-1]
    for scale in (0.85, 0.7):
        frames, durations = _sample(source, fps, scale)
        data = _encode_animation(frames, durations, quality, alpha_quality)
        if len(data) <= whatsapp.ANIMATED_MAX_BYTES:
            dst.write_bytes(data)
            return {"animated": True, "bytes": len(data), "frames": len(frames), "fps": fps,
                    "quality": quality, "attempts": attempts + 1}
    raise ValueError("No se pudo comprimir el sticker animado a 500 KB.")


def convert_static_animated(src: Path, dst: Path) -> dict:
    """Un estático que va en un pack animado: el mismo dibujo en dos frames.

    WhatsApp no mezcla estáticos y animados en un pack. Si el de Telegram trae
    de los dos, así caben todos juntos, en menos packs y sin repetir stickers;
    en WhatsApp se ve igual que un estático.
    """
    with Image.open(src) as im:
        frame = fit_canvas(im)
    frames, durations = [frame, _distinct_copy(frame)], [1000, 1000]

    data = _encode_animation(frames, durations, quality=100, alpha_quality=100, lossless=True)
    for _, quality, alpha_quality, _ in _ANIMATED_LADDER:
        if len(data) <= whatsapp.ANIMATED_MAX_BYTES:
            break
        data = _encode_animation(frames, durations, quality, alpha_quality)
    if len(data) > whatsapp.ANIMATED_MAX_BYTES:
        raise ValueError("No se pudo comprimir el sticker a 500 KB.")

    dst.write_bytes(data)
    return {"animated": True, "bytes": len(data), "frames": len(frames)}


# -- Punto de entrada para el pool de procesos ---------------------------------

CONVERTERS = {
    "static": convert_static,
    "static_animated": convert_static_animated,
    "video": convert_video,
    "lottie": convert_lottie,
}


def convert(kind: str, src: str, dst: str) -> dict:
    return CONVERTERS[kind](Path(src), Path(dst))


def make_tray(first_sticker: Path, dst: Path) -> None:
    """Ícono de la bandeja de WhatsApp: 96x96 PNG, del primer frame del primer sticker."""
    with Image.open(first_sticker) as im:
        im.seek(0)
        frame = im.convert("RGBA")
    bbox = frame.getchannel("A").getbbox()
    if bbox:
        frame = frame.crop(bbox)
    size = whatsapp.TRAY_SIZE
    ratio = min(size / frame.width, size / frame.height)
    frame = frame.resize((max(1, round(frame.width * ratio)), max(1, round(frame.height * ratio))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(frame, ((size - frame.width) // 2, (size - frame.height) // 2), frame)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    if buf.tell() > whatsapp.TRAY_MAX_BYTES:
        buf = io.BytesIO()
        canvas.quantize(colors=128).save(buf, format="PNG", optimize=True)
    dst.write_bytes(buf.getvalue())
