# LAN Discovery — Lessons from LocalSend

## Why look at LocalSend?

[LocalSend](https://github.com/localsend/localsend) (86k+ stars) solved **zero-config same-network discovery** better than almost anyone: multicast + announce/response, device fingerprints, rich peer cards, and clear firewall docs. Wormhole is not a file-push app — we **mount folders as drives** — but the discovery UX is directly transferable.

## What we adopted

| LocalSend idea | Wormhole adaptation |
|----------------|---------------------|
| Multicast UDP discovery (`224.0.0.167`) | Same group on port **41234** + broadcast fallback |
| Announce + unicast response | Presence beacons with `announce: true/false` |
| Stable fingerprint | Persisted `~/.config/wormhole/device_fingerprint` |
| Alias / deviceType / deviceModel | Shown in Portal Nearby cards |
| App starts discovering immediately | Presence loop runs even when not hosting |
| Accept/reject before transfer | *Next:* host approval gate before `HelloAck` (planned) |
| Clear firewall port table | Documented for QUIC **4433/udp** + discovery **41234/udp** |

## What we intentionally did *not* copy

- REST/HTTPS file upload API — Wormhole’s data plane is **QUIC + FUSE mount**
- Browser download fallback — our product is a live drive, not a zip link
- PIN-on-prepare — join codes + PAKE already cover session auth (PIN can layer later)

## Positioning

> **LocalSend** moves files across the room.  
> **Wormhole** mounts the whole folder so you can scrub, grep, and edit like it’s local.

They complement each other. Creatives often need both.

## Protocol sketch (`wormhole-lan-v2`)

```json
{
  "magic": "wormhole-lan-v2",
  "version": "1.0",
  "id": "wh-<fingerprint>",
  "name": "Studio Mac",
  "fingerprint": "wh-<fingerprint>",
  "device_type": "desktop",
  "device_model": "macos",
  "port": 4433,
  "join_code": "WORM-XXXX",
  "announce": true,
  "sharing": true
}
```

v1 beacons (`wormhole-lan-v1`) still parse for backward compatibility.

## Implementation

- Desktop: `apps/desktop/src-tauri/src/lan.rs`
- Portal UI: `apps/desktop/src/components/PortalHome.tsx`
- Types: `apps/desktop/src/types/portal.ts`
