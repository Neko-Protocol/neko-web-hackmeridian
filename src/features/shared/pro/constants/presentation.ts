import { proImageUrl } from "@/lib/config/storage.config";
import type { VaultPresentation } from "../types/vault";

/**
 * Photos for the demo vaults, keyed by vault contract. Everything else comes
 * from the Launchpad application; vaults without an entry get a gradient.
 * Photos are from Unsplash (Unsplash License).
 */
export const VAULT_PRESENTATION: Record<string, VaultPresentation> = {
  // casa-circle
  CDEZ57OJBJOW3LLRJN5VORBTTITMB34WP6J67ELBEJOD33B7PJHE5EM3: {
    imageSrc: proImageUrl("casa-circle.jpg"),
    gradient: "from-[#2F4F45] via-[#1E2E29] to-[#111513]",
  },
  // torre-cartago
  CDSJN67BXE3YA4QSO5S4XMZ4X5INMLRP2VBKYX2LFK37ALFQEKLNTUDG: {
    imageSrc: proImageUrl("torre-cartago.jpg"),
    gradient: "from-[#3E4A5C] via-[#232A33] to-[#121417]",
  },
  // Drying Plant for Ana Coffee
  CBUHVDZZIZH3AIXPCE635XOUBGE5G7QCKQIJPTRDT5IXKWA7X5K53PRO: {
    imageSrc: "/pro/ana-coffee.jpg",
    gradient: "from-[#4A3A2C] via-[#2A211A] to-[#131110]",
  },
};

export const FALLBACK_PRESENTATION: VaultPresentation = {
  gradient: "from-[#2F4F45] via-[#1E2E29] to-[#111513]",
};
