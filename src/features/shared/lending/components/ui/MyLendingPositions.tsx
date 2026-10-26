"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Coins,
  Layers,
  TrendingUp,
  Shield,
  Zap,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useUserPositions } from "@/features/shared/positions/hooks/useUserPositions";
import { usePoolAction } from "@/lib/orchestrator";
import { ColHeader } from "./ColHeader";
import { getPoolTokenIcon } from "@/features/shared/pools/utils/poolTokenIcons";
import { getTokenIconFitClass } from "@/lib/helpers/tokenDisplay";
import { getAssetsConfig } from "@/lib/constants/assets.config";
import { safeParseFloat } from "@/lib/helpers/formatUtils";
import { atomicToDecimal } from "@neko-protocol/orchestrator";
import { stellarPriceService } from "@/lib/services/stellar-price.service";
import { BLEND_VAULT_ONLY_RESERVES } from "@/lib/orchestrator/adapters/blend-config";
import { useLocaleFormatter } from "@/lib/helpers/useLocaleFormatter";

const PROTOCOL_ICONS: Record<string, string> = {
  neko: "/neko-logo.png",
  aqua: "https://coin-images.coingecko.com/coins/images/20026/small/aqua-logo.png?1696519446",
  blend: "/assets/vault-creators/blend.png",
};

interface UnifiedPosition {
  key: string;
  protocolId: string;
  assetCode: string;
  poolName: string;
  depositedFormatted: string;
  depositedRaw: number;
  secondaryDepositedAmount?: string;
  secondaryAssetCode?: string;
  apy: string;
  /** orchestratorId for aggregated pools, undefined for Neko */
  orchestratorId?: string;
  detailId: string;
  hasEmissions?: boolean;
}

function PoolIcon({ assetCode }: { assetCode: string }) {
  const icon = getPoolTokenIcon({ type: "contract", code: assetCode });
  return (
    <div className="w-6 h-6 rounded-full bg-[#1a2a4a] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
      {icon ? (
        <Image
          src={icon}
          alt={assetCode}
          width={24}
          height={24}
          unoptimized
          className={getTokenIconFitClass(assetCode)}
        />
      ) : (
        <span className="text-white text-[9px] font-bold">{assetCode[0]}</span>
      )}
    </div>
  );
}

function PoolCell({
  assetCode,
  secondaryAssetCode,
}: {
  assetCode: string;
  secondaryAssetCode?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {secondaryAssetCode ? (
        <div className="relative h-6 w-10 shrink-0">
          <div className="absolute left-0 top-0">
            <PoolIcon assetCode={assetCode} />
          </div>
          <div className="absolute left-4 top-0">
            <PoolIcon assetCode={secondaryAssetCode} />
          </div>
        </div>
      ) : (
        <PoolIcon assetCode={assetCode} />
      )}
      <span className="text-white font-medium text-sm">
        {assetCode}
        {secondaryAssetCode ? (
          <span className="text-white/50"> / {secondaryAssetCode}</span>
        ) : null}
      </span>
    </div>
  );
}

function formatPositionAmount(amount: string, assetCode: string): string {
  return `${safeParseFloat(amount).toFixed(2)} ${assetCode}`;
}

