import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadMobileOrder, type MobileOrder } from '@/data/account';
import { formatPrice } from '@/data/catalog';

const finalStatuses = new Set(['paid','processing','partially_shipped','shipped','delivered','cancelled','refunded','partially_refunded']);

export default function OrderConfirmationScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<MobileOrder | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(() => loadMobileOrder(orderId).then((next) => { setOrder(next); setError(!next); }).catch(() => setError(true)), [orderId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!order || !finalStatuses.has(order.status)) refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [order, refresh]);

  const confirmed = order && finalStatuses.has(order.status) && order.status !== 'cancelled';
  return <SafeAreaView style={s.safe}><View style={s.page}>
    <View style={[s.mark,confirmed&&s.markConfirmed]}><Text style={s.markText}>{confirmed?'✓':'…'}</Text></View>
    <Text style={s.kicker}>{confirmed?'COMMANDE CONFIRMÉE':'CONFIRMATION EN COURS'}</Text>
    <Text style={s.title}>{confirmed?'MERCI.':'NOUS VÉRIFIONS.'}</Text>
    {error?<Text style={s.copy}>La commande n’a pas pu être relue. Elle reste accessible depuis votre compte.</Text>:!order?<ActivityIndicator style={s.loader} color="#092b5d"/>:<><Text style={s.copy}>{confirmed?'Le webhook Stripe signé a confirmé le paiement. Chaque boutique peut maintenant préparer sa partie de la commande.':'Le paiement a été remis à Stripe. Nous attendons encore sa confirmation serveur signée.'}</Text><View style={s.card}><Text style={s.cardLabel}>COMMANDE #{order.id.slice(0,8).toUpperCase()}</Text><Text style={s.amount}>{formatPrice(order.totalCents/100,order.currency)}</Text><Text style={s.status}>Statut : {order.status}</Text><Text style={s.shops}>{order.shopCount} boutique{order.shopCount>1?'s':''}</Text></View></>}
    {!confirmed&&!error&&<Pressable onPress={refresh}><Text style={s.refresh}>ACTUALISER MAINTENANT</Text></Pressable>}
    <Pressable style={s.primary} onPress={()=>router.replace({pathname:'/account/[section]',params:{section:'orders'}})}><Text style={s.primaryText}>VOIR MES COMMANDES →</Text></Pressable>
    <Pressable onPress={()=>router.replace('/')}><Text style={s.home}>Retour à l’accueil</Text></Pressable>
  </View></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#eee6d9'},page:{flex:1,padding:28,alignItems:'center',justifyContent:'center'},mark:{width:64,height:64,borderRadius:32,backgroundColor:'#d9cdbb',alignItems:'center',justifyContent:'center'},markConfirmed:{backgroundColor:'#28614b'},markText:{color:'white',fontSize:26,fontWeight:'900'},kicker:{marginTop:25,fontSize:9,fontWeight:'900',letterSpacing:1.5,color:'#687069'},title:{marginTop:11,fontSize:43,fontWeight:'900',letterSpacing:-2.5},copy:{maxWidth:390,marginTop:14,fontSize:12,lineHeight:20,textAlign:'center',color:'#5f665f'},loader:{marginTop:22},card:{width:'100%',marginTop:25,padding:20,backgroundColor:'#092b5d'},cardLabel:{color:'#aebdd0',fontSize:9,fontWeight:'900',letterSpacing:1.1},amount:{marginTop:10,color:'white',fontSize:30,fontWeight:'900'},status:{marginTop:12,color:'white',fontSize:11},shops:{marginTop:5,color:'#aebdd0',fontSize:10},refresh:{marginTop:20,fontSize:9,fontWeight:'900',textDecorationLine:'underline'},primary:{width:'100%',marginTop:25,padding:16,backgroundColor:'#ef6b38',alignItems:'center'},primaryText:{color:'white',fontSize:10,fontWeight:'900'},home:{marginTop:17,fontSize:10,textDecorationLine:'underline'}});
