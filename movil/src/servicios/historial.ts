/**
 * Los packs convertidos hace poco, para volver a ellos sin pegar el link, y el
 * nombre que el usuario les puso para WhatsApp.
 *
 * Es un JSON chico en el teléfono (en el navegador, localStorage). Guarda sólo
 * lo necesario para pintar la lista: los stickers se vuelven a pedir al
 * servidor al abrir el pack.
 */

import { Platform } from 'react-native';

import type { Resultado } from '../dominio/importacion';

export interface Reciente {
  nombre: string;
  titulo: string;
  /** El nombre que eligió el usuario para WhatsApp; sin él, el de Telegram. */
  nombreWhatsApp?: string;
  stickers: number;
  packs: number;
  /** URL absoluta del ícono de bandeja del primer pack. */
  icono: string;
  fecha: string;
}

const MAXIMO = 20;
const ARCHIVO = 'recientes.json';

interface Almacen {
  leer(): string | null;
  escribir(texto: string): void;
}

function almacen(): Almacen {
  if (Platform.OS === 'web') {
    return {
      leer: () => globalThis.localStorage?.getItem(ARCHIVO) ?? null,
      escribir: (texto) => globalThis.localStorage?.setItem(ARCHIVO, texto),
    };
  }
  // require y no import: expo-file-system no tiene implementación web.
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const archivo = new File(Paths.document, ARCHIVO);
  return {
    leer: () => (archivo.exists ? archivo.textSync() : null),
    escribir: (texto) => {
      if (!archivo.exists) archivo.create();
      archivo.write(texto);
    },
  };
}

export function leerRecientes(): Reciente[] {
  try {
    const texto = almacen().leer();
    return texto ? (JSON.parse(texto) as Reciente[]) : [];
  } catch {
    // Un historial dañado no debe impedir usar la app.
    return [];
  }
}

function mismo(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function escribir(lista: Reciente[]): void {
  try {
    almacen().escribir(JSON.stringify(lista));
  } catch {
    // Sin historial se puede vivir.
  }
}

export function guardarReciente(resultado: Resultado, icono: string): Reciente[] {
  const anteriores = leerRecientes();
  const nuevo: Reciente = {
    nombre: resultado.name,
    titulo: resultado.title,
    nombreWhatsApp: anteriores.find((r) => mismo(r.nombre, resultado.name))?.nombreWhatsApp,
    stickers: resultado.converted,
    packs: resultado.packs.length,
    icono,
    fecha: new Date().toISOString(),
  };
  const lista = [nuevo, ...anteriores.filter((r) => !mismo(r.nombre, nuevo.nombre))].slice(0, MAXIMO);
  escribir(lista);
  return lista;
}

/** El nombre para WhatsApp que el usuario le puso a este pack, si le puso uno. */
export function nombreGuardado(nombre: string): string | undefined {
  return leerRecientes().find((r) => mismo(r.nombre, nombre))?.nombreWhatsApp;
}

/** Vacío vuelve al nombre de Telegram. */
export function guardarNombre(nombre: string, nombreWhatsApp: string): void {
  escribir(leerRecientes().map((r) => (mismo(r.nombre, nombre) ? { ...r, nombreWhatsApp: nombreWhatsApp || undefined } : r)));
}
