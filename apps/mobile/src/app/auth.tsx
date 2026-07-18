import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/state/auth';

type Mode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : params.mode === 'reset' ? 'reset' : 'login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);

  async function submit() {
    setFeedback(null);
    if (!email.includes('@')) return setFeedback({ tone: 'error', message: 'Saisissez une adresse e-mail valide.' });
    if (mode !== 'reset' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
      return setFeedback({ tone: 'error', message: '8 caractères minimum, avec une lettre et un chiffre.' });
    }
    if (mode === 'signup' && displayName.trim().length < 2) return setFeedback({ tone: 'error', message: 'Indiquez votre nom.' });
    setPending(true);
    const result = mode === 'login'
      ? await auth.signIn(email, password)
      : mode === 'signup'
        ? await auth.signUp(displayName, email, password)
        : await auth.requestPasswordReset(email);
    setPending(false);
    if (!result.ok) return setFeedback({ tone: 'error', message: result.message });
    if (mode === 'login') return router.replace('/account');
    setFeedback({
      tone: 'success',
      message: mode === 'reset'
        ? 'Si un compte correspond à cette adresse, un lien sécurisé vient d’être envoyé.'
        : result.confirmation ? 'Vérifiez votre boîte e-mail pour confirmer votre compte.' : 'Votre compte est créé.',
    });
  }

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}><Text style={s.back}>← Retour</Text></Pressable>
      <Text style={s.kicker}>{mode === 'reset' ? 'RÉCUPÉRER MON ACCÈS' : 'COMPTE YAQEEN'}</Text>
      <Text style={s.title}>{mode === 'login' ? 'BON RETOUR.' : mode === 'signup' ? 'REJOINDRE LA\nCOMMUNAUTÉ.' : 'RETROUVER\nSON ACCÈS.'}</Text>
      <Text style={s.lead}>{mode === 'reset' ? 'La réponse reste identique qu’un compte existe ou non.' : 'Un compte pour acheter auprès de toutes les boutiques Yaqeen.'}</Text>
      {!auth.configured && <View style={s.error}><Text style={s.errorText}>Supabase doit être configuré dans l’environnement Expo.</Text></View>}
      <View style={s.form}>
        {mode === 'signup' && <Field label="Votre nom" value={displayName} onChangeText={setDisplayName} autoComplete="name" />}
        <Field label="Adresse e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        {mode !== 'reset' && <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
        {feedback && <View style={feedback.tone === 'error' ? s.error : s.success}><Text style={feedback.tone === 'error' ? s.errorText : s.successText}>{feedback.message}</Text></View>}
        <Pressable style={[s.submit, (pending || !auth.configured) && s.disabled]} disabled={pending || !auth.configured} onPress={submit}>{pending ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>{mode === 'login' ? 'SE CONNECTER →' : mode === 'signup' ? 'CRÉER MON COMPTE →' : 'RECEVOIR LE LIEN →'}</Text>}</Pressable>
      </View>
      {mode === 'login' && <Pressable onPress={() => setMode('reset')}><Text style={s.minor}>Mot de passe oublié ?</Text></Pressable>}
      <View style={s.switch}><Text style={s.switchText}>{mode === 'signup' ? 'Déjà membre ?' : 'Pas encore membre ?'}</Text><Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}><Text style={s.switchLink}>{mode === 'signup' ? 'Se connecter' : 'Créer un compte'}</Text></Pressable></View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };
function Field({ label, ...props }: FieldProps) {
  return <View><Text style={s.label}>{label}</Text><TextInput {...props} style={s.input} placeholderTextColor="#8a8f89" /></View>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:'#eee6d9'},flex:{flex:1},page:{padding:22,paddingBottom:60},back:{fontSize:11,fontWeight:'700'},kicker:{marginTop:45,fontSize:10,fontWeight:'800',letterSpacing:1.7,color:'#687069'},title:{marginTop:14,fontSize:43,lineHeight:40,fontWeight:'900',letterSpacing:-2.5,color:'#17201c'},lead:{marginTop:18,maxWidth:430,fontSize:12,lineHeight:19,color:'#626963'},form:{marginTop:28,gap:15},label:{marginBottom:7,fontSize:10,fontWeight:'800',letterSpacing:.7,color:'#555d57'},input:{height:50,borderWidth:1,borderColor:'#17201c30',backgroundColor:'#f8f4ec',paddingHorizontal:14,fontSize:14,color:'#17201c'},submit:{height:52,marginTop:5,backgroundColor:'#092b5d',alignItems:'center',justifyContent:'center'},submitText:{color:'white',fontSize:11,fontWeight:'900',letterSpacing:.6},disabled:{opacity:.55},error:{marginTop:15,padding:13,backgroundColor:'#f4dcd5'},errorText:{fontSize:11,lineHeight:17,color:'#8e3525'},success:{padding:13,backgroundColor:'#dce9e2'},successText:{fontSize:11,lineHeight:17,color:'#285f47'},minor:{marginTop:16,textAlign:'right',fontSize:11,textDecorationLine:'underline'},switch:{marginTop:28,flexDirection:'row',justifyContent:'center',gap:6},switchText:{fontSize:11,color:'#686f69'},switchLink:{fontSize:11,fontWeight:'800',textDecorationLine:'underline'}});
