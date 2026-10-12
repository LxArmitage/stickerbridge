/**
 * El servidor de conversión (api/ en este repo).
 *
 * En pruebas se llega a él a través de Metro (app/api/[...ruta]+api.ts): en
 * desarrollo, `window.location.origin` es el servidor del que Expo Go cargó la
 * app —también en el teléfono, y también con `--tunnel`—, así que no hay que
 * saber la IP de la PC. EXPO_PUBLIC_API_URL apunta a un servidor fijo, como el
 * de producción.
 */

import { enlaceDelPack } from '../dominio/enlace';
import type { Importacion, PackWhatsApp } from '../dominio/importacion';

const ESPERA_MS = 15_000;

export function urlServidor(): string {
  const fija = process.env.EXPO_PUBLIC_API_URL;
  if (fija) return fija.replace(/\/+$/, '');
  const origen = typeof window !== 'undefined' ? window.location?.origin : undefined;
  return `${origen ?? 'http://localhost:8081'}/api`;
}

export class ErrorServidor extends Error {}

async function pedir(ruta: string, init?: RequestInit): Promise<Response> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  let resp: Response;
  try {
    resp = await fetch(`${urlServidor()}${ruta}`, { ...init, signal: control.signal });
  } catch {
    throw new ErrorServidor(`No hay conexión con ${urlServidor()}. ¿Sigue corriendo expo start en la PC?`);
  } finally {
    clearTimeout(reloj);
  }
  if (!resp.ok) {
    const cuerpo = await resp.json().catch(() => null);
    const detalle = typeof cuerpo?.detail === 'string' ? cuerpo.detail : `El servidor respondió ${resp.status}.`;
    throw new ErrorServidor(detalle);
  }
  return resp;
}

export async function servidorDisponible(): Promise<boolean> {
  try {
    await pedir('/health');
    return true;
  } catch {
    return false;
  }
}

/**
 * Pide convertir el pack. Si ya se convirtió o se está convirtiendo, el
 * servidor devuelve ese mismo trabajo en vez de empezar otro.
 */
export async function importar(nombre: string): Promise<Importacion> {
  const resp = await pedir('/v1/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link: enlaceDelPack(nombre) }),
  });
  return resp.json();
}

export async function consultar(nombre: string): Promise<Importacion> {
  return (await pedir(`/v1/imports/${encodeURIComponent(nombre)}`)).json();
}

/**
 * El pack en el formato que WhatsApp para iPhone lee del portapapeles.
 * `titulo` es el nombre que eligió el usuario; sin él queda el de Telegram.
 */
export async function datosParaWhatsApp(nombre: string, pack: PackWhatsApp, titulo?: string): Promise<string> {
  const consulta = titulo ? `?title=${encodeURIComponent(titulo)}` : '';
  const ruta = `/v1/imports/${encodeURIComponent(nombre)}/packs/${encodeURIComponent(pack.identifier)}/whatsapp`;
  return (await pedir(ruta + consulta)).text();
}

export function urlArchivo(pack: PackWhatsApp, archivo: string): string {
  return `${urlServidor()}${pack.url}/${archivo}`;
}
