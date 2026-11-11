# SYNC – BLE Communication Protocol

> **Status: Preliminary Design — Phase 1**
> This document defines the intended BLE communication architecture for Phase 2 implementation.
> No BLE code exists yet. All UUIDs, payload formats, and sequence diagrams are design proposals
> and should be reviewed before implementation.

---

## Architectural Decision: Application-Level Store-Carry-Forward over BLE GATT

SYNC does **not** rely on a Bluetooth mesh networking stack (e.g., Bluetooth Mesh, BLE isochronous channels, or proprietary mesh SDKs). Ordinary Android BLE does not automatically provide multi-hop routing.

Instead, SYNC implements **application-level opportunistic store-carry-forward**:

1. Each device independently manages a local store of messages.
2. When two devices come into BLE range, they exchange message inventories and transfer messages the other device is missing.
3. Devices carry received messages with them as they move.
4. When a carrier comes into range of a new device, it forwards the messages.

This approach requires no special BLE hardware or chipset features and works on standard Android BLE.

---

## Multi-Hop Delivery Example

```
Device A  ──(BLE range)──  Device B  ──(BLE range)──  Device C
   │                            │                           │
   │  1. A creates message M    │                           │
   │  2. A connects to B        │                           │
   │  3. A → B: inventory       │                           │
   │  4. B → A: inventory       │                           │
   │  5. A → B: transfer M      │                           │
   │  6. B stores M locally     │                           │
   │  7. A and B disconnect     │                           │
   │                            │  8. B moves, finds C      │
   │                            │  9. B connects to C       │
   │                            │  10. B → C: inventory     │
   │                            │  11. C → B: inventory     │
   │                            │  12. B → C: transfer M    │
   │                            │  13. C stores M locally   │
   │                            │  14. M.hopCount = 2       │
```

Device B never needs to know the destination is C. It simply forwards all messages it holds that the peer does not already have, subject to hop count and TTL constraints.

---

## BLE Roles

| Role | Description |
|------|-------------|
| **Central** | The device that initiates a BLE connection (scanner) |
| **Peripheral** | The device that accepts a connection (advertiser) |

In SYNC, every device alternates between Central and Peripheral roles. Android supports simultaneous scanning and advertising, though battery constraints may require duty-cycling.

---

## 1. BLE Advertising and Device Discovery

Each SYNC device advertises a BLE connectable advertisement packet containing:

| Field | Value |
|-------|-------|
| Service UUID | `12345678-0000-1000-8000-00805f9b34fb` (SYNC service) |
| Local Name | Device name (truncated to fit advertisement payload) |
| Manufacturer Data | `[0x53, 0x59, protocol_version, flags]` ("SY" prefix) |

Scanning devices filter for advertisements containing the SYNC service UUID to avoid connecting to unrelated BLE peripherals.

