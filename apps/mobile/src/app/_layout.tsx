import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { CartProvider } from '@/state/cart';
import { CatalogProvider } from '@/state/catalog';
import { AuthProvider } from '@/state/auth';

export default function TabLayout() {
  return (
    <SafeAreaProvider><AuthProvider><CatalogProvider><CartProvider>
      <StatusBar style="dark" />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown:false, contentStyle:{backgroundColor:'#eee6d9'} }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[shopSlug]/[productSlug]" options={{animation:'slide_from_right'}} />
      </Stack>
    </CartProvider></CatalogProvider></AuthProvider></SafeAreaProvider>
  );
}
