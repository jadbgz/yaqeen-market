import { PropsWithChildren } from 'react';

export function mobileStripeKey() {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key?.startsWith('pk_test_') ? key : null;
}

export function PaymentProvider({ children }: PropsWithChildren) {
  return children;
}
