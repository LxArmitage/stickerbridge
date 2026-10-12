import { Alert, Platform } from 'react-native';

/** Alert.alert no hace nada en el navegador; ahí se usa el de window. */
export function avisar(titulo: string, mensaje: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${titulo}\n\n${mensaje}`);
    return;
  }
  Alert.alert(titulo, mensaje);
}

export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Algo salió mal.';
}
