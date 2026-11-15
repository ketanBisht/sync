package dev.sync.ble

import java.util.UUID

object BleConstants {
    val SERVICE_UUID: UUID = UUID.fromString("12345678-0000-1000-8000-00805f9b34fb")

    val CHAR_MESSAGE_INVENTORY_UUID: UUID = UUID.fromString("12345678-0001-1000-8000-00805f9b34fb")
    val CHAR_MESSAGE_TRANSFER_UUID: UUID = UUID.fromString("12345678-0002-1000-8000-00805f9b34fb")
    val CHAR_MESSAGE_AVAILABLE_UUID: UUID = UUID.fromString("12345678-0003-1000-8000-00805f9b34fb")
    val CHAR_RECEIPT_UUID: UUID = UUID.fromString("12345678-0004-1000-8000-00805f9b34fb")

    // Client Characteristic Configuration Descriptor (CCCD) for notifications/indications
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val MANUFACTURER_ID: Int = 0x5359 // ASCII "SY"
    const val PROTOCOL_VERSION: Int = 1
    const val DEFAULT_REQUESTED_MTU: Int = 512
}
