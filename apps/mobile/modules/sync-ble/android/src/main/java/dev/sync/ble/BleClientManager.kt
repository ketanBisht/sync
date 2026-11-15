package dev.sync.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class BleClientManager(
    private val context: Context,
    private val bluetoothManager: BluetoothManager,
    private val onLog: (level: String, message: String) -> Unit,
    private val onDeviceDiscovered: (deviceMap: Map<String, Any?>) -> Unit,
    private val onConnectionChanged: (address: String, state: String) -> Unit,
    private val onMtuChanged: (address: String, mtu: Int) -> Unit,
    private val onServicesDiscovered: (address: String, success: Boolean) -> Unit,
    private val onChunkReceived: (senderAddress: String, chunkJson: String) -> Unit,
    private val onReceiptReceived: (senderAddress: String, receiptJson: String) -> Unit
) {
    companion object {
        private const val TAG = "SYNC_BleClient"
        private const val WRITE_TIMEOUT_MS = 5000L
    }

    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    var isScanning = false
        private set

    val gattClients = ConcurrentHashMap<String, BluetoothGatt>()
    val deviceMtus = ConcurrentHashMap<String, Int>()

    // Pending write deferrals for flow-controlled chunk transmission
    private val pendingWrites = ConcurrentHashMap<String, CompletableDeferred<Boolean>>()

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val address = gatt.device.address
            Log.d(TAG, "Client connection state: $address -> $newState (status: $status)")

            if (status != BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_DISCONNECTED) {
                onLog("warn", "Connection error with $address, status: $status")
                gattClients.remove(address)?.close()
                pendingWrites.remove(address)?.complete(false)
                onConnectionChanged(address, "disconnected")
                return
            }

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gattClients[address] = gatt
                onLog("info", "Connected to GATT Server: $address, requesting MTU 512...")
                onConnectionChanged(address, "connected")

                // Request high MTU for efficient chunk transmission
                val mtuRequested = gatt.requestMtu(BleConstants.DEFAULT_REQUESTED_MTU)
                if (!mtuRequested) {
                    onLog("warn", "requestMtu returned false, proceeding to service discovery with default MTU")
                    gatt.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                onLog("info", "Disconnected from GATT Server: $address")
                gattClients.remove(address)?.close()
                deviceMtus.remove(address)
                pendingWrites.remove(address)?.complete(false)
                onConnectionChanged(address, "disconnected")
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            val address = gatt.device.address
            val negotiatedMtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23
            deviceMtus[address] = negotiatedMtu
            onLog("info", "MTU negotiated with $address: $negotiatedMtu bytes (status: $status)")
            this@BleClientManager.onMtuChanged(address, negotiatedMtu)

            // Discover services now that MTU negotiation is complete
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val address = gatt.device.address
            if (status != BluetoothGatt.GATT_SUCCESS) {
                onLog("error", "Failed to discover services on $address, status: $status")
                onServicesDiscovered(address, false)
                return
            }

            val syncService = gatt.getService(BleConstants.SERVICE_UUID)
            if (syncService == null) {
                onLog("warn", "Discovered services on $address but SYNC service was not found")
                onServicesDiscovered(address, false)
                return
            }

            onLog("info", "SYNC service discovered on $address! Subscribing to notifications...")

            // Subscribe to RECEIPT notifications
            val receiptChar = syncService.getCharacteristic(BleConstants.CHAR_RECEIPT_UUID)
            if (receiptChar != null) {
                enableNotification(gatt, receiptChar)
            }

            // Subscribe to MESSAGE_TRANSFER notifications
            val transferChar = syncService.getCharacteristic(BleConstants.CHAR_MESSAGE_TRANSFER_UUID)
            if (transferChar != null) {
                enableNotification(gatt, transferChar)
            }

            onServicesDiscovered(address, true)
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            val address = gatt.device.address
            val success = status == BluetoothGatt.GATT_SUCCESS
            if (!success) {
                onLog("warn", "Characteristic write failed on $address (${characteristic.uuid}), status: $status")
            }
            pendingWrites.remove(address)?.complete(success)
        }

        // Android 13+ callback
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            handleCharacteristicChanged(gatt.device.address, characteristic.uuid, value)
        }

        // Deprecated callback for Android 12 and below
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            val value = characteristic.value ?: return
            handleCharacteristicChanged(gatt.device.address, characteristic.uuid, value)
        }

        private fun handleCharacteristicChanged(address: String, uuid: UUID, value: ByteArray) {
            val dataStr = String(value, StandardCharsets.UTF_8)
            when (uuid) {
                BleConstants.CHAR_RECEIPT_UUID -> {
                    onLog("info", "Client received receipt notification from $address: ${dataStr.take(80)}")
                    onReceiptReceived(address, dataStr)
                }
                BleConstants.CHAR_MESSAGE_TRANSFER_UUID -> {
                    onLog("debug", "Client received transfer chunk notification from $address (${value.size} bytes)")
                    onChunkReceived(address, dataStr)
                }
                else -> {
                    onLog("debug", "Received notification on $uuid: ${dataStr.take(60)}")
                }
            }
        }
    }

    private fun enableNotification(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        val registered = gatt.setCharacteristicNotification(characteristic, true)
        if (!registered) {
            onLog("warn", "Failed to register local notification on ${characteristic.uuid}")
            return
        }

        val descriptor = characteristic.getDescriptor(BleConstants.CCCD_UUID)
        if (descriptor != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                gatt.writeDescriptor(descriptor)
            }
        }
    }

    fun startScanning(): Boolean {
        val adapter = bluetoothManager.adapter
        if (adapter == null || !adapter.isEnabled) {
            onLog("error", "Cannot scan: Bluetooth adapter is disabled or unavailable")
            return false
        }

        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            onLog("error", "BluetoothLeScanner is null")
            return false
        }

        val filters = listOf(
            ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
                .build()
        )

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                result ?: return
                val device = result.device
                val scanRecord = result.scanRecord
                val name = device.name ?: scanRecord?.deviceName ?: "SYNC Node"
                val address = device.address
                val rssi = result.rssi

                // Extract manufacturer data if available (e.g. prefix of deviceId)
                val mfrBytes = scanRecord?.getManufacturerSpecificData(BleConstants.MANUFACTURER_ID)
                var deviceId: String? = null
                if (mfrBytes != null && mfrBytes.size >= 2) {
                    val idBytes = mfrBytes.sliceArray(1 until mfrBytes.size)
                    deviceId = String(idBytes, StandardCharsets.UTF_8)
                }

                val map = mapOf(
                    "address" to address,
                    "name" to name,
                    "rssi" to rssi,
                    "deviceId" to deviceId,
                    "lastSeenAt" to System.currentTimeMillis()
                )
                onDeviceDiscovered(map)
            }

            override fun onScanFailed(errorCode: Int) {
                isScanning = false
                val reason = when (errorCode) {
                    SCAN_FAILED_ALREADY_STARTED -> "Scan already started"
                    SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "App registration failed"
                    SCAN_FAILED_INTERNAL_ERROR -> "Internal error"
                    SCAN_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                    else -> "Error code: $errorCode"
                }
                onLog("error", "Scan failed: $reason")
            }
        }

        scanCallback = callback
        scanner?.startScan(filters, settings, callback)
        isScanning = true
        onLog("info", "Started BLE scanning for SYNC service (${BleConstants.SERVICE_UUID})")
        return true
    }

    fun stopScanning() {
        try {
            if (scanner != null && scanCallback != null) {
                scanner?.stopScan(scanCallback)
                scanCallback = null
            }
            isScanning = false
            onLog("info", "Stopped BLE scanning")
        } catch (e: Exception) {
            onLog("warn", "Error stopping scan: ${e.message}")
        }
    }

    fun connect(deviceAddress: String): Boolean {
        val adapter = bluetoothManager.adapter ?: return false
        if (!adapter.isEnabled) {
            onLog("error", "Cannot connect: Bluetooth is disabled")
            return false
        }

        val device = try {
            adapter.getRemoteDevice(deviceAddress)
        } catch (e: Exception) {
            onLog("error", "Invalid Bluetooth address: $deviceAddress")
            return false
        }

        onLog("info", "Initiating GATT connection to $deviceAddress...")
        onConnectionChanged(deviceAddress, "connecting")

        val gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, gattCallback)
        }

        if (gatt == null) {
            onLog("error", "connectGatt returned null for $deviceAddress")
            onConnectionChanged(deviceAddress, "disconnected")
            return false
        }

        gattClients[deviceAddress] = gatt
        return true
    }

    fun disconnect(deviceAddress: String) {
        val gatt = gattClients[deviceAddress]
        if (gatt != null) {
            onLog("info", "Disconnecting GATT from $deviceAddress...")
            gatt.disconnect()
        }
    }

    suspend fun writeCharacteristic(
        deviceAddress: String,
        charUuid: UUID,
        payload: String
    ): Boolean {
        val gatt = gattClients[deviceAddress]
        if (gatt == null) {
            onLog("error", "Cannot write: no active GATT connection for $deviceAddress")
            return false
        }

        val syncService = gatt.getService(BleConstants.SERVICE_UUID)
        if (syncService == null) {
            onLog("error", "Cannot write: SYNC service not found on $deviceAddress")
            return false
        }

        val char = syncService.getCharacteristic(charUuid)
        if (char == null) {
            onLog("error", "Characteristic $charUuid not found on $deviceAddress")
            return false
        }

        val bytes = payload.toByteArray(StandardCharsets.UTF_8)
        char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

        val deferred = CompletableDeferred<Boolean>()
        pendingWrites[deviceAddress] = deferred

        val initiated = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val status = gatt.writeCharacteristic(char, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
            status == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            char.value = bytes
            @Suppress("DEPRECATION")
            gatt.writeCharacteristic(char)
        }

        if (!initiated) {
            pendingWrites.remove(deviceAddress)
            onLog("error", "writeCharacteristic invocation returned false for $deviceAddress ($charUuid)")
            return false
        }

        val writeSuccess = withTimeoutOrNull(WRITE_TIMEOUT_MS) {
            deferred.await()
        } ?: false

        if (!writeSuccess) {
            pendingWrites.remove(deviceAddress)
            onLog("warn", "Write to $deviceAddress ($charUuid) timed out or failed")
        }

        return writeSuccess
    }

    suspend fun writeChunk(deviceAddress: String, chunkJson: String): Boolean {
        return writeCharacteristic(deviceAddress, BleConstants.CHAR_MESSAGE_TRANSFER_UUID, chunkJson)
    }

    suspend fun writeReceipt(deviceAddress: String, receiptJson: String): Boolean {
        return writeCharacteristic(deviceAddress, BleConstants.CHAR_RECEIPT_UUID, receiptJson)
    }

    suspend fun writeInventory(deviceAddress: String, inventoryJson: String): Boolean {
        return writeCharacteristic(deviceAddress, BleConstants.CHAR_MESSAGE_INVENTORY_UUID, inventoryJson)
    }

    fun disconnectAll() {
        stopScanning()
        for ((address, gatt) in gattClients) {
            try {
                gatt.disconnect()
                gatt.close()
            } catch (e: Exception) {
                onLog("warn", "Error closing GATT for $address: ${e.message}")
            }
        }
        gattClients.clear()
        deviceMtus.clear()
        pendingWrites.clear()
    }
}
