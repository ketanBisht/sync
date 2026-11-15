import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  useEffect(() => {
    const unsubscribe = bleService.subscribe(() => {
      setStatus(bleService.getStatus());
      setDevices(bleService.getDiscoveredDevices());
      setPeers(bleService.getConnectedPeers());
    });
    return unsubscribe;
  }, []);

  const connectedMap = new Map<string, PeerConnectionInfo>();
  peers.forEach((p) => connectedMap.set(p.address, p));

  const handleToggleAdvertise = () => {
    if (status.isAdvertising) {
      bleService.stopAdvertising();
    } else {
      bleService.startAdvertising();
    }
  };

  const handleToggleScan = () => {
    if (status.isScanning) {
      bleService.stopScanning();
    } else {
      bleService.startScanning();
    }
  };

  const handleConnectToggle = (address: string) => {
    if (connectedMap.has(address)) {
      bleService.disconnect(address);
    } else {
      bleService.connect(address);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Device Discovery</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Phase 2: Offline BLE Communication Engine
          </Text>
        </View>

        {/* Local Node Identity */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Local Node Identity</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Device Name:</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {status.localDevice?.deviceName || 'Initializing...'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Node UUID:</Text>
            <Text style={[styles.codeValue, { color: colors.tint }]}>
              {status.localDevice?.deviceId ? `${status.localDevice.deviceId.substring(0, 18)}...` : 'Generating...'}
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>BLE Radio & Permissions</Text>
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
        </View>

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

        {/* Discovered Devices List */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Discovered SYNC Peers ({devices.length})
          </Text>
          {status.isScanning && (
            <Text style={styles.scanningIndicator}>Scanning active...</Text>
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
                    MAC: {device.address} | RSSI: {device.rssi} dBm
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
});
