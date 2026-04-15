import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from './constants';
import { supabase } from './supabase';

const STAMP_FONT = 'Courier New';

function getInitials(fullName, username) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (username ?? '??').slice(0, 2).toUpperCase();
}

function Avatar({ fullName, username }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{getInitials(fullName, username)}</Text>
    </View>
  );
}

export default function CircleScreen({ visible, onClose, onCircleChanged }) {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [requests, setRequests] = useState([]);
  const [circleMembers, setCircleMembers] = useState([]);
  const [sentRequestIds, setSentRequestIds] = useState(new Set());
  const [circleMemberIds, setCircleMemberIds] = useState(new Set());
  const searchTimeout = useRef(null);

  useEffect(() => {
    if (visible) fetchAll();
  }, [visible]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchText.trim() || !currentUser) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(() => runSearch(searchText), 300);
    return () => clearTimeout(searchTimeout.current);
  }, [searchText, currentUser]);

  const fetchAll = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      const [requestsRes, circleRes, sentRes] = await Promise.all([
        supabase.from('circle_requests').select('*').eq('receiver_id', user.id).eq('status', 'pending'),
        supabase.from('circles').select('*').eq('user_id', user.id),
        supabase.from('circle_requests').select('receiver_id').eq('sender_id', user.id).eq('status', 'pending'),
      ]);

      const pendingRequests = requestsRes.data ?? [];
      const circleRows = circleRes.data ?? [];
      const sentRows = sentRes.data ?? [];

      const profileIds = [
        ...pendingRequests.map(r => r.sender_id),
        ...circleRows.map(r => r.circle_member_id),
      ].filter(Boolean);

      let profileMap = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', profileIds);
        (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
      }

      setRequests(pendingRequests.map(r => ({ ...r, profile: profileMap[r.sender_id] ?? null })));
      setCircleMembers(circleRows.map(r => ({ ...r, profile: profileMap[r.circle_member_id] ?? null })));
      setSentRequestIds(new Set(sentRows.map(r => r.receiver_id)));
      setCircleMemberIds(new Set(circleRows.map(r => r.circle_member_id)));
    } catch (err) {
      console.error('CircleScreen fetchAll failed:', err.message);
    }
  };

  const runSearch = async (text) => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${text}%`)
        .neq('id', currentUser.id)
        .limit(20);
      if (error) throw error;
      setSearchResults(data ?? []);
    } catch (err) {
      console.error('Search failed:', err.message);
    }
  };

  const sendRequest = async (targetId) => {
    try {
      const { data: existing } = await supabase
        .from('circle_requests')
        .select('id')
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`
        );

      if (existing && existing.length > 0) {
        await supabase
          .from('circle_requests')
          .delete()
          .in('id', existing.map(r => r.id));
      }

      const { error } = await supabase.from('circle_requests').insert({
        sender_id: currentUser.id,
        receiver_id: targetId,
        status: 'pending',
      });
      if (error) throw error;
      setSentRequestIds(prev => new Set([...prev, targetId]));
    } catch (err) {
      console.error('Send request failed:', err.message);
    }
  };

  const acceptRequest = async (request) => {
    try {
      await supabase.from('circles').insert({ user_id: currentUser.id, circle_member_id: request.sender_id });
    } catch (_) {}
    try {
      await supabase.from('circles').insert({ user_id: request.sender_id, circle_member_id: currentUser.id });
    } catch (_) {}
    try {
      await supabase.from('circle_requests').update({ status: 'accepted' }).eq('id', request.id);
    } catch (err) {
      console.error('Accept status update failed:', err.message);
    }
    await fetchAll();
    onCircleChanged?.();
  };

  const declineRequest = async (request) => {
    try {
      const { error } = await supabase
        .from('circle_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);
      if (error) throw error;
      setRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (err) {
      console.error('Decline failed:', err.message);
    }
  };

  const handleClose = () => {
    setSearchText('');
    setSearchResults([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>circle</Text>
          {circleMembers.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{circleMembers.length}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search bar */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="search by username..."
              placeholderTextColor={COLORS.secondary}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Search results */}
          {searchText.trim() ? (
            searchResults.length > 0 ? (
              <View style={styles.section}>
                {searchResults.map(result => {
                  const isInCircle = circleMemberIds.has(result.id);
                  const isPending = sentRequestIds.has(result.id);
                  return (
                    <View key={result.id} style={styles.userRow}>
                      <Avatar fullName={result.full_name} username={result.username} />
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{result.full_name || result.username}</Text>
                        <Text style={styles.userMeta}>
                          @{result.username}{result.home_location ? ` · ${result.home_location}` : ''}
                        </Text>
                      </View>
                      {isInCircle ? (
                        <View style={styles.inCircleButton}>
                          <Text style={styles.inCircleText}>in circle</Text>
                        </View>
                      ) : isPending ? (
                        <View style={styles.requestedButton}>
                          <Text style={styles.requestedText}>requested</Text>
                        </View>
                      ) : (
                        <Pressable style={styles.addButton} onPress={() => sendRequest(result.id)}>
                          <Text style={styles.addButtonText}>+ circle</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyLabel}>no users found</Text>
            )
          ) : null}

          {/* Requests section */}
          <View style={styles.section}>
            {requests.length === 0 ? (
              <>
                <Text style={styles.sectionLabel}>incoming requests</Text>
                <Text style={styles.requestsEmptyText}>no pending requests</Text>
              </>
            ) : (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>incoming requests</Text>
                  <View style={styles.requestsBadge}>
                    <Text style={styles.requestsBadgeText}>{requests.length}</Text>
                  </View>
                </View>
                {requests.map(request => (
                  <View key={request.id} style={styles.userRow}>
                    <Avatar fullName={request.profile?.full_name} username={request.profile?.username} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>
                        {request.profile?.full_name || request.profile?.username || 'Unknown'}
                      </Text>
                      <Text style={styles.userMeta}>@{request.profile?.username ?? '—'}</Text>
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.declineButton} onPress={() => declineRequest(request)}>
                        <Text style={styles.declineText}>decline</Text>
                      </Pressable>
                      <Pressable style={styles.acceptButton} onPress={() => acceptRequest(request)}>
                        <Text style={styles.acceptText}>accept</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>

          {/* My Circle section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>my circle — {circleMembers.length} people</Text>
            {circleMembers.length === 0 ? (
              <Text style={styles.emptyLabel}>no one in your circle yet</Text>
            ) : (
              circleMembers.map(member => (
                <View key={member.id} style={styles.userRow}>
                  <Avatar fullName={member.profile?.full_name} username={member.profile?.username} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {member.profile?.full_name || member.profile?.username || 'Unknown'}
                    </Text>
                    <Text style={styles.userMeta}>
                      @{member.profile?.username ?? '—'}
                      {member.profile?.home_location ? ` · ${member.profile.home_location}` : ''}
                    </Text>
                  </View>
                  <View style={styles.inCircleButton}>
                    <Text style={styles.inCircleText}>in circle</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  countBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    color: COLORS.secondary,
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: STAMP_FONT,
    padding: 0,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionLabel: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: STAMP_FONT,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  requestsBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  requestsBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  userMeta: {
    color: COLORS.secondary,
    fontSize: 11,
    fontFamily: STAMP_FONT,
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  requestedButton: {
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  requestedText: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  inCircleButton: {
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  inCircleText: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  acceptButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  acceptText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  declineText: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  emptyLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    fontFamily: STAMP_FONT,
    opacity: 0.7,
  },
  requestsEmptyText: {
    color: '#7A5C4D',
    fontSize: 12,
    fontFamily: STAMP_FONT,
  },
});
