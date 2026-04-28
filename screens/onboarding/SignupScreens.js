import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';

// ─── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#F5F1E8',
  accent: '#C86A4A',
  brown: '#7A5C4D',
  charcoal: '#1F1F1F',
  inputBg: 'rgba(122,92,77,0.08)',
  error: '#C04040',
  success: '#4A8C5C',
};

const STAMP_FONT = 'Courier New';
const PIN_SIZE = 56; // fixed size for splash screen pins
const CLUSTER_STEP_X = 5;
const CLUSTER_STEP_Y = 4;

// ─── Helpers (copied from MapScreen) ──────────────────────────────────────────

function getInitials(fullName, username) {
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username) return username.slice(0, 2).toUpperCase();
  return '??';
}

function formatPinDate(timestamp) {
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

// ─── Pin components (copied from MapScreen, COLORS.* → C.*) ──────────────────

function PolaroidPin({ thumbnailUri, timestamp, hereToo = false, ownerProfile = null, size = 64 }) {
  const [badgeError, setBadgeError] = useState(false);
  const frameColor = hereToo ? '#F5F1E8' : C.accent;
  const stripColor = hereToo ? '#FFFFFF' : C.accent;
  const dateColor = hereToo ? C.brown : '#F5F1E8';
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  const avatarSize = Math.round(size * 0.28);
  return (
    <View style={pinStyles.container}>
      <View style={[pinStyles.frame, { width: size, backgroundColor: frameColor }]}>
        <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
          {thumbnailUri ? (
            <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
          ) : (
            <View style={pinStyles.placeholder} />
          )}
        </View>
        {hereToo && ownerProfile && (
          <View style={[pinStyles.cornerBadge, { top: pad, left: pad, width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, overflow: 'hidden' }]}>
            {ownerProfile.avatar_url && !badgeError
              ? <Image source={{ uri: ownerProfile.avatar_url }} style={{ width: avatarSize, height: avatarSize }} onError={() => setBadgeError(true)} />
              : <Text style={[pinStyles.cornerBadgeText, { fontSize: Math.max(6, Math.round(avatarSize * 0.42)) }]}>{getInitials(ownerProfile.full_name, ownerProfile.username)}</Text>
            }
          </View>
        )}
        <View style={[pinStyles.strip, { height: stripH, backgroundColor: stripColor }]}>
          <Text style={[pinStyles.dateText, { color: dateColor, fontSize }]}>
            {formatPinDate(timestamp)}
          </Text>
        </View>
      </View>
      <View style={pinStyles.stem} />
      <View style={pinStyles.dot} />
    </View>
  );
}

function ClusterPin({ thumbnailUri, timestamp, count, frontHereToo = false, size = 64 }) {
  const frameColor = frontHereToo ? '#F5F1E8' : C.accent;
  const stripColor = frontHereToo ? '#FFFFFF' : C.accent;
  const dateColor = frontHereToo ? C.brown : '#F5F1E8';
  const stackW = size + CLUSTER_STEP_X * 2;
  const stemOffset = stackW - size / 2;
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  const frameH = imgH + stripH + pad;
  return (
    <View style={clusterPinStyles.outerContainer}>
      <View style={{ width: stackW, height: frameH + CLUSTER_STEP_Y * 2 }}>
        {/* Back frames */}
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X * 2, bottom: CLUSTER_STEP_Y * 2,
        }]} />
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X, bottom: CLUSTER_STEP_Y,
        }]} />
        {/* Front frame */}
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: 0, bottom: 0,
        }]}>
          <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
            {thumbnailUri ? (
              <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
            ) : (
              <View style={pinStyles.placeholder} />
            )}
          </View>
          <View style={[clusterPinStyles.strip, { height: stripH, backgroundColor: stripColor }]}>
            <Text style={[pinStyles.dateText, { color: dateColor, fontSize }]}>
              {formatPinDate(timestamp)}
            </Text>
          </View>
          <View style={clusterPinStyles.badge}>
            <Text style={clusterPinStyles.badgeText}>{count}</Text>
          </View>
        </View>
      </View>
      <View style={{ width: stackW }}>
        <View style={[pinStyles.stem, { marginLeft: stemOffset - 1 }]} />
        <View style={[pinStyles.dot, { marginLeft: stemOffset - 3 }]} />
      </View>
    </View>
  );
}

// ─── Splash screen pin data ────────────────────────────────────────────────────
// Adelaide map view: centre -34.9285, 138.6007 / delta 0.13

