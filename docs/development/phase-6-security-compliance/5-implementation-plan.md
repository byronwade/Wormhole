1) Add deps: axum(ws), spake2, rand, futures to workspace; plan TURN/relay fallback (placeholder) for hostile NATs.
2) New crate teleport-signal (axum WS): /ws/:code with broadcast per code; bin main.rs.
3) teleport-core crypto.rs: PAKE (start_handshake/finish_handshake) using spake2 Ed25519.
4) teleport-daemon net/rendezvous.rs: WS to signal; exchange Announce/PeerFound; return peer SocketAddr (STUN placeholder for public IP detection).
5) Daemon global APIs in lib.rs: start_host_global(code), start_mount_global(code, mountpoint) using rendezvous then host/mount.
6) QUIC config: hole-punch-friendly transport (keepalive, idle timeout tweaks); prefer persistent QUIC session reuse where possible.
7) UI: join code generator/input; host shows code; client enters code; invoke global start/connect commands.
8) Dockerfile + deploy teleport-signal (e.g., Fly.io); point clients to wss:// endpoint.
