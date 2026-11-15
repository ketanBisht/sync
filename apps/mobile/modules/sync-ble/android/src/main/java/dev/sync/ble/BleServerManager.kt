package dev.sync.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class BleServerManager(
    private val context: Context,
    private val bluetoothManager: BluetoothManager,
    private val onLog: (level: String, message: String) -> Unit,
    private val onConnectionChanged: (address: String, state: String) -> Unit,
    private val onChunkReceived: (senderAddress: String, chunkJson: String) -> Unit,
    private val onReceiptReceived: (senderAddress: String, receiptJson: String) -> Unit,
    private val onInventoryReceived: (senderAddress: String, inventoryJson: String) -> Unit,
    private val onAdvertisingStateChanged: (isAdvertising: Boolean, error: String?) -> Unit
) {
    companion object {
        private const val TAG = "SYNC_BleServer"
    }

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null

    val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>()

    private var messageTransferChar: BluetoothGattCharacteristic? = null
    private var receiptChar: BluetoothGattCharacteristic? = null
    private var messageAvailableChar: BluetoothGattCharacteristic? = null
    private var inventoryChar: BluetoothGattCharacteristic? = null

    private var isAdvertising = false

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            val address = device.address
            Log.d(TAG, "Server connection state changed: $address -> $newState (status: $status)")

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedDevices[address] = device
                onLog("info", "Central device connected to server: $address")
                onConnectionChanged(address, "connected")
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedDevices.remove(address)
                onLog("info", "Central device disconnected from server: $address")
                onConnectionChanged(address, "disconnected")
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            val address = device.address
            val charUuid = characteristic.uuid
            val dataStr = value?.let { String(it, StandardCharsets.UTF_8) } ?: ""

            Log.d(TAG, "Write request on $charUuid from $address: ${dataStr.take(60)}...")

            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }

            when (charUuid) {
                BleConstants.CHAR_MESSAGE_TRANSFER_UUID -> {
                    onLog("debug", "Received message transfer chunk from $address (${value?.size ?: 0} bytes)")
                    onChunkReceived(address, dataStr)
                }
                BleConstants.CHAR_RECEIPT_UUID -> {
                    onLog("info", "Received receipt on server from $address: ${dataStr.take(80)}")
                    onReceiptReceived(address, dataStr)
                }
                BleConstants.CHAR_MESSAGE_INVENTORY_UUID -> {
                    onLog("info", "Received inventory from $address: ${dataStr.take(80)}")
                    onInventoryReceived(address, dataStr)
                }
                else -> {
                    onLog("warn", "Write on unhandled characteristic: $charUuid from $address")
                }
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            Log.d(TAG, "Descriptor write on ${descriptor.uuid} from ${device.address}")
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            Log.d(TAG, "Read request on ${characteristic.uuid} from ${device.address}")
            val defaultResponse = "{}".toByteArray(StandardCharsets.UTF_8)
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, defaultResponse)
        }

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            Log.d(TAG, "Notification sent to ${device.address}, status: $status")
        }
    }

    fun startServer(): Boolean {
        if (gattServer != null) {
            return true
        }

        try {
            gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
            if (gattServer == null) {
                onLog("error", "Failed to open GATT Server: BluetoothManager returned null")
                return false
            }

            val service = BluetoothGattService(
                BleConstants.SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY
            )

            // 1. MESSAGE_INVENTORY
            val invChar = BluetoothGattCharacteristic(
                BleConstants.CHAR_MESSAGE_INVENTORY_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or
                    BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
            )

            // 2. MESSAGE_TRANSFER
            val transferChar = BluetoothGattCharacteristic(
                BleConstants.CHAR_MESSAGE_TRANSFER_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or
                    BluetoothGattCharacteristic.PROPERTY_READ or
                    BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
            )
            val transferCccd = BluetoothGattDescriptor(
                BleConstants.CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ
            )
            transferChar.addDescriptor(transferCccd)

            // 3. MESSAGE_AVAILABLE
            val availChar = BluetoothGattCharacteristic(
                BleConstants.CHAR_MESSAGE_AVAILABLE_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            val availCccd = BluetoothGattDescriptor(
                BleConstants.CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ
            )
            availChar.addDescriptor(availCccd)

            // 4. RECEIPT
            val recChar = BluetoothGattCharacteristic(
                BleConstants.CHAR_RECEIPT_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE or
                    BluetoothGattCharacteristic.PROPERTY_READ or
                    BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
            )
            val recCccd = BluetoothGattDescriptor(
                BleConstants.CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ
            )
            recChar.addDescriptor(recCccd)

            service.addCharacteristic(invChar)
            service.addCharacteristic(transferChar)
            service.addCharacteristic(availChar)
            service.addCharacteristic(recChar)

            val added = gattServer?.addService(service) ?: false
            if (!added) {
                onLog("error", "Failed to add SYNC service to GATT Server")
                return false
            }

            inventoryChar = invChar
            messageTransferChar = transferChar
            messageAvailableChar = availChar
            receiptChar = recChar

            onLog("info", "SYNC GATT Server initialized with 4 characteristics")
            return true
        } catch (e: Exception) {
            onLog("error", "Exception starting GATT Server: ${e.message}")
            return false
        }
    }

    fun startAdvertising(deviceId: String, deviceName: String): Boolean {
        val adapter = bluetoothManager.adapter
        if (adapter == null || !adapter.isEnabled) {
            onLog("error", "Cannot advertise: Bluetooth adapter is disabled or unavailable")
            onAdvertisingStateChanged(false, "Bluetooth is disabled")
            return false
        }

        if (!adapter.isMultipleAdvertisementSupported) {
            onLog("error", "Multiple advertisement is not supported on this device")
            onAdvertisingStateChanged(false, "Multiple advertisement not supported")
            return false
        }

        if (!startServer()) {
            onAdvertisingStateChanged(false, "Failed to start GATT server")
            return false
        }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            onLog("error", "BluetoothLeAdvertiser is null")
            onAdvertisingStateChanged(false, "BluetoothLeAdvertiser unavailable")
            return false
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()

        // Encode manufacturer data: Protocol Version (1 byte) + deviceId first 8 chars
        val idPrefix = deviceId.replace("-", "").take(8).toByteArray(StandardCharsets.UTF_8)
        val mfrPayload = byteArrayOf(BleConstants.PROTOCOL_VERSION.toByte()) + idPrefix

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false) // Keep under 31 bytes
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
            .addManufacturerData(BleConstants.MANUFACTURER_ID, mfrPayload)
            .build()

        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build()

        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                isAdvertising = true
                onLog("info", "Advertising SYNC service started successfully for device '$deviceName'")
                onAdvertisingStateChanged(true, null)
            }

            override fun onStartFailure(errorCode: Int) {
                isAdvertising = false
                val reason = when (errorCode) {
                    ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                    ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                    ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                    ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                    ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                    else -> "Unknown error code: $errorCode"
                }
                onLog("error", "Advertising failed: $reason")
                onAdvertisingStateChanged(false, reason)
            }
        }

        advertiseCallback = callback
        advertiser?.startAdvertising(settings, data, scanResponse, callback)
        return true
    }

    fun stopAdvertising() {
        try {
            if (advertiser != null && advertiseCallback != null) {
                advertiser?.stopAdvertising(advertiseCallback)
                advertiseCallback = null
            }
            isAdvertising = false
            onAdvertisingStateChanged(false, null)
            onLog("info", "Stopped BLE advertising")
        } catch (e: Exception) {
            onLog("warn", "Error stopping advertising: ${e.message}")
        }
    }

    fun sendNotification(deviceAddress: String, characteristicUuid: UUID, payload: String): Boolean {
        val server = gattServer ?: return false
        val device = connectedDevices[deviceAddress] ?: return false

        val char = when (characteristicUuid) {
            BleConstants.CHAR_RECEIPT_UUID -> receiptChar
            BleConstants.CHAR_MESSAGE_TRANSFER_UUID -> messageTransferChar
            BleConstants.CHAR_MESSAGE_AVAILABLE_UUID -> messageAvailableChar
            else -> null
        } ?: return false

        val bytes = payload.toByteArray(StandardCharsets.UTF_8)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val status = server.notifyCharacteristicChanged(device, char, false, bytes)
            return status == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            char.value = bytes
            @Suppress("DEPRECATION")
            return server.notifyCharacteristicChanged(device, char, false)
        }
    }

    fun sendReceipt(deviceAddress: String, receiptJson: String): Boolean {
        return sendNotification(deviceAddress, BleConstants.CHAR_RECEIPT_UUID, receiptJson)
    }

    fun stopServer() {
        stopAdvertising()
        try {
            gattServer?.close()
            gattServer = null
            connectedDevices.clear()
            onLog("info", "GATT Server closed")
        } catch (e: Exception) {
            onLog("warn", "Error closing GATT server: ${e.message}")
        }
    }
}
