FROM python:3.11-slim

# FFmpeg con libvpx: lee los stickers de video (VP9) sin perder la transparencia.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sólo en desarrollo y en CI: herramientas de pruebas.
ARG DEV=0
RUN if [ "$DEV" = "1" ]; then pip install --no-cache-dir pytest; fi

COPY ./app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
