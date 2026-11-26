import { requireOptionalNativeModule, EventEmitter, type EventSubscription } from 'expo-modules-core';

export interface BleDiscoveredDevice {
  address: string;
  name: string;
  rssi: number;
  deviceId?: string;
  lastSeenAt: number;
}

export interface BleConnectionEvent {
  address: string;
  state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected';
  role: 'client' | 'server';
}

export interface BleMtuEvent {
  address: string;
  mtu: number;
}

export interface BleServicesDiscoveredEvent {
  address: string;
  success: boolean;
}

export interface BleChunkEvent {
  senderAddress: string;
  chunkJson: string;
  role: 'client' | 'server';
}

export interface BleReceiptEvent {
  senderAddress: string;
  receiptJson: string;
  role: 'client' | 'server';
}

export interface BleInventoryEvent {
  senderAddress: string;
  inventoryJson: string;
  role: 'client' | 'server';
}

export interface BleAdvertisingStateEvent {
  isAdvertising: boolean;
  error?: string | null;
}

export interface BleScanningStateEvent {
  isScanning: boolean;
}

export interface BleLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface BlePermissionsStatus {
  bluetoothScan?: boolean;
  bluetoothAdvertise?: boolean;
  bluetoothConnect?: boolean;
  bluetooth?: boolean;
  bluetoothAdmin?: boolean;
  locationFine?: boolean;
}

export interface SyncBleNativeModule {
  isBluetoothSupported(): boolean;
  isBluetoothEnabled(): boolean;
  isAdvertisingSupported(): boolean;
  getPermissionsStatus(): BlePermissionsStatus;
  startAdvertising(deviceId: string, deviceName: string): boolean;
  stopAdvertising(): void;
  startScanning(): boolean;
  stopScanning(): void;
  connect(deviceAddress: string): boolean;
  disconnect(deviceAddress: string): void;
  writeChunk(deviceAddress: string, chunkJson: string): Promise<boolean>;
  writeReceipt(deviceAddress: string, receiptJson: string): Promise<boolean>;
  sendReceiptNotification(deviceAddress: string, receiptJson: string): boolean;
  sendChunkNotification(deviceAddress: string, chunkJson: string): boolean;
  getNegotiatedMtu(deviceAddress: string): number;
}

export type SyncBleEventsMap = {
  onBleLog: (event: BleLogEvent) => void;
  onDeviceDiscovered: (device: BleDiscoveredDevice) => void;
  onConnectionStateChanged: (event: BleConnectionEvent) => void;
  onMtuChanged: (event: BleMtuEvent) => void;
  onServicesDiscovered: (event: BleServicesDiscoveredEvent) => void;
  onChunkReceived: (event: BleChunkEvent) => void;
  onReceiptReceived: (event: BleReceiptEvent) => void;
  onInventoryReceived: (event: BleInventoryEvent) => void;
  onAdvertisingStateChanged: (event: BleAdvertisingStateEvent) => void;
  onScanningStateChanged: (event: BleScanningStateEvent) => void;
};

const NativeSyncBle = requireOptionalNativeModule<SyncBleNativeModule>('SyncBle');

// Fallback implementation for web or development environments where native module isn't linked
class FallbackSyncBleModule implements SyncBleNativeModule {
  isBluetoothSupported(): boolean {
    return false;
  }
  isBluetoothEnabled(): boolean {
    return false;
  }
  isAdvertisingSupported(): boolean {
    return false;
  }
  getPermissionsStatus(): BlePermissionsStatus {
    return { locationFine: false };
  }
  startAdvertising(_deviceId: string, _deviceName: string): boolean {
    console.warn('[SyncBle] Native BLE module is only available on native Android builds.');
    return false;
  }
  stopAdvertising(): void {}
  startScanning(): boolean {
    console.warn('[SyncBle] Native BLE module is only available on native Android builds.');
    return false;
  }
  stopScanning(): void {}
  connect(_deviceAddress: string): boolean {
    return false;
  }
  disconnect(_deviceAddress: string): void {}
  async writeChunk(_deviceAddress: string, _chunkJson: string): Promise<boolean> {
    return false;
  }
  async writeReceipt(_deviceAddress: string, _receiptJson: string): Promise<boolean> {
    return false;
  }
  sendReceiptNotification(_deviceAddress: string, _receiptJson: string): boolean {
    return false;
  }
  sendChunkNotification(_deviceAddress: string, _chunkJson: string): boolean {
    return false;
  }
  getNegotiatedMtu(_deviceAddress: string): number {
    return 23;
  }
}

export const SyncBle: SyncBleNativeModule = NativeSyncBle ?? new FallbackSyncBleModule();

const emitter = NativeSyncBle ? new EventEmitter<SyncBleEventsMap>(NativeSyncBle as any) : null;

export const BleEvents = {
  addLogListener(listener: (event: BleLogEvent) => void): EventSubscription {
    return emitter?.addListener('onBleLog', listener) ?? { remove: () => {} };
  },
  addDeviceDiscoveredListener(listener: (device: BleDiscoveredDevice) => void): EventSubscription {
    return emitter?.addListener('onDeviceDiscovered', listener) ?? { remove: () => {} };
  },
  addConnectionStateListener(listener: (event: BleConnectionEvent) => void): EventSubscription {
    return emitter?.addListener('onConnectionStateChanged', listener) ?? { remove: () => {} };
  },
  addMtuListener(listener: (event: BleMtuEvent) => void): EventSubscription {
    return emitter?.addListener('onMtuChanged', listener) ?? { remove: () => {} };
  },
  addServicesDiscoveredListener(listener: (event: BleServicesDiscoveredEvent) => void): EventSubscription {
    return emitter?.addListener('onServicesDiscovered', listener) ?? { remove: () => {} };
  },
  addChunkReceivedListener(listener: (event: BleChunkEvent) => void): EventSubscription {
    return emitter?.addListener('onChunkReceived', listener) ?? { remove: () => {} };
  },
  addReceiptReceivedListener(listener: (event: BleReceiptEvent) => void): EventSubscription {
    return emitter?.addListener('onReceiptReceived', listener) ?? { remove: () => {} };
  },
  addInventoryReceivedListener(listener: (event: BleInventoryEvent) => void): EventSubscription {
    return emitter?.addListener('onInventoryReceived', listener) ?? { remove: () => {} };
  },
  addAdvertisingStateListener(listener: (event: BleAdvertisingStateEvent) => void): EventSubscription {
    return emitter?.addListener('onAdvertisingStateChanged', listener) ?? { remove: () => {} };
  },
  addScanningStateListener(listener: (event: BleScanningStateEvent) => void): EventSubscription {
    return emitter?.addListener('onScanningStateChanged', listener) ?? { remove: () => {} };
  },
};
