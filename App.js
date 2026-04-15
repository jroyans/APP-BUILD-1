import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RecordingContext } from './constants';
import { supabase } from './supabase';
import AuthScreen from './AuthScreen';
import CameraScreen from './CameraScreen';
import FeedScreen from './FeedScreen';
import MapScreen from './MapScreen';

const Tab = createBottomTabNavigator();

// ─── Tab icons ────────────────────────────────────────────────────────────────

function FeedIcon({ color }) {
  return (
    <View style={{ justifyContent: 'center', gap: 4 }}>
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
    </View>
  );
}

function RecordTabIcon() {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent }} />
  );
}

function MapIcon({ color }) {
  return <Ionicons name="person-circle" size={24} color={color} />;
}

// ─── Animated tab bar ─────────────────────────────────────────────────────────

function AnimatedTabBar(props) {
  const { isRecording } = useContext(RecordingContext);
  const translateY = useRef(new Animated.Value(0)).current;
  const prevRecording = useRef(false);

  useEffect(() => {
    if (isRecording === prevRecording.current) return;
    prevRecording.current = isRecording;
    Animated.timing(translateY, {
      toValue: isRecording ? 60 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isRecording]);

  return (
    <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, transform: [{ translateY }] }}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
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
    <RecordingContext.Provider value={{ isRecording, setIsRecording }}>
      <NavigationContainer>
        <Tab.Navigator
          tabBar={props => <AnimatedTabBar {...props} />}
          sceneContainerStyle={{ backgroundColor: 'transparent' }}
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: COLORS.background,
              borderTopColor: COLORS.surface,
              borderTopWidth: 0.5,
              height: 60,
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
      </NavigationContainer>
    </RecordingContext.Provider>
  );
}
