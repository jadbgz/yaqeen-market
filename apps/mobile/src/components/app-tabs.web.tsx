import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const items=[['index','Accueil','/'],['explore','Explorer','/explore']] as const;
export default function AppTabs(){return <Tabs><TabSlot/><TabList asChild><View style={s.nav}>{items.map(([name,label,href])=><TabTrigger name={name} href={href as Href} asChild key={name}><Pressable style={s.button}><Text style={s.label}>{label}</Text></Pressable></TabTrigger>)}</View></TabList></Tabs>}
const s=StyleSheet.create({nav:{position:'absolute',left:0,right:0,bottom:0,height:60,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:150,borderTopWidth:1,borderTopColor:'#17201c25',backgroundColor:'#eee6d9'},button:{paddingHorizontal:22,paddingVertical:12},label:{fontSize:11,fontWeight:'700',color:'#17201c'}});
