import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';

// ─── Brand tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:      '#F5F1E8',
  accent:  '#C86A4A',
  brown:   '#7A5C4D',
  charcoal:'#1F1F1F',
};

// ─── Shared shell ──────────────────────────────────────────────────────────────

function PermissionScreen({ onBack, icon, heading, body, note, buttonLabel, onPress }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ss.screen, { backgroundColor: C.bg }]}>
      {/* ── Top bar ── */}
      <View style={[ss.topRow, { paddingTop: insets.top + 16 }]}>
        <View style={ss.topSide}>
          {onBack && (
            <Pressable onPress={onBack} hitSlop={14}>
              <Ionicons name="arrow-back" size={22} color={C.charcoal} />
            </Pressable>
          )}
        </View>
        <Text style={ss.wordmark}>avyda</Text>
        <View style={ss.topSide} />
      </View>

      {/* ── Centre content ── */}
      <View style={ss.mid}>
        {icon}
        <Text style={ss.heading}>{heading}</Text>
        <Text style={ss.body}>{body}</Text>
        {note && <Text style={ss.note}>{note}</Text>}
      </View>

      {/* ── Fixed bottom button ── */}
      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Pressable style={ss.btn} onPress={onPress}>
          <Text style={ss.btnText}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen 9 — PermissionsIntroScreen ────────────────────────────────────────

export function PermissionsIntroScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ss.screen, { backgroundColor: C.bg }]}>
      {/* ── Top bar (no back button on intro) ── */}
      <View style={[ss.topRow, { paddingTop: insets.top + 16 }]}>
        <View style={ss.topSide} />
        <Text style={ss.wordmark}>avyda</Text>
        <View style={ss.topSide} />
      </View>

      {/* ── Centre content ── */}
      <View style={ss.mid}>
        <Text style={ss.introLabel}>just a couple of things</Text>
        <Text style={ss.introHeading}>Before we go further, Avyda needs a few things.</Text>
        <Text style={ss.introBody}>
          We'll ask one at a time and explain why each one matters.
        </Text>
      </View>

      {/* ── Fixed bottom button ── */}
      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Pressable
          style={ss.btn}
          onPress={() => navigation.navigate('CameraPermissionScreen')}
        >
          <Text style={ss.btnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen 10 — CameraPermissionScreen ───────────────────────────────────────

export function CameraPermissionScreen({ navigation }) {
  async function handlePress() {
    await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      Camera.requestMicrophonePermissionsAsync(),
    ]);
    navigation.navigate('PhotoPermissionScreen');
  }

  const icon = (
    <View style={ss.iconOuter}>
      <View style={ss.iconInnerCircle} />
    </View>
  );

  return (
    <PermissionScreen
      onBack={() => navigation.goBack()}
      icon={icon}
      heading="Camera & microphone"
      body="To record your moments, Avyda needs access to your camera and microphone."
      note="You'll see an iOS prompt next."
      buttonLabel="Allow access"
      onPress={handlePress}
    />
  );
}

// ─── Screen 11 — PhotoPermissionScreen ────────────────────────────────────────

export function PhotoPermissionScreen({ navigation }) {
  async function handlePress() {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    navigation.navigate('NotificationsPermissionScreen');
  }

  const icon = (
    <View style={ss.iconOuterSquare}>
      <View style={ss.iconInnerSquare} />
    </View>
  );

  return (
    <PermissionScreen
      onBack={() => navigation.goBack()}
      icon={icon}
      heading="Photo library"
      body="To set your avatar, Avyda needs access to your photos."
      note="You'll see an iOS prompt next."
      buttonLabel="Allow access"
      onPress={handlePress}
    />
  );
}

// ─── Screen 12 — NotificationsPermissionScreen ────────────────────────────────

export function NotificationsPermissionScreen({ navigation }) {
  async function handlePress() {
    await Notifications.requestPermissionsAsync();
    navigation.navigate('NameScreen');
  }

  const icon = (
    <View style={ss.iconOuter}>
      <MaterialCommunityIcons name="bell" size={28} color={C.accent} />
    </View>
  );

  return (
    <PermissionScreen
      onBack={() => navigation.goBack()}
      icon={icon}
      heading="Notifications"
      body="When a friend was there too, you'll want to know."
      note="You'll see an iOS prompt next."
      buttonLabel="Allow access"
      onPress={handlePress}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // ── Top bar ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  topSide: {
    width: 40,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '500',
    color: C.accent,
    letterSpacing: 1,
  },

  // ── Centre ──
  mid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ── Intro screen text ──
  introLabel: {
    color: C.brown,
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 8,
    textAlign: 'center',
  },
  introHeading: {
    color: C.charcoal,
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 30,
  },
  introBody: {
    color: C.brown,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
  },

  // ── Permission screen text ──
  heading: {
    color: C.charcoal,
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
  },
  body: {
    color: C.brown,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
  },
  note: {
    color: C.brown,
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 8,
  },

  // ── Icons ──
  iconOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(200,106,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,106,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accent,
  },
  iconOuterSquare: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(200,106,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,106,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerSquare: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: C.accent,
  },

  // ── Button ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '500',
  },
});
