import { Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  SplashScreen,
  EmailScreen,
  PasswordScreen,
  UsernameScreen,
} from './SignupScreens';
import AhaScreen from './AhaScreen';
import AuthScreen from '../../AuthScreen';
import {
  PermissionsIntroScreen,
  CameraPermissionScreen,
  PhotoPermissionScreen,
  NotificationsPermissionScreen,
} from './PermissionsScreens';
import { SetupIntroScreen, NameScreen, AvatarScreen, HomeLocationScreen } from './SetupScreens';

const Stack = createNativeStackNavigator();

// Screens not yet built
const PLACEHOLDER_NAMES = [
  'HabitCameraScreen',
  'HabitFeedMapScreen',
  'HabitHereTooScreen',
  'HabitProfileMapScreen',
  'YoureReadyScreen',
];

function PlaceholderScreen({ route }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F1E8', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Courier', fontSize: 16, color: '#1F1F1F' }}>{route.name}</Text>
    </View>
  );
}

function SignInScreen() {
  return <AuthScreen onAuth={() => {}} />;
}

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {/* ── Signup ── */}
      <Stack.Screen name="SplashScreen"  component={SplashScreen} />
      <Stack.Screen name="EmailScreen"   component={EmailScreen} />
      <Stack.Screen name="PasswordScreen" component={PasswordScreen} />
      <Stack.Screen name="UsernameScreen" component={UsernameScreen} />

      {/* ── Aha moment sequence (single screen manages all 4 stages) ── */}
      <Stack.Screen name="AhaScreen" component={AhaScreen} />

      {/* ── Permissions ── */}
      <Stack.Screen name="PermissionsIntroScreen"       component={PermissionsIntroScreen} />
      <Stack.Screen name="CameraPermissionScreen"       component={CameraPermissionScreen} />
      <Stack.Screen name="PhotoPermissionScreen"        component={PhotoPermissionScreen} />
      <Stack.Screen name="NotificationsPermissionScreen" component={NotificationsPermissionScreen} />

      {/* ── Setup ── */}
      <Stack.Screen name="SetupIntroScreen"    component={SetupIntroScreen} />
      <Stack.Screen name="NameScreen"          component={NameScreen} />
      <Stack.Screen name="AvatarScreen"        component={AvatarScreen} />
      <Stack.Screen name="HomeLocationScreen"  component={HomeLocationScreen} />

      {/* ── Sign-in exit route ── */}
      <Stack.Screen name="SignInScreen" component={SignInScreen} />

      {/* ── Placeholder screens ── */}
      {PLACEHOLDER_NAMES.map(name => (
        <Stack.Screen key={name} name={name} component={PlaceholderScreen} />
      ))}
    </Stack.Navigator>
  );
}