**Android permissions required (Android 12+):**
```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

---

## 2. Device Identification

Upon connection establishment, the Central reads the peripheral's `device_id` from a standard BLE Device Information Service or from the SYNC GATT characteristic. The `device_id` is a UUID that persists across BLE sessions and is used as the stable device identity in all SYNC data models.

---

## 3. GATT Service and Characteristic Structure

**SYNC Service UUID:** `12345678-0000-1000-8000-00805f9b34fb`

| Characteristic | UUID | Properties | Description |
|----------------|------|------------|-------------|
| MESSAGE_INVENTORY | `12345678-0001-...` | Write-without-response | Central sends JSON array of known message IDs |
| MESSAGE_TRANSFER | `12345678-0002-...` | Write-with-response | Central sends chunked message payload; peripheral responds ACK/NACK |
| MESSAGE_AVAILABLE | `12345678-0003-...` | Notify + Read | Peripheral notifies central when it has messages the central lacks |
| RECEIPT | `12345678-0004-...` | Write-with-response | Sends a message receipt acknowledgement |

> **Note:** Full 128-bit UUIDs are abbreviated above. See `packages/shared/src/constants/protocol.ts` for the complete UUID strings.

---

## 4. Message Inventory Exchange

Before transferring any messages, two devices exchange inventories to determine what each device is missing:

```
Central (A)                          Peripheral (B)
    │                                     │
    │── WRITE MESSAGE_INVENTORY ─────────►│  (A's known message IDs)
    │                                     │
    │◄─ NOTIFY MESSAGE_AVAILABLE ─────────│  (B has N messages A lacks)
    │                                     │
    │── READ MESSAGE_AVAILABLE ──────────►│
    │◄─ { count: N, messageIds: [...] } ──│
```

The inventory payload is a JSON array of UUID strings:
```json
{ "knownIds": ["uuid1", "uuid2", "uuid3"], "deviceId": "my-device-uuid" }
```

The peripheral computes the difference: messages it has that the central lacks, and notifies how many are ready for transfer.

---

## 5. Message Transfer

Messages larger than `MAX_BLE_PAYLOAD_BYTES` (500 bytes) are chunked:

```json
{
  "messageId": "uuid",
  "chunkIndex": 0,
  "totalChunks": 3,
  "data": "<base64-encoded-chunk>"
}
```

Each chunk is written to `MESSAGE_TRANSFER`. The peripheral reassembles chunks and ACKs the complete message once all chunks are received.

**ACK payload:**
```json
{ "messageId": "uuid", "status": "ok" }
```

**NACK payload (with error reason):**
```json
{ "messageId": "uuid", "status": "error", "reason": "checksum_mismatch" }
```

---

## 6. Message Acknowledgements

Upon successfully storing a received message, the receiving device:
1. Creates a `MessageReceipt` record (type: `received`).
2. Sends an ACK on the `RECEIPT` characteristic.
3. If the message has a unicast `recipientId` matching the receiver's `deviceId`, it also creates a `delivered` receipt.

---

## 7. Duplicate Message Detection

Before storing or forwarding any message, a device checks:
```sql
SELECT 1 FROM message_receipts WHERE message_id = ? AND device_id = localDeviceId LIMIT 1
```

If a receipt exists, the message is a duplicate. It is acknowledged (to avoid retransmission) but not stored again and not forwarded.

---

## 8. Message Expiry and TTL

Before forwarding, a device checks:
1. `message.expiresAt > now()` — wall-clock TTL has not expired.
2. `message.hopCount < message.maxHops` — hop limit not reached.

If either check fails, the message is NOT forwarded. It is stored locally (for audit) but marked `expired` or `failed`.

---

## 9. Hop Count and Maximum Forwarding Limits

The relay device increments `hopCount` by 1 before forwarding. The default `maxHops` is 10 (configurable via protocol constants). This creates a network diameter of 10 device hops — sufficient for small to medium emergency response zones.

---

## 10. Retry Mechanisms

If a GATT write fails (timeout, disconnection), the sending device:
1. Waits for a randomized back-off interval (initial: 1s, max: 30s, factor: 2×).
2. Retries up to 3 times before marking the transfer as failed.
3. The message remains in local storage and will be retried when a compatible peer is encountered.

---

## 11. Store-Carry-Forward Delivery

No persistent connection is required. The complete lifecycle of store-carry-forward:

1. **Store**: Upon receiving a message, store it in SQLite.
2. **Carry**: The message persists through device restarts and BLE disconnections.
3. **Forward**: When a new peer is encountered, include this message in the inventory exchange and transfer it if the peer lacks it.

This continues until:
- `hopCount >= maxHops` — routing TTL exhausted.
- `expiresAt < now()` — wall-clock TTL exhausted.
- A `delivered` receipt is received confirming the intended recipient has the message.

---

## Connection and Disconnection Handling

| Event | Handling |
|-------|----------|
| Peripheral disconnects mid-transfer | Mark in-progress transfer as pending; retry on next encounter |
| Central disconnects after partial inventory | Restart inventory exchange on next connection |
| Unexpected disconnection | Log to `message_receipts` with partial state; clean up on next startup |
| Device out of range | No action; message remains in store for next peer |

---

## Preliminary Payload Format

The `Message.payload` field contains a JSON string whose schema varies by message context. Proposed payload types for Phase 2:

**Incident broadcast:**
```json
{
  "type": "incident_broadcast",
  "incident": { /* Incident object */ }
}
```

**Incident event:**
```json
{
  "type": "incident_event",
  "event": { /* IncidentEvent object */ }
}
```

**Resource request:**
```json
{
  "type": "resource_request",
  "resourceType": "medical_supplies",
  "quantity": 10,
  "incidentId": "uuid"
}
```

All payloads are validated with Zod at the receiving device.
