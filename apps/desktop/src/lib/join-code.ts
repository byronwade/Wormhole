/**
 * Re-export join-code helpers from @wormhole/shared so existing @/lib/join-code imports keep working.
 */
export {
  normalizeJoinCode,
  formatJoinCode,
  isValidJoinCode,
  extractJoinCode,
  makeShareLink,
  joinCodeQrPayload,
  detectJoinCodeFromClipboard,
} from "@wormhole/shared";
