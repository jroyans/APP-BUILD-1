import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RecordingContext } from './constants';
import { supabase } from './supabase';
import AuthScreen from './AuthScreen';
import CameraScreen from './CameraScreen';
import FeedScreen from './FeedScreen';
import MapScreen from './MapScreen';
import FriendProfileScreen from './FriendProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab icons ────────────────────────────────────────────────────────────────

function FeedIcon({ color }) {
  return (
    <View style={{ justifyContent: 'center', gap: 5 }}>
      <View style={{ width: 23, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 23, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 23, height: 1.5, backgroundColor: color }} />
    </View>
  );
}

function RecordTabIcon() {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.accent }} />
  );
}

function MapIcon({ color }) {
  return <Ionicons name="person-circle" size={30} color={color} />;
}

// ─── Animated tab bar ─────────────────────────────────────────────────────────

function AnimatedTabBar(props) {
  const { isRecording, isStripOpen } = useContext(RecordingContext);
  const translateY = useRef(new Animated.Value(0)).current;
  const hidden = isRecording || isStripOpen;
  const prevHidden = useRef(false);

  useEffect(() => {
    if (hidden === prevHidden.current) return;
    prevHidden.current = hidden;
    Animated.timing(translateY, {
      toValue: hidden ? 71 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [hidden]);

  return (
    <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, transform: [{ translateY }] }}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Record"
      tabBar={props => <AnimatedTabBar {...props} />}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.surface,
          borderTopWidth: 0.5,
          height: 71,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingTop: 6,
          paddingBottom: 0,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: 'rgba(245,241,232,0.4)',
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ tabBarIcon: ({ color }) => <FeedIcon color={color} /> }}
      />
      <Tab.Screen
        name="Record"
        component={CameraScreen}
        options={{ tabBarIcon: () => <RecordTabIcon /> }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ tabBarIcon: ({ color }) => <MapIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [session, setSession] = useState(undefined);
  const [pendingClips, setPendingClips] = useState([]);
  const [isStripOpen, setIsStripOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  const addPendingClip = useCallback((clip) => {
    setPendingClips(prev => [...prev, clip]);
  }, []);

  const upgradePendingClip = useCallback((localId, remoteData) => {
    setPendingClips(prev => prev.map(c => c.localId === localId ? { ...c, ...remoteData } : c));
  }, []);

  const removePendingClip = useCallback((localId) => {
    setPendingClips(prev => prev.filter(c => c.localId !== localId));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setProfile(data); });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setProfile(data); });
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }

  if (session === null) {
    return <AuthScreen onAuth={() => {}} />;
  }

  return (
    <RecordingContext.Provider value={{ isRecording, setIsRecording, pendingClips, addPendingClip, upgradePendingClip, removePendingClip, isStripOpen, setIsStripOpen, profile, setProfile }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </RecordingContext.Provider>
  );
}
