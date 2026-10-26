"use client";

import React, { useSyncExternalStore } from "react";
import Image from "next/image";
import type { VaultAsset } from "../../types/vault";
import { resolveAssetIcon } from "../../utils/vault";

function subscribeMaxSm(onChange: () => void) {
  const mq = window.matchMedia("(max-width: 639px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMaxSmSnapshot() {
  return window.matchMedia("(max-width: 639px)").matches;
}

function getMaxSmServerSnapshot() {
  return false;
}

function useIsMobile() {
  return useSyncExternalStore(
    subscribeMaxSm,
    getMaxSmSnapshot,
    getMaxSmServerSnapshot
  );
}

interface VaultAssetIllustrationsProps {
  collateralAssets: VaultAsset[];
  isLight: boolean;
  issuerIconSrc?: string;
}

const DROP_SHADOW = "drop-shadow(0 10px 20px rgba(0,0,0,0.28))";
const DROP_SHADOW_SECONDARY = "drop-shadow(0 10px 20px rgba(0,0,0,0.22))";

// Desktop sizes (original)
const DUAL_LEFT_D = { width: 128, height: 150, top: -10, right: 88 } as const;
const DUAL_RIGHT_D = { width: 108, height: 128, top: 14, right: -10 } as const;
const ISSUER_TOKEN_D = {
  width: 108,
  height: 128,
  top: 14,
  right: 112,
} as const;
const ISSUER_BRAND_D = {
  width: 128,
  height: 150,
  top: -10,
  right: 14,
} as const;
const SINGLE_D = { width: 138, height: 160, top: -8, right: -8 } as const;

// Mobile sizes (smaller)
const DUAL_LEFT_M = { width: 96, height: 114, top: 4, right: 68 } as const;
const DUAL_RIGHT_M = { width: 80, height: 94, top: 22, right: -8 } as const;
const ISSUER_TOKEN_M = { width: 80, height: 94, top: 22, right: 86 } as const;
const ISSUER_BRAND_M = { width: 96, height: 114, top: 4, right: 2 } as const;
const SINGLE_M = { width: 104, height: 122, top: 8, right: -4 } as const;

const WRAPPER_BASE =
  "absolute right-0 top-0 h-full pointer-events-none select-none";

interface IllustrationSlotProps {
  src: string;
  alt: string;
  style: React.CSSProperties;
}

function IllustrationSlot({ src, alt, style }: IllustrationSlotProps) {
  return (
    <div className="absolute" style={style}>
      <Image src={src} alt={alt} fill unoptimized className="object-contain" />
    </div>
  );
}

export const VaultAssetIllustrations: React.FC<
  VaultAssetIllustrationsProps
> = ({ collateralAssets, isLight, issuerIconSrc }) => {
  const isMobile = useIsMobile();

  const DUAL_LEFT = isMobile ? DUAL_LEFT_M : DUAL_LEFT_D;
  const DUAL_RIGHT = isMobile ? DUAL_RIGHT_M : DUAL_RIGHT_D;
  const ISSUER_TOKEN = isMobile ? ISSUER_TOKEN_M : ISSUER_TOKEN_D;
  const ISSUER_BRAND = isMobile ? ISSUER_BRAND_M : ISSUER_BRAND_D;
  const SINGLE = isMobile ? SINGLE_M : SINGLE_D;
  const wrapperClass = `${WRAPPER_BASE} ${isMobile ? "w-[44%]" : "w-[46%]"}`;

  const first = collateralAssets[0];
  const second = collateralAssets[1];

  if (!first) return null;

  if (second) {
    return (
      <div className={wrapperClass}>
        <IllustrationSlot
          src={resolveAssetIcon(first, isLight)}
          alt={first.symbol}
          style={{
            ...DUAL_LEFT,
            transform: "rotate(-12deg)",
            filter: DROP_SHADOW,
          }}
        />
        <IllustrationSlot
          src={resolveAssetIcon(second, isLight)}
          alt={second.symbol}
          style={{
            ...DUAL_RIGHT,
            transform: "rotate(9deg)",
            filter: DROP_SHADOW_SECONDARY,
          }}
        />
      </div>
    );
  }

  if (issuerIconSrc) {
    return (
      <div className={wrapperClass}>
        <IllustrationSlot
          src={resolveAssetIcon(first, isLight)}
          alt={first.symbol}
          style={{
            ...ISSUER_TOKEN,
            transform: "rotate(-12deg)",
            filter: DROP_SHADOW,
          }}
        />
        <IllustrationSlot
          src={issuerIconSrc}
          alt="issuer"
          style={{
            ...ISSUER_BRAND,
            transform: "rotate(9deg)",
            filter: DROP_SHADOW_SECONDARY,
          }}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <IllustrationSlot
        src={resolveAssetIcon(first, isLight)}
        alt={first.symbol}
        style={{ ...SINGLE, transform: "rotate(-8deg)", filter: DROP_SHADOW }}
      />
    </div>
  );
};
