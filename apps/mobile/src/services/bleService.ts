import { PermissionsAndroid, Platform } from 'react-native';
import {
  Message,
  MessageReceipt,
  MessageSchema,
  MessagePriority,
  DEFAULT_TTL_SECONDS,
  MAX_HOP_COUNT,
  Device,
} from '@sync/shared';
import {
  SyncBle,
  BleEvents,
  type BleDiscoveredDevice,
  type BleConnectionEvent,
  type BleLogEvent,
  type BlePermissionsStatus,
} from '../../modules/sync-ble';
import { createFrames, MessageReassembler, BleChunkFrame } from './bleFramer';
import { messageRepository } from '../db/repositories/messageRepository';
import { deviceRepository } from '../db/repositories/deviceRepository';

export type {
  BleDiscoveredDevice,
  BleLogEvent,
  BlePermissionsStatus,
  BleConnectionEvent,
} from '../../modules/sync-ble';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BleServiceDiagnostics {
  sentCount: number;
  receivedCount: number;
  persistedCount: number;
  duplicatesRejectedCount: number;
  failedCount: number;
  ackReceivedCount: number;
  logs: BleLogEvent[];
}

export interface PeerConnectionInfo {
  address: string;
  role: 'client' | 'server';
  mtu: number;
  connectedAt: number;
}

export class BleService {
  private localDevice: Device | null = null;
  private isAdvertising = false;
  private isScanning = false;
  private permissions: BlePermissionsStatus = {};
  private bluetoothEnabled = false;
  private lastError: string | null = null;

  private discoveredDevices = new Map<string, BleDiscoveredDevice>();
  private connectedPeers = new Map<string, PeerConnectionInfo>();

  private reassembler = new MessageReassembler(30000);

  // In-flight message ACK resolvers: messageId -> resolver
  private pendingAcks = new Map<
    string,
    {
      resolve: (receipt: MessageReceipt) => void;
      reject: (err: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  private diagnostics: BleServiceDiagnostics = {
    sentCount: 0,
    receivedCount: 0,
    persistedCount: 0,
    duplicatesRejectedCount: 0,
    failedCount: 0,
    ackReceivedCount: 0,
    logs: [],
  };

  private listeners = new Set<() => void>();
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.localDevice = await deviceRepository.getOrCreateLocalDevice();
      this.bluetoothEnabled = SyncBle.isBluetoothEnabled();
      this.permissions = SyncBle.getPermissionsStatus();
      this.setupEventListeners();
      this.isInitialized = true;
      this.addLog('info', `BLE Service initialized for local device: ${this.localDevice.deviceId.substring(0, 8)}... (${this.localDevice.deviceName})`);
      this.notifyListeners();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog('error', `Failed to initialize BLE Service: ${msg}`);
    }
  }

  private setupEventListeners(): void {
    BleEvents.addLogListener((log) => {
      this.addLog(log.level, `[Native] ${log.message}`);
    });

    BleEvents.addDeviceDiscoveredListener((device) => {
      this.discoveredDevices.set(device.address, device);
      this.notifyListeners();
    });

    BleEvents.addConnectionStateListener((event: BleConnectionEvent) => {
      if (event.state === 'connected') {
        this.connectedPeers.set(event.address, {
          address: event.address,
          role: event.role,
          mtu: SyncBle.getNegotiatedMtu(event.address),
          connectedAt: Date.now(),
        });
        this.addLog('info', `Peer ${event.address} connected as ${event.role}`);
      } else if (event.state === 'disconnected') {
        this.connectedPeers.delete(event.address);
        this.addLog('info', `Peer ${event.address} disconnected (${event.role})`);
      }
      this.notifyListeners();
    });

    BleEvents.addMtuListener((event) => {
      const peer = this.connectedPeers.get(event.address);
      if (peer) {
        peer.mtu = event.mtu;
        this.notifyListeners();
      }
    });

    BleEvents.addChunkReceivedListener((event) => {
      this.handleIncomingChunk(event.senderAddress, event.chunkJson, event.role);
    });

    BleEvents.addReceiptReceivedListener((event) => {
      this.handleIncomingReceipt(event.senderAddress, event.receiptJson);
    });

    BleEvents.addAdvertisingStateListener((event) => {
      this.isAdvertising = event.isAdvertising;
      if (event.error) {
        this.addLog('error', `Advertising error: ${event.error}`);
      }
      this.notifyListeners();
    });

    BleEvents.addScanningStateListener((event) => {
      this.isScanning = event.isScanning;
      this.notifyListeners();
    });
  }

