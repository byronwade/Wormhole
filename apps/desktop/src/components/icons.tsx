/**
 * Phosphor duotone icons — default weight for Wormhole UI.
 * Secondary fill tinted via `.ph-duo` CSS.
 */
import {
  Archive as PhArchive,
  ArrowLeft as PhArrowLeft,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowsClockwise as PhArrowsClockwise,
  Broadcast as PhBroadcast,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  Code as PhCode,
  Copy as PhCopy,
  DownloadSimple as PhDownloadSimple,
  Eye as PhEye,
  File as PhFile,
  FileText as PhFileText,
  Files as PhFiles,
  FilmStrip as PhFilmStrip,
  Folder as PhFolder,
  FolderOpen as PhFolderOpen,
  FolderSimple as PhFolderSimple,
  GearSix as PhGearSix,
  HardDrives as PhHardDrives,
  Hourglass as PhHourglass,
  Image as PhImage,
  Info as PhInfo,
  Lightning as PhLightning,
  LinkSimple as PhLinkSimple,
  Lock as PhLock,
  MagnifyingGlass as PhMagnifyingGlass,
  Minus as PhMinus,
  Monitor as PhMonitor,
  MusicNote as PhMusicNote,
  Play as PhPlay,
  ShareNetwork as PhShareNetwork,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  ShieldWarning as PhShieldWarning,
  SpinnerGap as PhSpinnerGap,
  Square as PhSquare,
  Star as PhStar,
  Terminal as PhTerminal,
  Timer as PhTimer,
  Trash as PhTrash,
  TrayArrowDown as PhTrayArrowDown,
  TrayArrowUp as PhTrayArrowUp,
  UploadSimple as PhUploadSimple,
  Users as PhUsers,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WifiHigh as PhWifiHigh,
  X as PhX,
  XCircle as PhXCircle,
  type Icon,
  type IconProps,
  type IconWeight,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const DEFAULT_WEIGHT: IconWeight = "duotone";

export type DuoProps = IconProps & {
  className?: string;
};

function duo(
  IconComp: Icon,
  { className, weight = DEFAULT_WEIGHT, size = "1em", ...rest }: DuoProps,
) {
  return (
    <IconComp
      weight={weight}
      size={size}
      className={cn("ph-duo inline-block shrink-0", className)}
      aria-hidden={rest["aria-label"] || rest["aria-labelledby"] ? undefined : true}
      {...rest}
    />
  );
}

/** Semantic Portal icons */
export const IconShare = (p: DuoProps) => duo(PhTrayArrowUp, p);
export const IconConnect = (p: DuoProps) => duo(PhTrayArrowDown, p);
export const IconMount = (p: DuoProps) => duo(PhFolderOpen, p);
export const IconDrop = (p: DuoProps) => duo(PhHourglass, p);
export const IconDrive = (p: DuoProps) => duo(PhHardDrives, p);
export const IconSettings = (p: DuoProps) => duo(PhGearSix, p);
export const IconNearby = (p: DuoProps) => duo(PhBroadcast, p);
export const IconSpeed = (p: DuoProps) => duo(PhLightning, p);
export const IconOpen = (p: DuoProps) => duo(PhArrowSquareOut, p);
export const IconCopy = (p: DuoProps) => duo(PhCopy, p);
export const IconPaste = (p: DuoProps) => duo(PhClipboardText, p);
export const IconLink = (p: DuoProps) => duo(PhLinkSimple, p);
export const IconCheck = (p: DuoProps) => duo(PhCheck, p);
export const IconCheckCircle = (p: DuoProps) => duo(PhCheckCircle, p);
export const IconClose = (p: DuoProps) => duo(PhX, p);
export const IconError = (p: DuoProps) => duo(PhXCircle, p);
export const IconWarning = (p: DuoProps) => duo(PhWarning, p);
export const IconBack = (p: DuoProps) => duo(PhArrowLeft, p);
export const IconRefresh = (p: DuoProps) => duo(PhArrowsClockwise, p);
export const IconSpinner = (p: DuoProps) =>
  duo(PhSpinnerGap, {
    ...p,
    weight: p.weight ?? "bold",
    className: cn("motion-safe:animate-spin", p.className),
  });
export const IconUpload = IconShare;
export const IconDownload = IconConnect;

/** Lucide-compatible names used across App / wizard / chrome */
export const Files = (p: DuoProps) => duo(PhFiles, p);
export const Upload = (p: DuoProps) => duo(PhUploadSimple, p);
export const Download = (p: DuoProps) => duo(PhDownloadSimple, p);
export const Folder = (p: DuoProps) => duo(PhFolder, p);
export const FolderOpen = (p: DuoProps) => duo(PhFolderOpen, p);
export const FolderUp = (p: DuoProps) => duo(PhFolderSimple, p);
export const File = (p: DuoProps) => duo(PhFile, p);
export const Settings = (p: DuoProps) => duo(PhGearSix, p);
export const Search = (p: DuoProps) => duo(PhMagnifyingGlass, p);
export const ChevronRight = (p: DuoProps) =>
  duo(PhCaretRight, { ...p, weight: p.weight ?? "bold" });
export const ChevronLeft = (p: DuoProps) =>
  duo(PhCaretLeft, { ...p, weight: p.weight ?? "bold" });
export const ChevronDown = (p: DuoProps) =>
  duo(PhCaretDown, { ...p, weight: p.weight ?? "bold" });
export const Clock = (p: DuoProps) => duo(PhClock, p);
export const X = (p: DuoProps) => duo(PhX, p);
export const Check = (p: DuoProps) => duo(PhCheck, p);
export const Copy = (p: DuoProps) => duo(PhCopy, p);
export const Loader2 = (p: DuoProps) => IconSpinner(p);
export const AlertCircle = (p: DuoProps) => duo(PhWarningCircle, p);
export const AlertTriangle = (p: DuoProps) => duo(PhWarning, p);
export const FileText = (p: DuoProps) => duo(PhFileText, p);
export const Image = (p: DuoProps) => duo(PhImage, p);
export const Film = (p: DuoProps) => duo(PhFilmStrip, p);
export const Music = (p: DuoProps) => duo(PhMusicNote, p);
export const Archive = (p: DuoProps) => duo(PhArchive, p);
export const Code = (p: DuoProps) => duo(PhCode, p);
export const Star = (p: DuoProps) => duo(PhStar, p);
export const Users = (p: DuoProps) => duo(PhUsers, p);
export const Share2 = (p: DuoProps) => duo(PhShareNetwork, p);
export const Trash2 = (p: DuoProps) => duo(PhTrash, p);
export const Play = (p: DuoProps) => duo(PhPlay, p);
export const RefreshCw = (p: DuoProps) => duo(PhArrowsClockwise, p);
export const ExternalLink = (p: DuoProps) => duo(PhArrowSquareOut, p);
export const Eye = (p: DuoProps) => duo(PhEye, p);
export const Timer = (p: DuoProps) => duo(PhTimer, p);
export const Link2 = (p: DuoProps) => duo(PhLinkSimple, p);
export const Shield = (p: DuoProps) => duo(PhShield, p);
export const ShieldCheck = (p: DuoProps) => duo(PhShieldCheck, p);
export const ShieldAlert = (p: DuoProps) => duo(PhShieldWarning, p);
export const HardDrive = (p: DuoProps) => duo(PhHardDrives, p);
export const Wifi = (p: DuoProps) => duo(PhWifiHigh, p);
export const Lock = (p: DuoProps) => duo(PhLock, p);
export const CheckCircle2 = (p: DuoProps) => duo(PhCheckCircle, p);
export const XCircle = (p: DuoProps) => duo(PhXCircle, p);
export const Circle = (p: DuoProps) =>
  duo(PhCircle, { ...p, weight: p.weight ?? "regular" });
export const Terminal = (p: DuoProps) => duo(PhTerminal, p);
export const Info = (p: DuoProps) => duo(PhInfo, p);
export const MonitorSmartphone = (p: DuoProps) => duo(PhMonitor, p);
export const Minus = (p: DuoProps) =>
  duo(PhMinus, { ...p, weight: p.weight ?? "bold" });
export const Square = (p: DuoProps) =>
  duo(PhSquare, { ...p, weight: p.weight ?? "bold" });
