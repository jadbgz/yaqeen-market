import { useStripe } from '@stripe/stripe-react-native';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadMobileAddresses, type MobileAddress } from '@/data/account';
import { formatPrice } from '@/data/catalog';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { mobileStripeKey } from '@/components/payment-provider';

type CheckoutSession = { orderId: string; clientSecret: string; expiresAt: string; status: string };
const errorMessages: Record<string, string> = {
  authentication_required: 'Reconnectez-vous avant de poursuivre.',
  insufficient_stock: 'Le stock a changé. Ajustez votre panier.',
  active_order_limit: 'Trop de réservations sont ouvertes. Réessayez après leur expiration.',
  seller_payment_unavailable: 'Une boutique n’a pas encore activé ses paiements.',
  order_not_payable: 'Cette réservation ne peut plus être payée.',
  stripe_test_checkout_unconfigured: 'Le paiement de test n’est pas configuré.',
};

function apiOrigin() {
  const configured = process.env.EXPO_PUBLIC_SITE_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:') ? url.origin : null;
  } catch {
    return null;
  }
}

export function MobileCheckout() {
  const router = useRouter();
  const auth = useAuth();
  const cart = useCart();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [addresses, setAddresses] = useState<MobileAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [loadingAddresses, setLoadingAddresses] = useState(Boolean(auth.user));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fingerprint = `${addressId}|${cart.items.map((line) => `${line.product.variantId}:${line.quantity}`).sort().join('|')}`;
  const checkoutIdentity = useMemo(() => ({ fingerprint, token: Crypto.randomUUID() }), [fingerprint]);
  const origin = apiOrigin();
  const configured = Boolean(origin && mobileStripeKey());

  useEffect(() => {
    if (!auth.user) return;
    let active = true;
    loadMobileAddresses().then((next) => {
      if (!active) return;
      setAddresses(next);
      setAddressId(next.find((address) => address.isDefault)?.id ?? next[0]?.id ?? '');
    }).catch(() => active && setError('Impossible de charger vos adresses.'))
      .finally(() => active && setLoadingAddresses(false));
    return () => { active = false; };
  }, [auth.user]);

  async function pay() {
    if (!auth.session) return router.push({ pathname: '/auth', params: { next: '/checkout' } });
    if (!addressId || !cart.items.length || !origin || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${origin}/api/mobile/checkout/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutToken: checkoutIdentity.token,
          addressId,
          items: cart.items.map((line) => ({ variantId: line.product.variantId, quantity: line.quantity })),
        }),
      });
      const body = await response.json() as CheckoutSession & { error?: string };
      if (!response.ok || !body.clientSecret) throw new Error(body.error ?? 'checkout_failed');
      const initialized = await initPaymentSheet({
        merchantDisplayName: 'Yaqeen Market',
        paymentIntentClientSecret: body.clientSecret,
        returnURL: Linking.createURL(`/order/${body.orderId}`),
        allowsDelayedPaymentMethods: false,
      });
      if (initialized.error) throw new Error(initialized.error.message);
      const presented = await presentPaymentSheet();
      if (presented.error) {
        if (presented.error.code !== 'Canceled') setError(presented.error.message);
        return;
      }
      cart.clear();
      router.replace({ pathname: '/order/[orderId]', params: { orderId: body.orderId } });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'checkout_failed';
      setError(errorMessages[code] ?? 'Le paiement de test n’a pas pu être préparé. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  if (!auth.loading && !auth.user) return <State title="Connectez-vous pour continuer." copy="Votre compte permet de rattacher la réservation, l’adresse et la commande." action="SE CONNECTER →" onPress={() => router.push({ pathname: '/auth', params: { next: '/checkout' } })}/>;
  if (!cart.ready || auth.loading || loadingAddresses) return <State loading title="Préparation du paiement…" copy="Nous vérifions le panier et vos adresses."/>;
  if (!cart.items.length) return <State title="Votre panier est vide." copy="Ajoutez un produit publié avant de continuer." action="EXPLORER →" onPress={() => router.replace('/(tabs)/explore')}/>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Pressable onPress={() => router.back()}><Text style={s.back}>← Retour au panier</Text></Pressable>
    <Text style={s.kicker}>PAIEMENT SÉCURISÉ · MODE TEST</Text><Text style={s.title}>FINALISER{`\n`}EN <Text style={s.accent}>CONFIANCE.</Text></Text>
    <Text style={s.copy}>Le serveur recalcule les prix, contrôle le stock et réserve chaque article. Stripe collecte la carte : Yaqeen ne la reçoit jamais.</Text>
    <View style={s.step}><Text style={s.stepNumber}>01</Text><View><Text style={s.stepOverline}>LIVRAISON</Text><Text style={s.stepTitle}>Choisir une adresse</Text></View></View>
    {addresses.length === 0 ? <View style={s.notice}><Text style={s.noticeTitle}>Une adresse est nécessaire.</Text><Text style={s.noticeCopy}>Ajoutez-la dans votre compte avant de réserver le stock.</Text><Pressable onPress={() => router.push({ pathname: '/account/[section]', params: { section: 'addresses' } })}><Text style={s.noticeLink}>AJOUTER UNE ADRESSE →</Text></Pressable></View> : <View style={s.addresses}>{addresses.map((address) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: addressId === address.id }} onPress={() => setAddressId(address.id)} key={address.id} style={[s.address, addressId === address.id && s.addressActive]}><View style={[s.radio,addressId === address.id&&s.radioActive]}/><View style={s.addressCopy}><Text style={s.addressLabel}>{address.label}{address.isDefault ? ' · PAR DÉFAUT' : ''}</Text><Text style={s.addressText}>{address.recipientName}{'\n'}{address.line1}{'\n'}{address.postalCode} {address.city}</Text></View></Pressable>)}</View>}
    <View style={s.step}><Text style={s.stepNumber}>02</Text><View><Text style={s.stepOverline}>RÉCAPITULATIF</Text><Text style={s.stepTitle}>{cart.count} article{cart.count > 1 ? 's' : ''}</Text></View></View>
    <View style={s.summary}>{cart.items.map((line) => <View style={s.line} key={line.product.variantId}><Text style={s.lineName}>{line.quantity} × {line.product.name}<Text style={s.lineShop}>{`\n`}{line.product.shop}</Text></Text><Text style={s.linePrice}>{formatPrice(line.product.price * line.quantity, line.product.currency)}</Text></View>)}<View style={s.total}><Text style={s.totalLabel}>TOTAL TEST</Text><Text style={s.totalPrice}>{formatPrice(cart.total)}</Text></View></View>
    {!configured && <View style={s.warning}><Text style={s.warningTitle}>Bac à sable non configuré sur cet appareil.</Text><Text style={s.warningCopy}>Ajoutez l’URL du site et la clé publique Stripe de test. Les clés réelles sont refusées dans cette version.</Text></View>}
    {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable disabled={!configured || !addressId || pending} onPress={pay} style={[s.pay,(!configured||!addressId||pending)&&s.disabled]}>{pending?<ActivityIndicator color="white"/>:<Text style={s.payText}>OUVRIR LE PAIEMENT STRIPE →</Text>}</Pressable>
    <Text style={s.note}>Carte de test uniquement · aucune carte réelle ne doit être utilisée.</Text>
  </ScrollView></SafeAreaView>;
}