  private handleIncomingChunk(senderAddress: string, chunkJson: string, role: 'client' | 'server'): void {
    let frame: BleChunkFrame;
    try {
      frame = JSON.parse(chunkJson);
    } catch {
      this.diagnostics.failedCount++;
      this.addLog('warn', `Received non-JSON chunk from ${senderAddress}`);
      return;
    }

    const result = this.reassembler.addChunk(frame);
    if (result.error) {
      this.diagnostics.failedCount++;
      this.addLog('warn', `Chunk reassembly error from ${senderAddress}: ${result.error}`);
      return;
    }

    if (result.isComplete && result.fullPayload) {
      this.processCompleteIncomingMessage(senderAddress, result.fullPayload, role);
    }
  }

  private async processCompleteIncomingMessage(
    senderAddress: string,
    payloadString: string,
    role: 'client' | 'server'
  ): Promise<void> {
    this.diagnostics.receivedCount++;
    this.addLog('info', `Reassembled complete message from ${senderAddress} (${payloadString.length} bytes)`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadString);
    } catch {
      this.diagnostics.failedCount++;
      this.addLog('error', 'Reassembled message is not valid JSON');
      this.notifyListeners();
      return;
    }

    const localId = this.localDevice?.deviceId || generateUuid();
    const saveResult = await messageRepository.saveIncomingMessage(parsed, localId, senderAddress);

    if (saveResult.isDuplicate) {
      this.diagnostics.duplicatesRejectedCount++;
      this.addLog('warn', `Duplicate message rejected (messageId: ${(parsed as any)?.messageId})`);

      // Acknowledge anyway so sender knows the message has been resolved
      const ackReceipt: MessageReceipt = {
        receiptId: generateUuid(),
        messageId: (parsed as any)?.messageId || generateUuid(),
        deviceId: localId,
        receiptType: 'received',
        timestamp: new Date().toISOString(),
      };
      await this.sendAck(senderAddress, ackReceipt, role);
      this.notifyListeners();
      return;
    }

    if (!saveResult.success) {
      this.diagnostics.failedCount++;
      this.addLog('error', `Failed to persist received message: ${saveResult.error}`);
      this.notifyListeners();
      return;
    }

    this.diagnostics.persistedCount++;
    this.addLog('info', `Message successfully persisted in SQLite! Sending ACK to ${senderAddress}`);

    // Send ACK back to sender
    if (saveResult.receipt) {
      await this.sendAck(senderAddress, saveResult.receipt, role);
    }