const SPLASH_PINS = [
  // Single moments
  { id: 's1', type: 'single',  latitude: -34.883, longitude: 138.562, timestamp: 1700000000000 },
  { id: 's2', type: 'single',  latitude: -34.958, longitude: 138.648, timestamp: 1700090000000 },
  { id: 's3', type: 'single',  latitude: -34.967, longitude: 138.578, timestamp: 1700180000000 },
  // Cluster (3 moments)
  { id: 'c1', type: 'cluster', latitude: -34.906, longitude: 138.641, count: 3, timestamp: 1700270000000 },
  // Here Too
  { id: 'h1', type: 'hereToo', latitude: -34.927, longitude: 138.585, timestamp: 1700360000000 },
];

// ─── Shared form components ────────────────────────────────────────────────────

function BackButton({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={14}>
      <Ionicons name="arrow-back" size={22} color={C.charcoal} />
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled, loading }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[ss.btn, (disabled || loading) && ss.btnDisabled]}
    >
      {loading
        ? <ActivityIndicator color={C.bg} size="small" />
        : <Text style={ss.btnText}>{label}</Text>
      }
    </Pressable>
  );
}

// ─── Form screen shell ─────────────────────────────────────────────────────────
// Wordmark fixed at top. Content vertically centred in the middle.
// Footer absolutely pinned to bottom — never moves, keyboard does not affect it.

function FormScreen({ onBack, heading, children, footer }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Top: wordmark centred, optional back button left ── */}
      <View style={[ss.topRow, { paddingTop: insets.top + 16 }]}>
        <View style={ss.topSide}>
          {onBack && <BackButton onPress={onBack} />}
        </View>
        <Text style={ss.topWordmark}>avyda</Text>
        <View style={ss.topSide} />
      </View>

      {/* ── Middle: heading + input vertically centred, unaffected by keyboard ── */}
      <View style={ss.midContent}>
        <Text style={ss.heading}>{heading}</Text>
        {children}
      </View>

      {/* ── Bottom: absolutely pinned — never moves when keyboard opens ── */}
      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        {footer}
      </View>
    </View>
  );
}

// ─── Screen 1 — SplashScreen ───────────────────────────────────────────────────

