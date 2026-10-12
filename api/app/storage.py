import os
import shutil
import time


def cleanup_expired(directory: str, ttl_hours: int) -> None:
    """Borra lo que hay en `directory` (archivos o carpetas) con más de `ttl_hours`."""
    if not os.path.exists(directory):
        return
    limit = time.time() - ttl_hours * 3600
    for item in os.listdir(directory):
        path = os.path.join(directory, item)
        if os.path.getmtime(path) < limit:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
            else:
                os.remove(path)
