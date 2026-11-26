import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { bleService, PeerConnectionInfo } from '@/services/bleService';
import { messageRepository } from '@/db/repositories/messageRepository';
import { Message, MessagePriority } from '@sync/shared';

const PRESET_MESSAGES = [
  { label: 'SOS Medical', desc: 'Medical emergency: Casualty requires immediate triage assistance.', priority: 'critical' as MessagePriority },
  { label: 'Resource Request', desc: 'Resource request: Clean drinking water and blankets needed for 20 displaced persons.', priority: 'high' as MessagePriority },
  { label: 'Hazard Alert', desc: 'Structural collapse warning: Roadway blocked at eastern perimeter.', priority: 'high' as MessagePriority },
];

export default function MessagingScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [connectedPeers, setConnectedPeers] = useState<PeerConnectionInfo[]>(bleService.getConnectedPeers());
  const [selectedPeerAddress, setSelectedPeerAddress] = useState<string>('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MessagePriority>('high');
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let isMounted = true;

    messageRepository.getAllMessages(50).then((list) => {
      if (isMounted) setMessages(list);
    });

    const unsubscribe = bleService.subscribe(() => {
      const peers = bleService.getConnectedPeers();
      setConnectedPeers(peers);
      if (peers.length > 0 && !selectedPeerAddress) {
        setSelectedPeerAddress(peers[0].address);
      }
      messageRepository.getAllMessages(50).then((list) => {
        if (isMounted) setMessages(list);
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedPeerAddress]);

  const handleSelectPreset = (preset: typeof PRESET_MESSAGES[0]) => {
    setDescription(preset.desc);
    setPriority(preset.priority);
  };

  const handleSend = async () => {
    if (!description.trim()) {
      setStatusMessage('Please enter a message description.');
      return;
    }

    if (!selectedPeerAddress) {
      setStatusMessage('No connected peer selected. Connect to a device in the Discovery tab first.');
      return;
    }

    setIsSending(true);
    setStatusMessage('Chunking and transferring payload over BLE...');

    try {
      const result = await bleService.sendMessage(
        selectedPeerAddress,
        {
          type: 'EMERGENCY_REPORT',
          description: description.trim(),
        },
        priority
      );

      if (result.success) {
        setStatusMessage('Message transferred and acknowledged by peer!');
        setDescription('');
      } else {
        setStatusMessage(`Transfer failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error: ${msg}`);
    } finally {
      setIsSending(false);
      messageRepository.getAllMessages(50).then((list) => setMessages(list));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>SYNC Messages</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Offline BLE · Device-to-Device
          </Text>
        </View>

        {/* Target Connected Device */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Target Connected Peer</Text>
          {connectedPeers.length === 0 ? (
            <Text style={[styles.noPeerText, { color: colors.textSecondary }]}>
              No peer connected. Go to Discovery tab to connect to a nearby SYNC node.
            </Text>
          ) : (
            <View style={styles.peerSelectorRow}>
              {connectedPeers.map((peer) => (
                <TouchableOpacity
                  key={peer.address}
                  style={[
                    styles.peerPill,
                    selectedPeerAddress === peer.address ? styles.peerPillActive : styles.peerPillInactive,
                  ]}
                  onPress={() => setSelectedPeerAddress(peer.address)}>
                  <Text style={styles.peerPillText}>
                    {peer.address} ({peer.role.toUpperCase()} - MTU {peer.mtu})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Compose Message */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Compose Emergency Report</Text>

          {/* Presets */}
          <View style={styles.presetsRow}>
            {PRESET_MESSAGES.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.presetBtn, { borderColor: colors.tint }]}
                onPress={() => handleSelectPreset(preset)}>
                <Text style={[styles.presetText, { color: colors.tint }]}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Priority Picker */}
          <View style={styles.priorityRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Priority:</Text>
            {(['normal', 'high', 'critical'] as MessagePriority[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.priorityBtn,
                  priority === p && p === 'critical' ? styles.priorityCritical : null,
                  priority === p && p === 'high' ? styles.priorityHigh : null,
                  priority === p && p === 'normal' ? styles.priorityNormal : null,
                ]}
                onPress={() => setPriority(p)}>
                <Text
                  style={[
                    styles.priorityBtnText,
                    priority === p ? styles.priorityBtnTextActive : { color: colors.textSecondary },
                  ]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input */}
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Enter structured emergency report details..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />

          {statusMessage && (
            <Text
              style={[
                styles.statusNotice,
                statusMessage.includes('failed') || statusMessage.includes('Error')
                  ? styles.statusError
                  : styles.statusSuccess,
              ]}>
              {statusMessage}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.sendBtn,
              isSending || !selectedPeerAddress ? styles.sendBtnDisabled : styles.sendBtnActive,
            ]}
            disabled={isSending || !selectedPeerAddress}
            onPress={handleSend}>
            {isSending ? (
              <View style={styles.sendLoadingRow}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.sendBtnText}>Transferring Chunks...</Text>
              </View>
            ) : (
              <Text style={styles.sendBtnText}>Dispatch Emergency Message via BLE</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Local SQLite Message Store */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Local SQLite Message Store ({messages.length})
          </Text>
        </View>

        {messages.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No messages persisted in SQLite yet.
            </Text>
          </View>
        ) : (
          messages.map((item) => {
            let payloadDesc = item.payload;
            try {
              const parsed = JSON.parse(item.payload);
              payloadDesc = parsed.description || parsed.type || item.payload;
            } catch {}

            return (
              <View key={item.messageId} style={[styles.msgCard, { backgroundColor: colors.backgroundElement }]}>
                <View style={styles.msgHeader}>
                  <Text
                    style={[
                      styles.priorityBadge,
                      item.priority === 'critical'
                        ? styles.badgeCritical
                        : item.priority === 'high'
                        ? styles.badgeHigh
                        : styles.badgeNormal,
                    ]}>
                    {item.priority.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      item.messageStatus === 'delivered'
                        ? styles.badgeDelivered
                        : item.messageStatus === 'sent'
                        ? styles.badgeSent
                        : styles.badgePending,
                    ]}>
                    {item.messageStatus.toUpperCase()}
                  </Text>
                </View>

                <Text style={[styles.msgDesc, { color: colors.text }]}>{payloadDesc}</Text>

                <View style={styles.msgFooter}>
                  <Text style={[styles.msgMeta, { color: colors.textSecondary }]}>
                    ID: {item.messageId.substring(0, 8)}... | Hops: {item.hopCount}/{item.maxHops}
                  </Text>
                  <Text style={[styles.msgMeta, { color: colors.textSecondary }]}>
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  noPeerText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  peerSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  peerPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  peerPillActive: {
    backgroundColor: '#2980b9',
    borderColor: '#2980b9',
  },
  peerPillInactive: {
    borderColor: '#7f8c8d',
  },
  peerPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
  },
  priorityBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  priorityNormal: {
    backgroundColor: '#2980b9',
  },
  priorityHigh: {
    backgroundColor: '#d35400',
  },
  priorityCritical: {
    backgroundColor: '#c0392b',
  },
  priorityBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  priorityBtnTextActive: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 65,
    textAlignVertical: 'top',
  },
  statusNotice: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusSuccess: {
    color: '#27ae60',
  },
  statusError: {
    color: '#e74c3c',
  },
  sendBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#c0392b',
  },
  sendBtnDisabled: {
    backgroundColor: '#7f8c8d',
  },
  sendLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  msgCard: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  msgHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    color: '#ffffff',
  },
  badgeNormal: {
    backgroundColor: '#2980b9',
  },
  badgeHigh: {
    backgroundColor: '#d35400',
  },
  badgeCritical: {
    backgroundColor: '#c0392b',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    color: '#ffffff',
  },
  badgePending: {
    backgroundColor: '#7f8c8d',
  },
  badgeSent: {
    backgroundColor: '#f39c12',
  },
  badgeDelivered: {
    backgroundColor: '#27ae60',
  },
  msgDesc: {
    fontSize: 14,
    lineHeight: 19,
  },
  msgFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
    paddingTop: 6,
  },
  msgMeta: {
    fontSize: 11,
  },
});
