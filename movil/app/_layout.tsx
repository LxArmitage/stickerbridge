import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTema } from '../src/ui/tema';

export default function LayoutRaiz() {
  const tema = useTema();
  const [fuentesListas] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Se espera a las fuentes: arrancar con la del sistema y cambiarlas a medio
  // camino provoca un salto de texto que se ve barato.
  if (!fuentesListas) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fondo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.primario} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={tema.esOscuro ? 'light' : 'dark'} />
      {/* Cada pantalla dibuja su propia barra (título grande de iOS). */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tema.fondo } }} />
    </SafeAreaProvider>
  );
}
