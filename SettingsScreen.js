import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RecordingContext } from './constants';
import { supabase } from './supabase';
import EditProfileScreen from './EditProfileScreen';

const SCREEN_W = Dimensions.get('window').width;

const STAMP_FONT = 'Courier New';

function getInitials(fullName, username) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (username ?? '??').slice(0, 2).toUpperCase();
}

// ─── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteConfirmModal({ visible, onCancel, onConfirm, loading }) {
  const [input, setInput] = useState('');
  const confirmed = input === 'DELETE';

  useEffect(() => {
    if (!visible) setInput('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={deleteStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={deleteStyles.card}>
          <Text style={deleteStyles.heading}>delete account</Text>
          <Text style={deleteStyles.body}>
            Permanent. All your moments and data will be erased.{'\n\n'}
            Type{' '}
            <Text style={deleteStyles.emphasis}>DELETE</Text>
            {' '}to confirm.
          </Text>
          <TextInput
            style={deleteStyles.input}
            value={input}
            onChangeText={setInput}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor="rgba(245,241,232,0.2)"
          />
          <View style={deleteStyles.buttonRow}>
            <Pressable style={deleteStyles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={deleteStyles.cancelText}>cancel</Text>
            </Pressable>
            <Pressable
              style={[deleteStyles.confirmBtn, !confirmed && deleteStyles.confirmBtnDisabled]}
              onPress={confirmed ? onConfirm : undefined}
              disabled={!confirmed || loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={COLORS.text} />
                : <Text style={[deleteStyles.confirmText, !confirmed && deleteStyles.confirmTextDisabled]}>delete</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Settings sheet ─────────────────────────────────────────────────────────────

export default function SettingsScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { profile, setProfile } = useContext(RecordingContext);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Internal slide navigation
  const settingsSlide = useRef(new Animated.Value(0)).current;
  const editSlide = useRef(new Animated.Value(SCREEN_W)).current;
  const [editActive, setEditActive] = useState(false);

  // Reset slide state when modal closes
  useEffect(() => {
    if (!visible) {
      settingsSlide.setValue(0);
      editSlide.setValue(SCREEN_W);
      setEditActive(false);
    }
  }, [visible]);

  const openEditProfile = () => {
    setEditActive(true);
    Animated.parallel([
      Animated.timing(settingsSlide, { toValue: -SCREEN_W, duration: 300, useNativeDriver: true }),
      Animated.timing(editSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const closeEditProfile = () => {
    Animated.parallel([
      Animated.timing(settingsSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(editSlide, { toValue: SCREEN_W, duration: 280, useNativeDriver: true }),
    ]).start(() => setEditActive(false));
  };

  const handleClose = () => {
    setShowDelete(false);
    onClose();
  };

  const handleBackPress = () => {
    if (editActive) { closeEditProfile(); return; }
    handleClose();
  };

  const handleSignOut = () => {
    Alert.alert('sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.error('Sign out failed:', err.message);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');
      await supabase.from('profiles').delete().eq('id', user.id);
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Delete account failed:', err.message);
      Alert.alert('Error', 'Could not delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
      setShowDelete(false);
    }
  };

  const handleProfileUpdated = (updates) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const initials = getInitials(profile?.full_name, profile?.username);
  const displayName = profile?.full_name || profile?.username || '—';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBackPress}>
      <View style={{ flex: 1, backgroundColor: COLORS.background, overflow: 'hidden' }}>

        {/* ── Settings panel ─────────────────────────────────────────────── */}
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: settingsSlide }] }]}
        >
          <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>

            <View style={styles.header}>
              <Text style={styles.headerTitle}>settings</Text>
              <Pressable style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <Pressable style={styles.profileRow} onPress={openEditProfile}>
              <View style={styles.avatar}>
                {profile?.avatar_url && !avatarError
                  ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} onError={() => setAvatarError(true)} />
                  : <Text style={styles.avatarText}>{initials}</Text>
                }
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.displayName}>{displayName}</Text>
                <Text style={styles.editHint}>edit profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.secondary} />
            </Pressable>

            <View style={styles.divider} />

            <View style={styles.buttonSection}>
              <Pressable style={styles.signOutButton} onPress={handleSignOut}>
                <Text style={styles.signOutText}>sign out</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }} />

            <View style={styles.deleteSection}>
              <Pressable style={styles.deleteButton} onPress={() => setShowDelete(true)}>
                <Text style={styles.deleteText}>delete account</Text>
              </Pressable>
            </View>

          </View>
        </Animated.View>

        {/* ── Edit profile panel ─────────────────────────────────────────── */}
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: editSlide }] }]}
          pointerEvents={editActive ? 'auto' : 'none'}
        >
          <EditProfileScreen
            onBack={closeEditProfile}
            onProfileUpdated={handleProfileUpdated}
          />
        </Animated.View>

      </View>

      <DeleteConfirmModal
        visible={showDelete}
        onCancel={() => setShowDelete(false)}
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 24,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
  },
  editHint: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(245,241,232,0.08)',
    marginVertical: 16,
    marginHorizontal: 4,
  },
  buttonSection: {
    gap: 10,
  },
  signOutButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
  },
  signOutText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deleteSection: {
    paddingTop: 8,
  },
  deleteButton: {
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.accent}55`,
  },
  deleteText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

const deleteStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.1)',
    padding: 28,
    width: '100%',
    maxWidth: 360,
  },
  heading: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 12,
  },
  body: {
    fontSize: 13,
    color: COLORS.secondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  emphasis: {
    fontWeight: '700',
    color: COLORS.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    marginBottom: 20,
    letterSpacing: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.15)',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    color: COLORS.secondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: `${COLORS.accent}33`,
  },
  confirmText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  confirmTextDisabled: {
    color: `${COLORS.accent}66`,
  },
});
