/**
 * Phosphor duotone icons — default weight for Wormhole UI.
 * Secondary fill tinted via `.ph-duo` CSS.
 */
import {
  ArrowLeft,
  ArrowSquareOut,
  Broadcast,
  Check,
  CheckCircle,
  ClipboardText,
  Copy,
  FolderOpen,
  GearSix,
  LinkSimple,
  Lightning,
  SpinnerGap,
  TrayArrowDown,
  TrayArrowUp,
  X,
  XCircle,
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

export const IconShare = (p: DuoProps) => duo(TrayArrowUp, p);
export const IconConnect = (p: DuoProps) => duo(TrayArrowDown, p);
export const IconMount = (p: DuoProps) => duo(FolderOpen, p);
export const IconSettings = (p: DuoProps) => duo(GearSix, p);
export const IconNearby = (p: DuoProps) => duo(Broadcast, p);
export const IconSpeed = (p: DuoProps) => duo(Lightning, p);
export const IconOpen = (p: DuoProps) => duo(ArrowSquareOut, p);
export const IconCopy = (p: DuoProps) => duo(Copy, p);
export const IconPaste = (p: DuoProps) => duo(ClipboardText, p);
export const IconLink = (p: DuoProps) => duo(LinkSimple, p);
export const IconCheck = (p: DuoProps) => duo(Check, p);
export const IconCheckCircle = (p: DuoProps) => duo(CheckCircle, p);
export const IconClose = (p: DuoProps) => duo(X, p);
export const IconError = (p: DuoProps) => duo(XCircle, p);
export const IconSpinner = (p: DuoProps) =>
  duo(SpinnerGap, {
    ...p,
    weight: p.weight ?? "bold",
    className: cn("motion-safe:animate-spin", p.className),
  });
export const IconUpload = IconShare;
export const IconDownload = IconConnect;
export const IconBack = (p: DuoProps) => duo(ArrowLeft, p);
