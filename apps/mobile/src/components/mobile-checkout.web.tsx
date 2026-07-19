import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export function MobileCheckout() {
  const router = useRouter();
  return <View style={s.page}><Text style={s.kicker}>APPLICATION WEB EXPO</Text><Text style={s.title}>Paiement disponible sur iOS et Android.</Text><Text style={s.copy}>La version web principale de Yaqeen possède son propre checkout sécurisé. Cette prévisualisation Expo n’envoie aucun paiement.</Text><Pressable style={s.button} onPress={() => router.replace('/cart')}><Text style={s.buttonText}>RETOUR AU PANIER</Text></Pressable></View>;
}
const s=StyleSheet.create({page:{flex:1,padding:30,alignItems:'center',justifyContent:'center',backgroundColor:'#eee6d9'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#687069'},title:{marginTop:14,maxWidth:480,fontSize:34,fontWeight:'900',textAlign:'center'},copy:{marginTop:15,maxWidth:460,fontSize:12,lineHeight:20,textAlign:'center',color:'#5f665f'},button:{marginTop:22,padding:15,backgroundColor:'#092b5d'},buttonText:{color:'white',fontSize:9,fontWeight:'900'}});
