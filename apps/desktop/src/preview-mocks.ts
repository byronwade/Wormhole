/**
 * Browser-only stubs so `pnpm dev` can render the UI without a Tauri webview.
 */
import { mockIPC } from "@tauri-apps/api/mocks";

const isTauri =
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

if (!isTauri) {
  mockIPC(
    (cmd, args) => {
      switch (cmd) {
        case "get_active_hosts":
        case "get_active_mounts":
          return [];
        case "get_local_ip":
          return ["192.168.1.42"];
        case "check_fuse_installed":
          return true;
        case "default_mount_path": {
          const label =
            args && typeof args === "object" && "label" in args
              ? String((args as { label: string }).label)
              : "mount";
          return `/home/preview/Wormhole/${label}`;
        }
        case "start_hosting_with_expiration":
          return {
            id: "preview-share-1",
            share_path:
              args && typeof args === "object" && "path" in args
                ? String((args as { path: string }).path)
                : "/Users/alex/Renders",
            port: 4433,
            join_code: "7KJMXB",
            host_name: "Alexs-MacBook",
            share_mode:
              args && typeof args === "object" && "shareMode" in args
                ? String((args as { shareMode: string }).shareMode)
                : "mount",
          };
        case "connect_with_code_and_id":
          return {
            id: "preview-conn-1",
            mount_point: "/home/preview/Wormhole/7KJMXB",
            join_code: "7KJMXB",
            peer_name: "Studio Render Box",
          };
        case "list_nearby_peers":
          return [
            {
              id: "local-Alexs-MacBook",
              name: "Alexs-MacBook (this device)",
              join_code: null,
              port: null,
              last_seen_ms: Date.now(),
              is_self: true,
            },
            {
              id: "peer-render",
              name: "Studio Render Box",
              join_code: "7KJMXB",
              port: 4433,
              last_seen_ms: Date.now(),
              is_self: false,
            },
          ];
        case "get_device_identity":
          return {
            id: "local-Alexs-MacBook",
            name: "Alexs-MacBook",
            join_code: null,
            port: null,
            last_seen_ms: 0,
            is_self: true,
          };
        case "open_file":
        case "reveal_in_explorer":
        case "stop_hosting_by_id":
        case "disconnect_by_id":
          return null;
        case "shell_integration_status":
          return { installed: false, detail: "Not installed (preview)" };
        case "install_shell_integration":
          return { installed: true, detail: "Installed (preview)" };
        case "uninstall_shell_integration":
          return { installed: false, detail: "Removed (preview)" };
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );

  // Skip setup wizard in preview
  try {
    localStorage.setItem("wormhole_setup_complete", "true");
  } catch {
    // ignore
  }
}
