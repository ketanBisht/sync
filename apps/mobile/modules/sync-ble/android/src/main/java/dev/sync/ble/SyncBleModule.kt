package dev.sync.ble

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SyncBleModule : Module() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React application context is null")

    private val bluetoothManager: BluetoothManager by lazy {
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    }

    private var serverManager: BleServerManager? = null
    private var clientManager: BleClientManager? = null

    private fun ensureManagersInitialized() {
        if (serverManager == null) {
            serverManager = BleServerManager(
                context = context,
                bluetoothManager = bluetoothManager,
                onLog = { level, message -> emitLog(level, message) },
                onConnectionChanged = { address, state ->
                    sendEvent("onConnectionStateChanged", mapOf(
                        "address" to address,
                        "state" to state,
                        "role" to "server"
                    ))
                },
                onChunkReceived = { senderAddress, chunkJson ->
                    sendEvent("onChunkReceived", mapOf(
                        "senderAddress" to senderAddress,
                        "chunkJson" to chunkJson,
                        "role" to "server"
                    ))
                },
                onReceiptReceived = { senderAddress, receiptJson ->
                    sendEvent("onReceiptReceived", mapOf(
                        "senderAddress" to senderAddress,
                        "receiptJson" to receiptJson,
                        "role" to "server"
                    ))
                },
                onInventoryReceived = { senderAddress, inventoryJson ->
                    sendEvent("onInventoryReceived", mapOf(
                        "senderAddress" to senderAddress,
                        "inventoryJson" to inventoryJson,
                        "role" to "server"
                    ))
                },
                onAdvertisingStateChanged = { isAdvertising, error ->
                    sendEvent("onAdvertisingStateChanged", mapOf(
                        "isAdvertising" to isAdvertising,
                        "error" to error
                    ))
                }
            )
        }

        if (clientManager == null) {
            clientManager = BleClientManager(
                context = context,
                bluetoothManager = bluetoothManager,
                onLog = { level, message -> emitLog(level, message) },
                onDeviceDiscovered = { deviceMap ->
                    sendEvent("onDeviceDiscovered", deviceMap)
                },
                onConnectionChanged = { address, state ->
                    sendEvent("onConnectionStateChanged", mapOf(
                        "address" to address,
                        "state" to state,
                        "role" to "client"
                    ))
                },
                onMtuChanged = { address, mtu ->
                    sendEvent("onMtuChanged", mapOf(
                        "address" to address,
                        "mtu" to mtu
                    ))
                },
                onServicesDiscovered = { address, success ->
                    sendEvent("onServicesDiscovered", mapOf(
                        "address" to address,
                        "success" to success
                    ))
                },
                onChunkReceived = { senderAddress, chunkJson ->
                    sendEvent("onChunkReceived", mapOf(
                        "senderAddress" to senderAddress,
                        "chunkJson" to chunkJson,
                        "role" to "client"
                    ))
                },
                onReceiptReceived = { senderAddress, receiptJson ->
                    sendEvent("onReceiptReceived", mapOf(
                        "senderAddress" to senderAddress,
                        "receiptJson" to receiptJson,
                        "role" to "client"
                    ))
                }
            )
        }
    }

    private fun emitLog(level: String, message: String) {
        sendEvent("onBleLog", mapOf(
            "level" to level,
            "message" to message,
            "timestamp" to System.currentTimeMillis()
        ))
    }

    override fun definition() = ModuleDefinition {
        Name("SyncBle")

        Events(
            "onBleLog",
            "onDeviceDiscovered",
            "onConnectionStateChanged",
            "onMtuChanged",
            "onServicesDiscovered",
            "onChunkReceived",
            "onReceiptReceived",
            "onInventoryReceived",
            "onAdvertisingStateChanged",
            "onScanningStateChanged"
        )

        Function("isBluetoothSupported") {
            val pm = context.packageManager
            val hasBle = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
            val adapter = bluetoothManager.adapter
            hasBle && adapter != null
        }

        Function("isBluetoothEnabled") {
            bluetoothManager.adapter?.isEnabled ?: false
        }

        Function("isAdvertisingSupported") {
            bluetoothManager.adapter?.isMultipleAdvertisementSupported ?: false
        }

        Function("getPermissionsStatus") {
            val result = mutableMapOf<String, Boolean>()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                result["bluetoothScan"] = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.BLUETOOTH_SCAN
                ) == PackageManager.PERMISSION_GRANTED

                result["bluetoothAdvertise"] = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.BLUETOOTH_ADVERTISE
                ) == PackageManager.PERMISSION_GRANTED

                result["bluetoothConnect"] = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.BLUETOOTH_CONNECT
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                result["bluetooth"] = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.BLUETOOTH
                ) == PackageManager.PERMISSION_GRANTED

                result["bluetoothAdmin"] = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.BLUETOOTH_ADMIN
                ) == PackageManager.PERMISSION_GRANTED
            }

            result["locationFine"] = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            result
        }

        Function("startAdvertising") { deviceId: String, deviceName: String ->
            ensureManagersInitialized()
            serverManager?.startAdvertising(deviceId, deviceName) ?: false
        }

        Function("stopAdvertising") {
            serverManager?.stopAdvertising()
        }

        Function("startScanning") {
            ensureManagersInitialized()
            val started = clientManager?.startScanning() ?: false
            sendEvent("onScanningStateChanged", mapOf("isScanning" to started))
            started
        }

        Function("stopScanning") {
            clientManager?.stopScanning()
            sendEvent("onScanningStateChanged", mapOf("isScanning" to false))
        }

        Function("connect") { deviceAddress: String ->
            ensureManagersInitialized()
            clientManager?.connect(deviceAddress) ?: false
        }

        Function("disconnect") { deviceAddress: String ->
            clientManager?.disconnect(deviceAddress)
        }

        AsyncFunction("writeChunk") Coroutine { deviceAddress: String, chunkJson: String ->
            ensureManagersInitialized()
            clientManager?.writeChunk(deviceAddress, chunkJson) ?: false
        }

        AsyncFunction("writeReceipt") Coroutine { deviceAddress: String, receiptJson: String ->
            ensureManagersInitialized()
            clientManager?.writeReceipt(deviceAddress, receiptJson) ?: false
        }

        Function("sendReceiptNotification") { deviceAddress: String, receiptJson: String ->
            ensureManagersInitialized()
            serverManager?.sendReceipt(deviceAddress, receiptJson) ?: false
        }

        Function("getNegotiatedMtu") { deviceAddress: String ->
            clientManager?.deviceMtus?.get(deviceAddress) ?: 23
        }

        OnDestroy {
            clientManager?.disconnectAll()
            serverManager?.stopServer()
        }
    }
}
