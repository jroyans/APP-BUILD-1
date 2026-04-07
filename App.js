import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';

import { COLORS, RecordingContext, LocationPin } from './constants';
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
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <LocationPin color={color} size={20} />
    </View>
  );
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
