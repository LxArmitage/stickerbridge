/**
 * El puente hacia WhatsApp en iPhone (ios/WhatsAppStickersModule.swift).
 *
 * WhatsApp sólo acepta packs de una app instalada que ponga los datos en el
 * portapapeles con un tipo propio. Expo Go no trae ese código nativo, así que
 * ahí `disponible` es false y la app lo explica en vez de fallar: todo lo
 * anterior (link, conversión, vista previa y validación) sí se prueba en Expo Go.
 */

import { requireOptionalNativeModule } from 'expo';

interface ModuloNativo {
  isWhatsAppInstalled(): Promise<boolean>;
  sendStickerPack(json: string): Promise<void>;
}

const nativo = requireOptionalNativeModule<ModuloNativo>('WhatsAppStickers');

/** false en Expo Go, en web y en Android. */
export const disponible = nativo != null;

export async function whatsappInstalado(): Promise<boolean> {
  return nativo ? nativo.isWhatsAppInstalled() : false;
}

/** Recibe el JSON tal como lo arma el servidor y abre WhatsApp. */
export async function enviarPack(json: string): Promise<void> {
  if (!nativo) throw new Error('Esta versión de la app no puede abrir WhatsApp.');
  await nativo.sendStickerPack(json);
}
