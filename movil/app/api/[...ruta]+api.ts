/**
 * Puente hacia el servidor de conversión (api/ en la raíz del repo).
 *
 * El iPhone no habla directo con el puerto 8000 de la PC: habla con Metro, el
 * mismo servidor que le entrega la app, y Metro reenvía aquí. Así funciona
 * igual por la red local que con `expo start --tunnel`, y no hay que abrir
 * otro puerto en el firewall.
 */

const DESTINO = (process.env.STICKERBRIDGE_API ?? 'http://localhost:8000').replace(/\/+$/, '');

// Lo que sirve para cachear imágenes; el resto (longitud, compresión) lo
// recalcula quien entrega la respuesta.
const CABECERAS = ['content-type', 'etag', 'last-modified', 'cache-control'];

async function reenviar(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/^\/api/, '') + url.search;

  let respuesta: Response;
  try {
    respuesta = await fetch(DESTINO + ruta, {
      method: request.method,
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body: request.method === 'GET' ? undefined : await request.text(),
    });
  } catch {
    return Response.json(
      {
        detail:
          `El servidor de conversión no responde en ${DESTINO}. ` +
          'En la PC, en la carpeta del proyecto, corre: docker compose -f docker-compose.dev.yml up',
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const nombre of CABECERAS) {
    const valor = respuesta.headers.get(nombre);
    if (valor) headers.set(nombre, valor);
  }
  return new Response(respuesta.body, { status: respuesta.status, headers });
}

export const GET = reenviar;
export const POST = reenviar;