export function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const stackW = PIN_SIZE + CLUSTER_STEP_X * 2;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        mapType="mutedStandard"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        initialRegion={{
          latitude: -34.9285,
          longitude: 138.6007,
          latitudeDelta: 0.13,
          longitudeDelta: 0.13,
        }}
      >
        {SPLASH_PINS.map(pin => {
          const isCluster = pin.type === 'cluster';
          const anchorX = isCluster ? (stackW - PIN_SIZE / 2) / stackW : 0.5;

          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              anchor={{ x: anchorX, y: 1 }}
              tracksViewChanges={false}
            >
              {isCluster ? (
                <ClusterPin
                  thumbnailUri={null}
                  timestamp={pin.timestamp}
                  count={pin.count}
                  frontHereToo={false}
                  size={PIN_SIZE}
                />
              ) : (
                <PolaroidPin
                  thumbnailUri={null}
                  timestamp={pin.timestamp}
                  hereToo={pin.type === 'hereToo'}
                  ownerProfile={null}
                  size={PIN_SIZE}
                />
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* Wordmark — terracotta over map */}
      <View style={[ss.splashWordmarkWrap, { paddingTop: insets.top + 20 }]} pointerEvents="none">
        <Text style={ss.splashWordmark}>avyda</Text>
      </View>

      {/* Bottom sheet — fully opaque off-white */}
      <View style={[ss.splashOverlay, { paddingBottom: Math.max(insets.bottom, 40) }]}>
        <PrimaryButton
          label="Create account"
          onPress={() => navigation.navigate('EmailScreen')}
        />
        <Pressable
          onPress={() => navigation.navigate('SignInScreen')}
          style={{ marginTop: 18, alignSelf: 'center' }}
        >
          <Text style={ss.splashSignIn}>Sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen 2 — EmailScreen ────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const isValid = EMAIL_RE.test(email);
  const showError = touched && email.length > 0 && !isValid;

  return (
    <FormScreen
      heading={"What's your\nemail?"}
      footer={
        <>
          <PrimaryButton
            label="Continue"
            disabled={!isValid}
            onPress={() => navigation.navigate('PasswordScreen', { email })}
          />
          <Pressable
            onPress={() => navigation.navigate('SignInScreen')}
            style={{ marginTop: 18, alignSelf: 'center' }}
          >
            <Text style={ss.footerLink}>Already have an account? Sign in</Text>
          </Pressable>
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <TextInput
          style={ss.input}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched(true)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          placeholder="you@example.com"
          placeholderTextColor={C.brown + '66'}
        />
        {showError && (
          <Text style={ss.errorHint}>Enter a valid email address</Text>
        )}
      </View>
    </FormScreen>
  );
}

// ─── Screen 3 — PasswordScreen ─────────────────────────────────────────────────

export function PasswordScreen({ navigation, route }) {
  const { email } = route.params;
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const isValid = password.length >= 8;

  return (
    <FormScreen
      onBack={() => navigation.goBack()}
      heading={'Create a\npassword.'}
      footer={
        <PrimaryButton
          label="Continue"
          disabled={!isValid}
          onPress={() => navigation.navigate('UsernameScreen', { email, password })}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <View style={ss.inputRow}>
          <TextInput
            style={ss.inputRowField}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="Password"
            placeholderTextColor={C.brown + '66'}
          />
          <Pressable onPress={() => setVisible(v => !v)} style={ss.eyeBtn} hitSlop={8}>
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={C.brown}
            />
          </Pressable>
        </View>
        <Text style={ss.fieldHint}>At least 8 characters</Text>
      </View>
    </FormScreen>
  );
}

// ─── Screen 4 — UsernameScreen ─────────────────────────────────────────────────

export function UsernameScreen({ navigation, route }) {
  const { email, password } = route.params;
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null); // null | true | false
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = username.trim();
    if (!trimmed) {
      setAvailable(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    setAvailable(null);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', trimmed)
        .maybeSingle();
      setAvailable(data === null);
      setChecking(false);
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [username]);

  const canSubmit = username.trim().length > 0 && available === true && !submitting;
  const isTaken = !checking && available === false && username.trim().length > 0;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Sign-up did not return a session. Check your email to confirm then sign in.');

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: session.user.id, username: username.trim(), onboarded: false });
      if (profileError) throw profileError;

      navigation.navigate('AhaScreen');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScreen
      onBack={() => navigation.goBack()}
      heading={'Pick a\nusername.'}
      footer={
        <PrimaryButton
          label="Continue"
          disabled={!canSubmit}
          loading={submitting}
          onPress={handleSubmit}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <View style={ss.inputRow}>
          <Text style={ss.atPrefix}>@</Text>
          <TextInput
            style={ss.inputRowField}
            value={username}
            onChangeText={v => { setUsername(v); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="username"
            placeholderTextColor={C.brown + '66'}
          />
          <View style={ss.statusIcon}>
            {checking && <ActivityIndicator size="small" color={C.accent} />}
            {!checking && available === true && (
              <Ionicons name="checkmark-circle" size={20} color={C.success} />
            )}
          </View>
        </View>
        {isTaken && <Text style={ss.errorHint}>Username already taken</Text>}
        {error ? <Text style={ss.errorHint}>{error}</Text> : null}
      </View>
    </FormScreen>
  );
}

// ─── Pin styles (copied from MapScreen) ───────────────────────────────────────

const pinStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  frame: {
    borderRadius: 3,
    overflow: 'hidden',
  },
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: C.brown,
    opacity: 0.4,
  },
  cornerBadge: {
    position: 'absolute',
    backgroundColor: C.brown,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    borderWidth: 1,
    borderColor: 'rgba(31,31,31,0.3)',
  },
  cornerBadgeText: {
    color: '#F5F1E8',
    fontWeight: '700',
    fontFamily: STAMP_FONT,
  },
  strip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: STAMP_FONT,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stem: {
    width: 2,
    height: 8,
    backgroundColor: C.brown,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.brown,
  },
});

const clusterPinStyles = StyleSheet.create({
  outerContainer: {
    alignItems: 'flex-start',
  },
  frame: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
  },
  strip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#F5F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  badgeText: {
    color: C.accent,
    fontSize: 9,
    fontWeight: '700',
  },
});

// ─── Screen styles ─────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  // ── Splash ──
  splashWordmarkWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  splashWordmark: {
    fontSize: 32,
    fontWeight: '500',
    color: C.accent,
    letterSpacing: 2,
  },
  splashOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.bg,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  splashSignIn: {
    color: C.brown,
    fontSize: 14,
    fontWeight: '400',
  },

  // ── Form screen ──
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
  topWordmark: {
    fontSize: 32,
    fontWeight: '500',
    color: C.accent,
    letterSpacing: 2,
  },
  midContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: SCREEN_HEIGHT * 0.21,
    paddingHorizontal: 28,
    gap: 28,
  },
  heading: {
    fontSize: 26,
    fontWeight: '500',
    color: C.charcoal,
    lineHeight: 34,
  },
  // Absolutely pinned footer — never moves regardless of keyboard state
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
  footerLink: {
    color: C.brown,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },

  // ── Inputs ──
  input: {
    backgroundColor: C.inputBg,
    color: C.charcoal,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputRowField: {
    flex: 1,
    color: C.charcoal,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  atPrefix: {
    color: C.brown,
    fontSize: 16,
    fontWeight: '500',
    paddingLeft: 14,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  statusIcon: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldHint: {
    color: C.brown,
    fontSize: 12,
    paddingLeft: 4,
  },
  errorHint: {
    color: C.error,
    fontSize: 12,
    paddingLeft: 4,
  },

  // ── Button ──
  btn: {
    backgroundColor: C.accent,
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
