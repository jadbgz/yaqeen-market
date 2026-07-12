import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart } from '@/state/cart';

export function MarketHeader(){
  const router=useRouter();const pathname=usePathname();const {count}=useCart();
  return <View style={s.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Accueil Yaqeen" onPress={()=>router.push('/')}><Text style={s.logo}>yaqeen<Text style={s.dot}>•</Text></Text></Pressable>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mon compte" style={[s.iconButton,pathname==='/account'&&s.active]} onPress={()=>router.push('/account')}><View style={s.face}><View style={s.head}/><View style={s.body}/></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mon panier, ${count} article${count>1?'s':''}`} style={[s.iconButton,s.cart,pathname==='/cart'&&s.cartActive]} onPress={()=>router.push('/cart')}><Text style={s.bag}>▱</Text>{count>0&&<Text style={s.badge}>{count}</Text>}</Pressable>
    </View>
  </View>
}
const s=StyleSheet.create({header:{height:66,flexDirection:'row',alignItems:'center'},logo:{fontSize:27,fontWeight:'900',letterSpacing:-2,color:'#17201c'},dot:{color:'#ef6b38',fontSize:17},actions:{marginLeft:'auto',flexDirection:'row',gap:8},iconButton:{width:40,height:40,borderRadius:20,borderWidth:1,borderColor:'#17201c30',alignItems:'center',justifyContent:'center'},active:{backgroundColor:'#ded3c3'},cart:{backgroundColor:'#092b5d',borderColor:'#092b5d'},cartActive:{backgroundColor:'#ef6b38',borderColor:'#ef6b38'},bag:{color:'white',fontSize:17},badge:{position:'absolute',right:-4,top:-5,minWidth:18,height:18,paddingHorizontal:4,borderRadius:9,backgroundColor:'#ef6b38',color:'white',fontSize:9,fontWeight:'900',lineHeight:18,textAlign:'center'},face:{width:18,height:20,alignItems:'center'},head:{width:7,height:7,borderRadius:4,borderWidth:1.3,borderColor:'#17201c'},body:{marginTop:2,width:15,height:9,borderTopLeftRadius:8,borderTopRightRadius:8,borderWidth:1.3,borderBottomWidth:0,borderColor:'#17201c'}});
