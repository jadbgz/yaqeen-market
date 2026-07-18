import { StripeProvider } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { PropsWithChildren } from 'react';

export function mobileStripeKey() {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key?.startsWith('pk_test_') ? key : null;
}

export function PaymentProvider({ children }: PropsWithChildren) {
  const publishableKey = mobileStripeKey();
  if (!publishableKey) return children;
  return <StripeProvider publishableKey={publishableKey} urlScheme={Linking.createURL('')}><>{children}</></StripeProvider>;
}