const MyPositions: React.FC = () => {
  const t = useTranslations("sharedLending.positions");
  const { formatCurrency } = useLocaleFormatter();
  const router = useRouter();
  const { mutate: executePoolAction, isPending: isClaimPending } =
    usePoolAction();
  const [claimingPoolId, setClaimingPoolId] = useState<string | null>(null);

  const {
    positions: allPositions,
    isLoading: isLoadingAggregated,
    hasWallet,
  } = useUserPositions();

  const aggregatedPositions = allPositions.filter(
    (p) =>
      p.pool.type !== "neko" &&
      p.position.deposited > 0n &&
      !p.pool.tokens.some((t) => BLEND_VAULT_ONLY_RESERVES.has(t.address))
  );

  const isLoading = isLoadingAggregated;

  const aggUnified: UnifiedPosition[] = aggregatedPositions.map((pos) => {
    const withdrawUnit =
      pos.pool.type === "aqua"
        ? (pos.position.metadata?.withdrawUnit as
            | "underlying"
            | "lp_shares"
            | undefined)
        : undefined;
    const underlyingAmountsRaw = pos.position.metadata?.underlyingAmountsRaw as
      | string[]
      | undefined;
    const secondaryRaw =
      pos.pool.type === "aqua" && withdrawUnit === "underlying"
        ? underlyingAmountsRaw?.[1]
        : undefined;
    const secondaryDecimals = pos.pool.tokens[1]?.decimals ?? 7;
    const secondaryDepositedAmount =
      secondaryRaw != null
        ? atomicToDecimal(BigInt(secondaryRaw), secondaryDecimals)
        : undefined;
    const secondaryAssetCode =
      secondaryDepositedAmount != null ? pos.pool.tokens[1]?.code : undefined;
    return {
      key: `agg-${pos.pool.id}`,
      protocolId: pos.pool.type,
      assetCode: pos.pool.tokens[0]?.code ?? "?",
      poolName: pos.pool.name,
      depositedFormatted: formatPositionAmount(
        pos.position.depositedFormatted,
        pos.pool.tokens[0]?.code ?? ""
      ),
      depositedRaw: safeParseFloat(pos.position.depositedFormatted),
      secondaryDepositedAmount,
      secondaryAssetCode,
      apy: `${pos.pool.apy.toFixed(2)}%`,
      orchestratorId: pos.pool.id,
      detailId: pos.pool.id,
      hasEmissions: !!pos.pool.metadata?.hasEmissions,
    };
  });

  const unified = [...aggUnified];

  // ── USD prices for all unique asset codes ──────────────────────────────────
  const unifiedKeys = unified.map((p) => p.key).join(",");
  const allCodes = useMemo(
    () => [...new Set(unified.map((p) => p.assetCode))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unifiedKeys]
  );

  const priceQueries = useQueries({
    queries: allCodes.map((code) => ({
      queryKey: ["tokenPrice", code],
      queryFn: () => stellarPriceService.getPriceWithSource(code, ""),
      staleTime: 2 * 60_000,
      retry: 1,
      throwOnError: false,
    })),
  });

  const priceValuesKey = priceQueries.map((q) => q.data?.price).join(",");
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    allCodes.forEach((code, i) => {
      map.set(code, priceQueries[i]?.data?.price ?? 0);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCodes, priceValuesKey]);

  const colSpan = 6;

  function renderRow(pos: UnifiedPosition) {
    const logoSrc = PROTOCOL_ICONS[pos.protocolId];
    const openPosition = () => {
      router.push(`/pools/${encodeURIComponent(pos.detailId)}`);
    };
    const price = priceMap.get(pos.assetCode) ?? 0;
    const usdValue = pos.depositedRaw * price;
    const usdFormatted = usdValue > 0 ? formatCurrency(usdValue, "USD") : "—";
    return (
      <tr
        key={pos.key}
        role="link"
        tabIndex={0}
        onClick={openPosition}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPosition();
          }
        }}
        className="border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-white/[0.04]"
      >
        <td className="px-4 py-4 text-center">
          {logoSrc ? (
            <Image
              src={logoSrc}
              alt={pos.protocolId}
              width={24}
              height={24}
              unoptimized
              className="rounded-full object-cover w-6 h-6 mx-auto"
            />
          ) : (
            <span className="inline-flex w-6 h-6 rounded-full bg-white/10 items-center justify-center text-[9px] font-bold text-white mx-auto">
              {pos.protocolId.charAt(0).toUpperCase()}
            </span>
          )}
        </td>
        <td className="px-4 py-4">
          <PoolCell
            assetCode={pos.assetCode}
            secondaryAssetCode={pos.secondaryAssetCode}
          />
        </td>
        <td className="px-4 py-4 text-center text-sm tabular-nums">
          <div className="font-bold text-white">{pos.depositedFormatted}</div>
          {pos.secondaryDepositedAmount && pos.secondaryAssetCode && (
            <div className="mt-1 font-semibold text-white/65">
              {formatPositionAmount(
                pos.secondaryDepositedAmount,
                pos.secondaryAssetCode
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-4 text-center text-sm tabular-nums text-white/70">
          {usdFormatted}
        </td>
        <td className="px-4 py-4 text-center text-white text-sm">{pos.apy}</td>
        <td className="px-4 py-4 text-center">
          <div className="inline-flex items-center gap-2">
            {pos.hasEmissions && pos.orchestratorId && (
              <button
                disabled={
                  claimingPoolId === pos.orchestratorId && isClaimPending
                }
                onClick={(event) => {
                  event.stopPropagation();
                  setClaimingPoolId(pos.orchestratorId!);
                  const cfg = getAssetsConfig()[pos.assetCode];
                  const auditToken = cfg
                    ? {
                        address: cfg.contract,
                        code: cfg.code,
                        name: cfg.name,
                        decimals: cfg.decimals,
                      }
                    : {
                        address: "",
                        code: pos.assetCode,
                        name: pos.assetCode,
                        decimals: 7,
                      };
                  executePoolAction(
                    {
                      poolId: pos.orchestratorId!,
                      action: "claimRewards",
                      amount: 0n,
                      audit: {
                        tokens: [auditToken],
                        poolType: pos.protocolId as "blend" | "aqua" | "neko",
                        metadata: {},
                      },
                    },
                    { onSettled: () => setClaimingPoolId(null) }
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {claimingPoolId === pos.orchestratorId && isClaimPending
                  ? t("claiming")
                  : t("claim")}
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  if (!hasWallet) {
    return (
      <div className="w-full rounded-2xl bg-[#1C1C1C] border border-white/5 p-12 text-center">
        <Wallet className="h-8 w-8 text-white/20 mx-auto mb-3" />
        <p className="text-white/40 text-sm">{t("connectWalletMessage")}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-white/5 bg-[#1C1C1C]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-white/40 text-xs font-semibold uppercase tracking-wide">
          {t("title")}
        </span>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <ColHeader icon={Shield} label={t("headerProtocol")} centered />
            <ColHeader icon={Layers} label={t("headerPool")} />
            <ColHeader
              icon={Coins}
              label={t("headerDeposited")}
              tooltip={t("depositedTooltip")}
              centered
            />
            <ColHeader
              icon={DollarSign}
              label={t("headerValue")}
              tooltip={t("valueTooltip")}
              centered
            />
            <ColHeader
              icon={TrendingUp}
              label={t("headerApy")}
              tooltip={t("apyTooltip")}
              centered
            />
            <ColHeader icon={Zap} label={t("headerActions")} centered />
          </tr>
        </thead>
        <tbody>
          {isLoadingAggregated && aggUnified.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-12 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white/50" />
                  <span className="text-white/40 text-sm">
                    {t("loadingPositions")}
                  </span>
                </div>
              </td>
            </tr>
          ) : !isLoading && unified.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-4 py-12 text-center text-white/40 text-sm"
              >
                {t("noPositions")}
              </td>
            </tr>
          ) : (
            <>
              {aggUnified.map(renderRow)}
              {isLoadingAggregated && aggUnified.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/20 border-t-white/40" />
                      <span className="text-white/30 text-xs">
                        {t("loadingPositionsShort")}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default MyPositions;
