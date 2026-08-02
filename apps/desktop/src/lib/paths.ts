import { invoke } from "@tauri-apps/api/core";
import { formatJoinCode, normalizeJoinCode } from "@wormhole/shared";

/** Ask the backend for ~/Wormhole/<label> (created if missing). */
export async function resolveDefaultMountPath(joinCodeOrLabel: string): Promise<string> {
  const label = normalizeJoinCode(joinCodeOrLabel) || "mount";
  return invoke<string>("default_mount_path", { label });
}

/** Friendly share folder name from an absolute path. */
export function folderDisplayName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

/** Suggested mount folder name from a join code. */
export function mountLabelFromCode(code: string): string {
  return `Share-${formatJoinCode(code)}`;
}