function State({ title, copy, action, onPress, loading = false }: { title:string;copy:string;action?:string;onPress?:()=>void;loading?:boolean }) {
  return <SafeAreaView style={s.safe}><View style={s.state}>{loading&&<ActivityIndicator color="#092b5d"/>}<Text style={s.stateTitle}>{title}</Text><Text style={s.stateCopy}>{copy}</Text>{action&&onPress&&<Pressable style={s.stateAction} onPress={onPress}><Text style={s.stateActionText}>{action}</Text></Pressable>}</View></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#eee6d9'},page:{padding:22,paddingBottom:65},back:{fontSize:11,fontWeight:'700'},kicker:{marginTop:35,fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#687069'},title:{marginTop:13,fontSize:39,lineHeight:37,fontWeight:'900',letterSpacing:-2.3},accent:{color:'#ef6b38'},copy:{marginTop:19,fontSize:12,lineHeight:20,color:'#5f665f'},step:{marginTop:30,paddingVertical:16,borderTopWidth:1,borderBottomWidth:1,borderColor:'#17201c25',flexDirection:'row',alignItems:'center',gap:14},stepNumber:{width:34,height:34,lineHeight:34,textAlign:'center',borderRadius:17,backgroundColor:'#092b5d',color:'white',fontSize:9,fontWeight:'900'},stepOverline:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#687069'},stepTitle:{marginTop:3,fontSize:18,fontWeight:'900'},addresses:{marginTop:12,gap:8},address:{padding:15,borderWidth:1,borderColor:'#17201c25',flexDirection:'row',alignItems:'flex-start',backgroundColor:'#f4eee4'},addressActive:{borderColor:'#092b5d',borderWidth:2},radio:{width:17,height:17,marginTop:2,marginRight:12,borderWidth:1,borderColor:'#17201c60',borderRadius:9},radioActive:{borderWidth:5,borderColor:'#092b5d'},addressCopy:{flex:1},addressLabel:{fontSize:10,fontWeight:'900'},addressText:{marginTop:6,fontSize:11,lineHeight:17,color:'#5f665f'},notice:{marginTop:12,padding:18,backgroundColor:'#e0d5c3'},noticeTitle:{fontSize:16,fontWeight:'900'},noticeCopy:{marginTop:7,fontSize:11,lineHeight:17},noticeLink:{marginTop:15,fontSize:9,fontWeight:'900',textDecorationLine:'underline'},summary:{marginTop:12,padding:18,backgroundColor:'#092b5d'},line:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#ffffff20',flexDirection:'row',gap:15},lineName:{flex:1,color:'white',fontSize:11,fontWeight:'800'},lineShop:{color:'#aebdd0',fontSize:9,fontWeight:'500'},linePrice:{color:'white',fontSize:11,fontWeight:'900'},total:{paddingTop:18,flexDirection:'row',alignItems:'center'},totalLabel:{color:'#aebdd0',fontSize:9,fontWeight:'900',letterSpacing:1.1},totalPrice:{marginLeft:'auto',color:'white',fontSize:24,fontWeight:'900'},warning:{marginTop:15,padding:15,backgroundColor:'#ead8ad'},warningTitle:{fontSize:11,fontWeight:'900'},warningCopy:{marginTop:6,fontSize:10,lineHeight:16},error:{marginTop:14,padding:13,backgroundColor:'#f4dcd5',color:'#8e3525',fontSize:10,lineHeight:16},pay:{minHeight:54,marginTop:15,borderRadius:8,backgroundColor:'#ef6b38',alignItems:'center',justifyContent:'center'},disabled:{opacity:.45},payText:{color:'white',fontSize:10,fontWeight:'900'},note:{marginTop:11,textAlign:'center',fontSize:9,color:'#737a74'},state:{flex:1,padding:30,alignItems:'center',justifyContent:'center'},stateTitle:{marginTop:15,fontSize:23,fontWeight:'900',textAlign:'center'},stateCopy:{maxWidth:300,marginTop:9,fontSize:11,lineHeight:18,textAlign:'center',color:'#687069'},stateAction:{marginTop:20,padding:15,backgroundColor:'#092b5d'},stateActionText:{color:'white',fontSize:9,fontWeight:'900'}});
