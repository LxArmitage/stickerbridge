/**
 * Paleta y tokens visuales.
 *
 * El fondo y las superficies son los grises agrupados de iOS: la app vive
 * entre dos apps de mensajería y debe sentirse del sistema, no de marca. La
 * identidad está en los dos acentos: el azul de Telegram (de donde viene el
 * pack) y el verde de WhatsApp (a donde va). Ambos oscurecidos lo necesario
 * para que el texto blanco encima se lea (contraste 4.5:1 o más).
 */

import { useColorScheme } from 'react-native';

export interface Tema {
  fondo: string;
  superficie: string;
  superficieAlta: string;
  borde: string;
  texto: string;
  textoSuave: string;
  /** Azul Telegram: acciones principales y enlaces. */
  primario: string;
  primarioSuave: string;
  textoSobrePrimario: string;
  /** Verde WhatsApp: sólo para el paso final, agregar a WhatsApp. */
  whatsapp: string;
  whatsappSuave: string;
  textoSobreWhatsapp: string;
  error: string;
  errorSuave: string;
  esOscuro: boolean;
}

const CLARO: Tema = {
  fondo: '#F2F2F7',
  superficie: '#FFFFFF',
  superficieAlta: '#E9E9EE',
  borde: '#D6D6DC',
  texto: '#111114',
  textoSuave: '#6B6B73',
  primario: '#1769BF',
  primarioSuave: '#DDEBFA',
  textoSobrePrimario: '#FFFFFF',
  whatsapp: '#0B7A3E',
  whatsappSuave: '#DCF5E6',
  textoSobreWhatsapp: '#FFFFFF',
  error: '#C8252C',
  errorSuave: '#FBE3E4',
  esOscuro: false,
};

const OSCURO: Tema = {
  fondo: '#000000',
  superficie: '#1C1C1E',
  superficieAlta: '#2C2C2E',
  borde: '#38383C',
  texto: '#F5F5F7',
  textoSuave: '#9A9AA2',
  primario: '#5AB4FF',
  primarioSuave: '#0E2A45',
  textoSobrePrimario: '#04182B',
  whatsapp: '#2BD46A',
  whatsappSuave: '#0D3320',
  textoSobreWhatsapp: '#03200E',
  error: '#FF6961',
  errorSuave: '#3A1413',
  esOscuro: true,
};

export function useTema(): Tema {
  return useColorScheme() === 'dark' ? OSCURO : CLARO;
}

/**
 * Tipografía: Plus Jakarta Sans. Geométrica pero
 * cálida, con x-height alta que se lee bien a 13 px. El título grande va en
 * ExtraBold, que es donde la fuente tiene más carácter.
 */
export const fuente = {
  titulo: 'PlusJakartaSans_800ExtraBold',
  cuerpo: 'PlusJakartaSans_400Regular',
  cuerpoMedio: 'PlusJakartaSans_500Medium',
  cuerpoFuerte: 'PlusJakartaSans_700Bold',
} as const;

export const espacio = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radio = {
  sm: 8,
  md: 12,
  lg: 18,
  completo: 999,
} as const;
