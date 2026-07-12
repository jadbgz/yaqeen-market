import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { CartProvider } from '@/state/cart';

export default function TabLayout() {
  return (
    <SafeAreaProvider><CartProvider>
      <StatusBar style="dark" />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown:false, contentStyle:{backgroundColor:'#eee6d9'} }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[slug]" options={{animation:'slide_from_right'}} />
      </Stack>
    </CartProvider></SafeAreaProvider>
  );
}