    this.notifyListeners();
  }

  private async sendAck(recipientAddress: string, receipt: MessageReceipt, role: 'client' | 'server'): Promise<void> {
    const receiptJson = JSON.stringify(receipt);
    try {
      if (role === 'server') {
        // We received the write on our GATT Server -> send notification back to Central
        SyncBle.sendReceiptNotification(recipientAddress, receiptJson);
      } else {
        // We received notification as Central -> write receipt back to GATT Server
        await SyncBle.writeReceipt(recipientAddress, receiptJson);
      }
      this.addLog('info', `ACK sent to ${recipientAddress} for message ${receipt.messageId.substring(0, 8)}...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog('warn', `Failed to send ACK to ${recipientAddress}: ${msg}`);
    }
  }

  private async handleIncomingReceipt(senderAddress: string, receiptJson: string): Promise<void> {
    let receipt: MessageReceipt;
    try {
      receipt = JSON.parse(receiptJson);
    } catch {
      this.addLog('warn', `Received non-JSON receipt from ${senderAddress}`);
      return;
    }

    this.diagnostics.ackReceivedCount++;
    this.addLog('info', `ACK confirmed by peer ${senderAddress} for message ${receipt.messageId.substring(0, 8)}...`);

    // Record receipt in SQLite
    await messageRepository.recordReceipt(receipt);

    // Resolve in-flight pending ACK promise if sender was waiting
    const pending = this.pendingAcks.get(receipt.messageId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingAcks.delete(receipt.messageId);
      pending.resolve(receipt);
    }

    this.notifyListeners();
  }

  /**
   * Authors, validates, frames, and sends an emergency message to a connected peer.
   * Awaits receipt confirmation from the peer before resolving.
   */
  public async sendMessage(
    recipientAddress: string,
    messagePayload: {
      type: string;
      description: string;
      category?: string;
      severity?: string;
    },
    priority: MessagePriority = 'high'
  ): Promise<{ success: boolean; messageId: string; error?: string }> {
    if (!this.localDevice) {
      return { success: false, messageId: '', error: 'Local device identity not ready' };
    }

    const peerInfo = this.connectedPeers.get(recipientAddress);
    if (!peerInfo) {
      return { success: false, messageId: '', error: `Device ${recipientAddress} is not currently connected` };
    }

    const messageId = generateUuid();
    const now = new Date();
    const ttlSeconds = DEFAULT_TTL_SECONDS[priority] || 24 * 3600;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const message: Message = {
      messageId,
      incidentId: null,
      senderId: this.localDevice.deviceId,
      recipientId: null, // broadcast to all peers
      payload: JSON.stringify(messagePayload),
      priority,
      createdAt: now.toISOString(),
      expiresAt,
      hopCount: 0,
      maxHops: MAX_HOP_COUNT,
      messageStatus: 'pending',
    };

    // 1. Validate with Zod
    const validation = MessageSchema.safeParse(message);
    if (!validation.success) {
      const err = validation.error.issues.map((i) => i.message).join(', ');
      return { success: false, messageId, error: `Validation error: ${err}` };
    }

    // 2. Persist locally in SQLite before network dispatch
    await messageRepository.saveOutgoingMessage(message);

    // 3. Compute chunk frame size based on MTU
    const mtu = peerInfo.mtu || 23;
    // MTU - 5 bytes GATT overhead - ~80 bytes framing header overhead
    const effectiveChunkPayloadSize = Math.max(40, Math.min(380, mtu - 85));

    const messageJson = JSON.stringify(message);
    const frames = createFrames(messageJson, messageId, effectiveChunkPayloadSize);

    this.addLog('info', `Sending message ${messageId.substring(0, 8)}... (${frames.length} chunks, MTU ${mtu})`);

    // 4. Transmit all chunks sequentially (Client writes, Server notifies)
    for (let i = 0; i < frames.length; i++) {
      const frameJson = JSON.stringify(frames[i]);
      let writeOk = false;
      if (peerInfo.role === 'server') {
        writeOk = SyncBle.sendChunkNotification(recipientAddress, frameJson);
        if (writeOk && i < frames.length - 1) {
          await new Promise((r) => setTimeout(r, 35));
        }
      } else {
        writeOk = await SyncBle.writeChunk(recipientAddress, frameJson);
      }
      if (!writeOk) {
        this.diagnostics.failedCount++;
        await messageRepository.updateMessageStatus(messageId, 'failed');
        this.addLog('error', `Write failed on chunk ${i + 1}/${frames.length} to ${recipientAddress}`);
        this.notifyListeners();
        return { success: false, messageId, error: `Transfer failed at chunk ${i + 1}` };
      }
    }

    this.diagnostics.sentCount++;
    this.addLog('info', `All ${frames.length} chunks transferred. Awaiting persistence ACK...`);
    this.notifyListeners();

    // 5. Await ACK with 15-second timeout
    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        this.pendingAcks.delete(messageId);
        await messageRepository.updateMessageStatus(messageId, 'sent');
        this.addLog('warn', `ACK timed out after 15s for ${messageId.substring(0, 8)}... Message remains in local storage.`);
        this.notifyListeners();
        resolve({ success: true, messageId, error: 'Transfer complete; peer ACK timed out' });
      }, 15000);

      this.pendingAcks.set(messageId, {
        resolve: async (_receipt) => {
          this.notifyListeners();
          resolve({ success: true, messageId });
        },
        reject: (_err) => {
          resolve({ success: false, messageId, error: 'ACK rejected' });
        },
        timeoutId,
      });
    });
  }

  // --- Permissions & Controls ---

  public hasRequiredPermissions(): boolean {
    if (Platform.OS !== 'android') return true;
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
    if (apiLevel >= 31) {
      return Boolean(
        this.permissions.bluetoothScan &&
        this.permissions.bluetoothAdvertise &&
        this.permissions.bluetoothConnect
      );
    }
    return Boolean(this.permissions.locationFine);
  }

  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
      const perms = apiLevel >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

      const results = await PermissionsAndroid.requestMultiple(perms);
      this.permissions = SyncBle.getPermissionsStatus();
      this.bluetoothEnabled = SyncBle.isBluetoothEnabled();

      const allGranted = perms.every(
        (p) => results[p] === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        this.lastError = 'Bluetooth permissions are required. Please grant Nearby Devices / Location permissions.';
        this.addLog('warn', this.lastError);
      } else {
        this.lastError = null;
        this.addLog('info', 'All required Bluetooth permissions granted');
      }
      this.notifyListeners();
      return this.hasRequiredPermissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = `Permission request failed: ${msg}`;
      this.addLog('error', this.lastError);
      this.notifyListeners();
      return false;
    }
  }

  public async startAdvertising(): Promise<boolean> {
    if (!this.localDevice) {
      this.lastError = 'Local device identity not ready yet';
      this.notifyListeners();
      return false;
    }

    this.refreshBluetoothStatus();
    if (!this.hasRequiredPermissions()) {
      const granted = await this.requestPermissions();
      if (!granted) return false;
    }

    if (!this.bluetoothEnabled) {
      this.lastError = 'Bluetooth is turned OFF. Please enable Bluetooth in Android settings.';
      this.addLog('error', this.lastError);
      this.notifyListeners();
      return false;
    }

    this.lastError = null;
    const ok = SyncBle.startAdvertising(this.localDevice.deviceId, this.localDevice.deviceName);
    if (ok) {
      this.isAdvertising = true;
      this.addLog('info', 'Started BLE advertising');
    } else {
      this.lastError = 'Failed to start BLE advertising. Check Diagnostics logs.';
    }
    this.notifyListeners();
    return ok;
  }

  public stopAdvertising(): void {
    SyncBle.stopAdvertising();
    this.isAdvertising = false;
    this.addLog('info', 'Stopped BLE advertising');
    this.notifyListeners();
  }

  public async startScanning(): Promise<boolean> {
    this.refreshBluetoothStatus();
    if (!this.hasRequiredPermissions()) {
      const granted = await this.requestPermissions();
      if (!granted) return false;
    }

    if (!this.bluetoothEnabled) {
      this.lastError = 'Bluetooth is turned OFF. Please enable Bluetooth in Android settings.';
      this.addLog('error', this.lastError);
      this.notifyListeners();
      return false;
    }

    this.lastError = null;
    const ok = SyncBle.startScanning();
    if (ok) {
      this.isScanning = true;
      this.addLog('info', 'Started BLE scanning');
    } else {
      this.lastError = 'Failed to start BLE scanning. Check Diagnostics logs.';
    }
    this.notifyListeners();
    return ok;
  }

  public stopScanning(): void {
    SyncBle.stopScanning();
    this.isScanning = false;
    this.addLog('info', 'Stopped BLE scanning');
    this.notifyListeners();
  }

  /**
   * Updates the local device's callsign / display name and persists it to SQLite.
   */
  public async updateLocalDeviceName(newName: string): Promise<void> {
    if (!this.localDevice) return;
    this.localDevice = { ...this.localDevice, deviceName: newName };
    await deviceRepository.updateDeviceName(this.localDevice.deviceId, newName);
    this.addLog('info', `Callsign updated to: ${newName}`);
    this.notifyListeners();
  }

  public connect(address: string): boolean {
    this.lastError = null;
    this.addLog('info', `Connecting to ${address}...`);
    return SyncBle.connect(address);
  }

  public disconnect(address: string): void {
    this.addLog('info', `Disconnecting from ${address}...`);
    SyncBle.disconnect(address);
  }

  public refreshBluetoothStatus(): void {
    this.bluetoothEnabled = SyncBle.isBluetoothEnabled();
    this.permissions = SyncBle.getPermissionsStatus();
    this.notifyListeners();
  }

  // --- Diagnostics & State Getters ---

  public getDiagnostics(): BleServiceDiagnostics {
    return { ...this.diagnostics };
  }

  public getLocalDevice(): Device | null {
    return this.localDevice;
  }

  public getDiscoveredDevices(): BleDiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  public getConnectedPeers(): PeerConnectionInfo[] {
    return Array.from(this.connectedPeers.values());
  }

  public getStatus() {
    return {
      bluetoothEnabled: this.bluetoothEnabled,
      isAdvertising: this.isAdvertising,
      isScanning: this.isScanning,
      permissions: this.permissions,
      hasRequiredPermissions: this.hasRequiredPermissions(),
      lastError: this.lastError,
      localDevice: this.localDevice,
      connectedPeerCount: this.connectedPeers.size,
      discoveredCount: this.discoveredDevices.size,
    };
  }

  public clearLogs(): void {
    this.diagnostics.logs = [];
    this.notifyListeners();
  }

  private addLog(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const entry: BleLogEvent = {
      level,
      message,
      timestamp: Date.now(),
    };
    this.diagnostics.logs.unshift(entry);
    if (this.diagnostics.logs.length > 100) {
      this.diagnostics.logs.pop();
    }
    this.notifyListeners();
  }

  // --- Listener Subscription ---

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const bleService = new BleService();
