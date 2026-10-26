"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDashboardPositions } from "@/features/shared/positions/hooks/useDashboardPositions";
import { useDashboardVaultPositions } from "@/features/shared/positions/hooks/useDashboardVaultPositions";
import { useBearingYieldPositions } from "@/features/shared/positions/hooks/useBearingYieldPositions";
import { useEtherfuseYields } from "@/features/shared/yields/hooks/useEtherfuseYields";
import { YourPositionsTable } from "./YourPositionsTable";
import MyVaultPositions from "@/features/shared/vault/components/ui/MyVaultPositions";
import { BearingYieldTable } from "./BearingYieldTable";

/**
 * A quiet line rather than a per-section skeleton.
 *
 * Whether a wallet holds pool, vault or bearing-yield positions is unknown
 * until each source answers, so a skeleton shaped like a table promised
 * content that often turned out not to exist and then vanished. This says only
 * what is true — something is still being checked — and leaves almost nothing
 * behind when it resolves to nothing.
 */
function StillChecking() {
  const t = useTranslations("sharedPositions.yourPositions");
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/15 border-t-white/40" />
      <span className="text-white/30 text-xs">{t("stillChecking")}</span>
    </div>
  );
}

const YourPositions: React.FC = () => {
  const t = useTranslations("sharedPositions.yourPositions");
  const { positions, isLoading, isError, hasWallet, refetch } =
    useDashboardPositions();
  const { positions: vaultPositions, isLoading: vaultLoading } =
    useDashboardVaultPositions();

  const vaultViewIdsKey = vaultPositions.map((p) => p.vault.id).join(",");
  const vaultViews = useMemo(
    () => vaultPositions.map((p) => p.vault),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultViewIdsKey]
  );

  const vaultBalancesKey = vaultPositions
    .map((p) => `${p.vault.id}:${p.userShares}`)
    .join(",");
  const vaultBalances = useMemo(() => {
    const map: Record<string, bigint> = {};
    for (const { vault, userShares } of vaultPositions) {
      map[vault.id] = userShares;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultBalancesKey]);
  const { positions: bearingYieldPositions, isLoading: bearingLoading } =
    useBearingYieldPositions(vaultPositions);
  const { data: etherfuseYields } = useEtherfuseYields();
  const yieldsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of etherfuseYields ?? []) {
      map[entry.symbol.toUpperCase()] = entry.apy;
    }
    return map;
  }, [etherfuseYields]);

  if (!hasWallet) return null;

  const hasPoolData = positions.length > 0;
  const hasVaultData = vaultPositions.length > 0;
  const hasBearingData = bearingYieldPositions.length > 0;
  const nothingYet =
    isLoading &&
    vaultLoading &&
    bearingLoading &&
    !hasPoolData &&
    !hasVaultData &&
    !hasBearingData;
  const allDone = !isLoading && !vaultLoading && !bearingLoading;
  const emptyState =
    allDone && !hasPoolData && !hasVaultData && !hasBearingData && !isError;

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-bold text-white">
          {t("title")}
        </h2>
      </div>

      {nothingYet ? (
        <div className="rounded-2xl bg-[#1C1C1C] border border-white/5 p-10 flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white/60" />
          <span className="text-white/40 text-sm">{t("loadingPositions")}</span>
        </div>
      ) : emptyState ? (
        <div className="rounded-2xl bg-[#1C1C1C] border border-white/5 p-10 text-center">
          <Layers className="h-8 w-8 text-white/20 mx-auto mb-3" />
          <p className="text-white font-semibold text-sm mb-1">
            {t("emptyTitle")}
          </p>
          <p className="text-white/40 text-xs mb-5">{t("emptySubtitle")}</p>
          <Link
            href="/pools"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2A2A2A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition-colors"
          >
            {t("explorePools")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {hasPoolData && <YourPositionsTable positions={positions} />}
          {isError && !hasPoolData && (
            <div className="rounded-2xl bg-[#1C1C1C] border border-white/5 p-8 text-center">
              <p className="text-white font-semibold text-sm mb-1">
                {t("poolsErrorTitle")}
              </p>
              <p className="text-white/40 text-xs mb-4">
                {t("poolsErrorSubtitle")}
              </p>
              <button
                onClick={refetch}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#2A2A2A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333] transition-colors"
              >
                {t("retry")}
              </button>
            </div>
          )}

          {hasVaultData && (
            <MyVaultPositions
              vaults={vaultViews}
              userBalances={vaultBalances}
            />
          )}

          {hasBearingData && (
            <BearingYieldTable
              positions={bearingYieldPositions}
              yieldsMap={yieldsMap}
            />
          )}
          {!allDone && <StillChecking />}
        </div>
      )}
    </div>
  );
};

export default YourPositions;
