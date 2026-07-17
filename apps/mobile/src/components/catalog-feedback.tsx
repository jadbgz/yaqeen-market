import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CatalogStatus } from '@/state/catalog';

export function CatalogFeedback({ status, onRetry }: { status: CatalogStatus; onRetry: () => void }) {
  if (status === 'loading') {
    return <View style={s.card}><ActivityIndicator color="#092b5d"/><Text style={s.title}>Chargement du catalogue…</Text><Text style={s.copy}>Nous récupérons uniquement les produits réellement publiés.</Text></View>;
  }
  if (status === 'unconfigured') {
    return <View style={s.card}><Text style={s.overline}>ENVIRONNEMENT LOCAL</Text><Text style={s.title}>Catalogue non configuré.</Text><Text style={s.copy}>Ajoutez les variables publiques Supabase d’Expo. Aucune donnée fictive ne sera affichée en remplacement.</Text></View>;
  }
  if (status === 'error') {
    return <View style={s.card}><Text style={s.overline}>CONNEXION IMPOSSIBLE</Text><Text style={s.title}>Le catalogue ne répond pas.</Text><Text style={s.copy}>Vos données restent intactes. Vérifiez la connexion puis réessayez.</Text><Pressable accessibilityRole="button" style={s.retry} onPress={onRetry}><Text style={s.retryText}>RÉESSAYER</Text></Pressable></View>;
  }
  return <View style={s.card}><Text style={s.overline}>CATALOGUE EN CONSTRUCTION</Text><Text style={s.title}>Aucun produit publié.</Text><Text style={s.copy}>Les premiers produits apparaîtront après approbation de leur boutique et de leur preuve.</Text></View>;
}

const s=StyleSheet.create({card:{marginTop:16,padding:24,backgroundColor:'#e0d5c3',alignItems:'flex-start'},overline:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:'#687069'},title:{marginTop:12,fontSize:19,fontWeight:'900',color:'#17201c'},copy:{marginTop:9,fontSize:11,lineHeight:18,color:'#606761'},retry:{marginTop:18,paddingVertical:11,paddingHorizontal:15,backgroundColor:'#092b5d'},retryText:{color:'white',fontSize:9,fontWeight:'900'}});
