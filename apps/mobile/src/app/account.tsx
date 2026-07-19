import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarketHeader } from '@/components/market-header';
import { useAuth } from '@/state/auth';

const links = [
  ['orders', 'Mes commandes', 'Suivi réel par boutique'],
  ['addresses', 'Mes adresses', 'Carnet de livraison privé'],
  ['security', 'Sécurité & données', 'Mot de passe et contrôle du compte'],
] as const;

export default function AccountScreen() {
  const router = useRouter();
  const auth = useAuth();
  const displayName = typeof auth.user?.user_metadata?.display_name === 'string'
    ? auth.user.user_metadata.display_name : auth.user?.email ?? 'Compte Yaqeen';
  const initial = displayName.slice(0, 1).toUpperCase();

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <MarketHeader />
    <Text style={s.kicker}>VOTRE ESPACE</Text>
    <Text style={s.title}>UN COMPTE.{`\n`}TOUTES VOS <Text style={s.accent}>BOUTIQUES.</Text></Text>
    {auth.loading ? <View style={s.loading}><ActivityIndicator color="#092b5d" /></View> : auth.user ? <>
      <View style={s.profile}><View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View><View style={s.profileCopy}><Text style={s.profileTitle}>{displayName}</Text><Text numberOfLines={1} style={s.profileSub}>{auth.user.email}</Text></View><View style={s.live}><Text style={s.liveText}>CONNECTÉ</Text></View></View>
      <View style={s.list}>{links.map(([slug,label,description],i)=><Pressable style={s.row} key={slug} onPress={()=>router.push({pathname:'/account/[section]',params:{section:slug}})}><Text style={s.number}>0{i+1}</Text><View style={s.rowCopy}><Text style={s.label}>{label}</Text><Text style={s.description}>{description}</Text></View><Text style={s.arrow}>→</Text></Pressable>)}</View>
      <Pressable style={s.seller} onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/seller`)}><Text style={s.sellerKicker}>VOUS ÊTES COMMERÇANT ?</Text><Text style={s.sellerTitle}>Ouvrir une boutique Yaqeen.</Text><Text style={s.sellerLink}>ACCÉDER AU SELLER CENTER →</Text></Pressable>
      <Pressable onPress={auth.signOut}><Text style={s.signOut}>Se déconnecter</Text></Pressable>
    </> : <>
      <Pressable style={s.profile} onPress={()=>router.push('/auth')}><View style={s.avatar}><Text style={s.avatarText}>Y</Text></View><View style={s.profileCopy}><Text style={s.profileTitle}>Se connecter</Text><Text style={s.profileSub}>Retrouvez commandes et adresses sur tous vos appareils</Text></View><Text style={s.profileArrow}>→</Text></Pressable>
      <Pressable style={s.join} onPress={()=>router.push({pathname:'/auth',params:{mode:'signup'}})}><Text style={s.joinText}>CRÉER MON COMPTE →</Text></Pressable>
      {!auth.configured && <View style={s.config}><Text style={s.configTitle}>CONFIGURATION REQUISE</Text><Text style={s.configCopy}>Renseignez l’URL et la clé publique Supabase dans l’environnement Expo.</Text></View>}
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#eee6d9'},page:{padding:20,paddingBottom:95},kicker:{marginTop:20,fontSize:10,fontWeight:'800',letterSpacing:1.7,color:'#687069'},title:{marginTop:13,fontSize:40,lineHeight:38,fontWeight:'900',letterSpacing:-2.5,color:'#17201c'},accent:{color:'#ef6b38'},loading:{height:120,justifyContent:'center'},profile:{marginTop:28,padding:17,backgroundColor:'#092b5d',flexDirection:'row',alignItems:'center',gap:13},avatar:{width:48,height:48,borderRadius:24,backgroundColor:'#ef6b38',alignItems:'center',justifyContent:'center'},avatarText:{color:'white',fontSize:17,fontWeight:'900'},profileCopy:{flex:1},profileTitle:{color:'#f0e8dc',fontSize:14,fontWeight:'800'},profileSub:{marginTop:5,color:'#aebbd0',fontSize:10},profileArrow:{color:'#ef8a61',fontSize:18},live:{borderRadius:20,backgroundColor:'#1a4c55',paddingHorizontal:9,paddingVertical:6},liveText:{color:'#d9eee7',fontSize:8,fontWeight:'900'},list:{marginTop:24,borderTopWidth:1,borderTopColor:'#17201c2d'},row:{minHeight:76,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#17201c2d'},number:{width:42,fontSize:10,color:'#ef6b38'},rowCopy:{flex:1},label:{fontSize:15,fontWeight:'800'},description:{marginTop:4,fontSize:10,color:'#717872'},arrow:{fontSize:15},seller:{marginTop:28,padding:22,backgroundColor:'#d8a553'},sellerKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.1},sellerTitle:{marginTop:9,fontSize:20,fontWeight:'800'},sellerLink:{marginTop:17,fontSize:9,fontWeight:'900'},signOut:{marginTop:25,textAlign:'center',fontSize:11,textDecorationLine:'underline',color:'#5f665f'},join:{marginTop:12,padding:17,backgroundColor:'#ef6b38',alignItems:'center'},joinText:{color:'white',fontSize:10,fontWeight:'900'},config:{marginTop:25,padding:20,backgroundColor:'#e0d5c3'},configTitle:{fontSize:9,fontWeight:'900',letterSpacing:1.2},configCopy:{marginTop:8,fontSize:10,lineHeight:16,color:'#687069'}});
