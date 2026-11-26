import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import {
  bleService,
  type BleDiscoveredDevice,
  type PeerConnectionInfo,
} from '@/services/bleService';

export default function DiscoveryScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [status, setStatus] = useState(bleService.getStatus());
  const [devices, setDevices] = useState<BleDiscoveredDevice[]>(bleService.getDiscoveredDevices());
  const [peers, setPeers] = useState<PeerConnectionInfo[]>(bleService.getConnectedPeers());

  // Callsign editing state
  const [isEditingCallsign, setIsEditingCallsign] = useState(false);
  const [callsignDraft, setCallsignDraft] = useState('');
  const [callsignSaving, setCallsignSaving] = useState(false);

  // SOS state
  const [sosSending, setSosSending] = useState(false);

  useEffect(() => {
    bleService.refreshBluetoothStatus();
    if (!bleService.hasRequiredPermissions()) {
      void bleService.requestPermissions();
    }
    const unsubscribe = bleService.subscribe(() => {
      setStatus(bleService.getStatus());
      setDevices(bleService.getDiscoveredDevices());
      setPeers(bleService.getConnectedPeers());
    });
    return unsubscribe;
  }, []);

  const connectedMap = new Map<string, PeerConnectionInfo>();
  peers.forEach((p) => connectedMap.set(p.address, p));

  const handleToggleAdvertise = async () => {
    if (status.isAdvertising) {
      bleService.stopAdvertising();
    } else {
      await bleService.startAdvertising();
    }
  };

  const handleToggleScan = async () => {
    if (status.isScanning) {
      bleService.stopScanning();
    } else {
      await bleService.startScanning();
    }
  };

  const handleConnectToggle = (address: string) => {
    if (connectedMap.has(address)) {
      bleService.disconnect(address);
    } else {
      bleService.connect(address);
    }
  };

  // --- Callsign edit handlers ---
  const handleStartEditCallsign = () => {
    setCallsignDraft(status.localDevice?.deviceName || 'SYNC Mobile Unit');
    setIsEditingCallsign(true);
  };

  const handleSaveCallsign = async () => {
    const trimmed = callsignDraft.trim();
    if (!trimmed) return;
    setCallsignSaving(true);
    await bleService.updateLocalDeviceName(trimmed);
    setCallsignSaving(false);
    setIsEditingCallsign(false);
    setStatus(bleService.getStatus());
  };

  // --- Quick SOS handler ---
  const handleQuickSOS = () => {
    if (peers.length === 0) {
      Alert.alert('No Peers Connected', 'Connect to at least one SYNC device before sending SOS.');
      return;
    }
    Alert.alert(
      '🆘 SEND EMERGENCY SOS?',
      `This will broadcast an SOS signal to ${peers.length} connected peer${peers.length !== 1 ? 's' : ''}. Only use in a real emergency.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS',
          style: 'destructive',
          onPress: () => void sendSOS(),
        },
      ]
    );
  };

  const sendSOS = async () => {
    setSosSending(true);
    let sent = 0;
    let failed = 0;
    for (const peer of peers) {
      try {
        const result = await bleService.sendMessage(
          peer.address,
          {
            type: 'SOS',
            description: `🆘 EMERGENCY SOS from ${status.localDevice?.deviceName || 'Unknown Node'}. Immediate assistance required.`,
            severity: 'critical',
          },
          'critical'
        );
        if (result.success) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setSosSending(false);
    Alert.alert(
      'SOS Dispatched',
      `Sent to ${sent} peer${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}.`
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>SYNC</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Offline Emergency Mesh Network
          </Text>
        </View>

        {/* Quick SOS Button */}
        <TouchableOpacity
          style={[styles.sosButton, sosSending && styles.sosButtonDisabled]}
          onPress={handleQuickSOS}
          disabled={sosSending}
          activeOpacity={0.75}>
          <Text style={styles.sosIcon}>🆘</Text>
          <Text style={styles.sosText}>{sosSending ? 'SENDING SOS...' : 'QUICK SOS'}</Text>
          <Text style={styles.sosSubText}>Broadcast to all connected peers</Text>
        </TouchableOpacity>

        {/* Local Node Identity */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Local Node Identity</Text>

          {/* Callsign Row */}
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Callsign:</Text>
            {isEditingCallsign ? (
              <View style={styles.callsignEditRow}>
                <TextInput
                  style={[styles.callsignInput, { color: colors.text, borderColor: colors.tint }]}
                  value={callsignDraft}
                  onChangeText={setCallsignDraft}
                  autoFocus
                  maxLength={24}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSaveCallsign()}
                />
                <TouchableOpacity
                  style={[styles.callsignSaveBtn, callsignSaving && styles.callsignSaveBtnDisabled]}
                  onPress={() => void handleSaveCallsign()}
                  disabled={callsignSaving}>
                  <Text style={styles.callsignSaveBtnText}>{callsignSaving ? '...' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsEditingCallsign(false)}>
                  <Text style={[styles.callsignCancelText, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.callsignDisplayRow}>
                <Text style={[styles.value, { color: colors.text }]}>
                  {status.localDevice?.deviceName || 'Initializing...'}
                </Text>
                <TouchableOpacity onPress={handleStartEditCallsign} style={styles.editBtn}>
                  <Text style={[styles.editBtnText, { color: colors.tint }]}>✏️ Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Node UUID:</Text>
            <Text style={[styles.codeValue, { color: colors.tint }]}>
              {status.localDevice?.deviceId
                ? `${status.localDevice.deviceId.substring(0, 18)}...`
                : 'Generating...'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Platform:</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {Platform.OS.toUpperCase()} {Platform.OS === 'android' ? '(Native BLE)' : '(Preview/Mock)'}
            </Text>
          </View>
        </View>

        {/* Radio & Permissions Status */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>BLE Radio &amp; Permissions</Text>
            <TouchableOpacity onPress={() => bleService.refreshBluetoothStatus()}>
              <Text style={[styles.refreshLink, { color: colors.tint }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Bluetooth Hardware:</Text>
            <Text style={[styles.badge, status.bluetoothEnabled ? styles.badgeSuccess : styles.badgeWarn]}>
              {status.bluetoothEnabled ? 'ENABLED' : 'DISABLED / UNAVAILABLE'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Scan Permission:</Text>
            <Text style={[styles.badge, status.permissions.bluetoothScan !== false ? styles.badgeSuccess : styles.badgeWarn]}>
              {status.permissions.bluetoothScan !== false ? 'GRANTED' : 'DENIED'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Advertise Permission:</Text>
            <Text style={[styles.badge, status.permissions.bluetoothAdvertise !== false ? styles.badgeSuccess : styles.badgeWarn]}>
              {status.permissions.bluetoothAdvertise !== false ? 'GRANTED' : 'DENIED'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Connect Permission:</Text>
            <Text style={[styles.badge, status.permissions.bluetoothConnect !== false ? styles.badgeSuccess : styles.badgeWarn]}>
              {status.permissions.bluetoothConnect !== false ? 'GRANTED' : 'DENIED'}
            </Text>
          </View>

          {!status.hasRequiredPermissions && (
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={() => void bleService.requestPermissions()}>
              <Text style={styles.grantBtnText}>Grant Bluetooth Permissions</Text>
            </TouchableOpacity>
          )}
        </View>

        {status.lastError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{status.lastError}</Text>
          </View>
        )}

        {/* Dual-Role Control Actions */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[
              styles.controlBtn,
              status.isAdvertising ? styles.btnActive : styles.btnInactive,
            ]}
            onPress={handleToggleAdvertise}>
            <Text style={styles.btnText}>
              {status.isAdvertising ? 'Stop Advertising' : 'Start Advertising'}
            </Text>
            <Text style={styles.btnSubText}>
              {status.isAdvertising ? 'Broadcasting SYNC Service' : 'Peripheral Role'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlBtn,
              status.isScanning ? styles.btnActiveScan : styles.btnInactive,
            ]}
            onPress={handleToggleScan}>
            <Text style={styles.btnText}>
              {status.isScanning ? 'Stop Scanning' : 'Start Scanning'}
            </Text>
            <Text style={styles.btnSubText}>
              {status.isScanning ? 'Listening for Peers' : 'Central Role'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mesh Status Summary */}
        <View style={[styles.meshStatusRow, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.meshStatusItem}>
            <Text style={[styles.meshStatusValue, { color: '#27ae60' }]}>{peers.length}</Text>
            <Text style={[styles.meshStatusLabel, { color: colors.textSecondary }]}>Connected</Text>
          </View>
          <View style={styles.meshStatusDivider} />
          <View style={styles.meshStatusItem}>
            <Text style={[styles.meshStatusValue, { color: '#2980b9' }]}>{devices.length}</Text>
            <Text style={[styles.meshStatusLabel, { color: colors.textSecondary }]}>Discovered</Text>
          </View>
          <View style={styles.meshStatusDivider} />
          <View style={styles.meshStatusItem}>
            <Text style={[styles.meshStatusValue, { color: status.isAdvertising || status.isScanning ? '#27ae60' : '#7f8c8d' }]}>
              {status.isAdvertising && status.isScanning ? 'FULL' : status.isAdvertising ? 'ADV' : status.isScanning ? 'SCAN' : 'IDLE'}
            </Text>
            <Text style={[styles.meshStatusLabel, { color: colors.textSecondary }]}>Radio</Text>
          </View>
        </View>

        {/* Connected Peers (Server & Client) */}
        {peers.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: '#27ae60', borderWidth: 1 }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Active Connections ({peers.length})
              </Text>
              <TouchableOpacity
                style={styles.msgQuickBtn}
                onPress={() => router.push('/messages' as any)}>
                <Text style={styles.msgQuickBtnText}>Messages →</Text>
              </TouchableOpacity>
            </View>
            {peers.map((peer) => (
              <View key={`${peer.role}-${peer.address}`} style={styles.infoRow}>
                <View>
                  <Text style={[styles.value, { color: colors.text }]}>{peer.address}</Text>
                  <Text style={[styles.peerRoleText, { color: colors.textSecondary }]}>
                    {peer.role.toUpperCase()} · MTU {peer.mtu} · Connected
                  </Text>
                </View>
                <Text style={styles.connectedBadge}>● LIVE</Text>
              </View>
            ))}
          </View>
        )}

        {/* Discovered Devices List */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Nearby SYNC Nodes ({devices.length})
          </Text>
          {status.isScanning && (
            <Text style={styles.scanningIndicator}>● Scanning...</Text>
          )}
        </View>

        {devices.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {status.isScanning
                ? 'Searching for nearby SYNC devices over BLE...'
                : 'No peers discovered yet. Press "Start Scanning" to search.'}
            </Text>
          </View>
        ) : (
          devices.map((device) => {
            const isConnected = connectedMap.has(device.address);
            const peer = connectedMap.get(device.address);
            return (
              <View
                key={device.address}
                style={[
                  styles.deviceCard,
                  { backgroundColor: colors.backgroundElement },
                  isConnected && styles.deviceCardConnected,
                ]}>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: colors.text }]}>
                    {device.name || 'SYNC Node'}
                  </Text>
                  <Text style={[styles.deviceAddress, { color: colors.textSecondary }]}>
                    MAC: {device.address} · RSSI: {device.rssi} dBm
                  </Text>
                  {device.deviceId && (
                    <Text style={[styles.nodeIdText, { color: colors.tint }]}>
                      SYNC ID: {device.deviceId}
                    </Text>
                  )}
                  {isConnected && (
                    <Text style={styles.connectedBadge}>
                      CONNECTED ({peer?.role.toUpperCase()} - MTU {peer?.mtu || 23})
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.connectBtn,
                    isConnected ? styles.disconnectBtn : styles.connectBtnAction,
                  ]}
                  onPress={() => handleConnectToggle(device.address)}>
                  <Text style={styles.connectBtnText}>
                    {isConnected ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
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
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  // SOS Button
  sosButton: {
    backgroundColor: '#c0392b',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#c0392b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  sosButtonDisabled: {
    backgroundColor: '#7f8c8d',
    shadowOpacity: 0,
    elevation: 0,
  },
  sosIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  sosText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sosSubText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 2,
  },
  // Callsign editing
  callsignEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  callsignInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    minWidth: 100,
    maxWidth: 150,
  },
  callsignSaveBtn: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  callsignSaveBtnDisabled: {
    backgroundColor: '#7f8c8d',
  },
  callsignSaveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  callsignCancelText: {
    fontSize: 16,
    paddingHorizontal: 4,
  },
  callsignDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Mesh status summary bar
  meshStatusRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  meshStatusItem: {
    alignItems: 'center',
    gap: 2,
  },
  meshStatusValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  meshStatusLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  meshStatusDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(128,128,128,0.25)',
  },
  // Peer list extras
  peerRoleText: {
    fontSize: 11,
    marginTop: 2,
  },
  // General card styles
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
  },
  codeValue: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeSuccess: {
    backgroundColor: '#27ae60',
    color: '#ffffff',
  },
  badgeWarn: {
    backgroundColor: '#e67e22',
    color: '#ffffff',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  controlBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInactive: {
    backgroundColor: '#34495e',
  },
  btnActive: {
    backgroundColor: '#2980b9',
  },
  btnActiveScan: {
    backgroundColor: '#16a085',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSubText: {
    color: '#ecf0f1',
    fontSize: 10,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scanningIndicator: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  deviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deviceCardConnected: {
    borderColor: '#27ae60',
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '700',
  },
  deviceAddress: {
    fontSize: 12,
  },
  nodeIdText: {
    fontSize: 11,
    fontWeight: '600',
  },
  connectedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#27ae60',
    marginTop: 2,
  },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  connectBtnAction: {
    backgroundColor: '#2980b9',
  },
  disconnectBtn: {
    backgroundColor: '#c0392b',
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  grantBtn: {
    marginTop: 6,
    backgroundColor: '#e67e22',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderColor: '#e74c3c',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorBannerText: {
    color: '#c0392b',
    fontSize: 13,
    fontWeight: '600',
  },
  msgQuickBtn: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  msgQuickBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
