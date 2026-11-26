import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { bleService, BleServiceDiagnostics } from '@/services/bleService';
import { messageRepository } from '@/db/repositories/messageRepository';

export default function DiagnosticsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [diag, setDiag] = useState<BleServiceDiagnostics>(bleService.getDiagnostics());
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');

  useEffect(() => {
    const unsubscribe = bleService.subscribe(() => {
      setDiag(bleService.getDiagnostics());
    });
    return unsubscribe;
  }, []);

  const handleClearLogs = () => {
    bleService.clearLogs();
  };

  const handleWipeDatabaseMessages = async () => {
    try {
      await messageRepository.clearAllMessages();
      Alert.alert('Database Reset', 'All messages and receipts have been cleared from local SQLite.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg);
    }
  };

  const filteredLogs = diag.logs.filter((item) => {
    if (filterLevel === 'all') return true;
    return item.level === filterLevel;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>SYNC Diagnostics</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Real-time Metrics, Event Logs & SQLite Verification
          </Text>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#2980b9' }]}>{diag.sentCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Messages Sent</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#16a085' }]}>{diag.receivedCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Messages Received</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#27ae60' }]}>{diag.persistedCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>SQLite Persisted</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#e67e22' }]}>{diag.duplicatesRejectedCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Duplicates Rejected</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#8e44ad' }]}>{diag.ackReceivedCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ACKs Confirmed</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.metricValue, { color: '#c0392b' }]}>{diag.failedCount}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Transfers Failed</Text>
          </View>
        </View>

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#34495e' }]}
            onPress={handleClearLogs}>
            <Text style={styles.actionBtnText}>Clear Event Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#c0392b' }]}
            onPress={handleWipeDatabaseMessages}>
            <Text style={styles.actionBtnText}>Wipe SQLite Messages</Text>
          </TouchableOpacity>
        </View>

        {/* Log Filter Pills */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterTitle, { color: colors.text }]}>Event Log Filter:</Text>
          {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
            <TouchableOpacity
              key={lvl}
              style={[
                styles.filterPill,
                filterLevel === lvl ? styles.filterPillActive : styles.filterPillInactive,
              ]}
              onPress={() => setFilterLevel(lvl)}>
              <Text
                style={[
                  styles.filterPillText,
                  filterLevel === lvl ? styles.filterPillTextActive : { color: colors.textSecondary },
                ]}>
                {lvl.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Event Log Feed */}
        {filteredLogs.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No BLE event logs matching filter.
            </Text>
          </View>
        ) : (
          filteredLogs.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.logCard,
                { backgroundColor: colors.backgroundElement },
                item.level === 'error' ? styles.logBorderError : null,
                item.level === 'warn' ? styles.logBorderWarn : null,
              ]}>
              <View style={styles.logHeader}>
                <Text
                  style={[
                    styles.logLevelBadge,
                    item.level === 'error'
                      ? styles.logBadgeError
                      : item.level === 'warn'
                      ? styles.logBadgeWarn
                      : styles.logBadgeInfo,
                  ]}>
                  {item.level.toUpperCase()}
                </Text>
                <Text style={[styles.logTime, { color: colors.textSecondary }]}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={[styles.logMsg, { color: colors.text }]}>{item.message}</Text>
            </View>
          ))
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  filterTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  filterPillActive: {
    backgroundColor: '#2980b9',
  },
  filterPillInactive: {
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#ffffff',
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
  logCard: {
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#2980b9',
  },
  logBorderWarn: {
    borderLeftColor: '#e67e22',
  },
  logBorderError: {
    borderLeftColor: '#c0392b',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLevelBadge: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    color: '#ffffff',
  },
  logBadgeInfo: {
    backgroundColor: '#2980b9',
  },
  logBadgeWarn: {
    backgroundColor: '#e67e22',
  },
  logBadgeError: {
    backgroundColor: '#c0392b',
  },
  logTime: {
    fontSize: 11,
  },
  logMsg: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
