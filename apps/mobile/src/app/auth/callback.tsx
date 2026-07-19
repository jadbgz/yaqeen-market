import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/state/auth';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url || auth.loading) return;
    auth.exchangeRecoveryCode(url).then((result) => {
      if (!result.ok) setError(result.message);
      else if (result.recovery) router.replace({ pathname: '/account/[section]', params: { section: 'security', recovery: '1' } });
      else router.replace('/account');
    });
  }, [auth, router, url]);
  return <SafeAreaView style={s.safe}><View style={s.center}>{error ? <><Text style={s.title}>LIEN INVALIDE.</Text><Text style={s.copy}>{error}</Text><Pressable style={s.button} onPress={() => router.replace({ pathname: '/auth', params: { mode: 'reset' } })}><Text style={s.buttonText}>DEMANDER UN NOUVEAU LIEN</Text></Pressable></> : <><ActivityIndicator color="#092b5d" /><Text style={s.copy}>Validation du lien sécurisé…</Text></>}</View></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#eee6d9'},center:{flex:1,padding:25,alignItems:'center',justifyContent:'center'},title:{fontSize:34,fontWeight:'900',letterSpacing:-2},copy:{marginTop:16,fontSize:12,color:'#626963'},button:{marginTop:24,backgroundColor:'#092b5d',padding:16},buttonText:{color:'white',fontSize:10,fontWeight:'900'}});
