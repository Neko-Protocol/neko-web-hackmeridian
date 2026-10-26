"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/useToast";
import { TOAST_CONFIG } from "@/lib/constants/toast.config";
import { useApiErrorMessage } from "@/lib/helpers/useApiErrorMessage";
import {
  extractContractErrorOrNull,
  getGenericErrorCode,
} from "@neko-protocol/orchestrator";
import { usePools, usePoolAction } from "@/lib/orchestrator";
import type { PoolInfo } from "@/lib/orchestrator";
import { SUMMARY_DISPLAY_DECIMALS } from "@/lib/constants/display";
import { fromSmallestUnit } from "@neko-protocol/orchestrator";
import { decimalToAtomic } from "@neko-protocol/orchestrator";
import { formatLiquidity } from "@/lib/helpers/formatUtils";
import type { PoolData } from "../types/lending";
import {
  LENDING_PROTOCOL_LABELS,
  LENDING_PROTOCOL_ORDER,
} from "../constants/protocols";
import { auditService } from "@/lib/services/audit.service";

export function useLend() {
  const t = useTranslations("sharedLending.toasts");
  const getErrorMessage = useApiErrorMessage();
  const searchParams = useSearchParams();
  const supplyFromUrl = searchParams.get("supply")?.trim() ?? "";
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeposit, setIsDeposit] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolData | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [protocolFilter, setProtocolFilterState] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(supplyFromUrl);
  const [prevSupplyFromUrl, setPrevSupplyFromUrl] = useState(supplyFromUrl);

  if (supplyFromUrl !== prevSupplyFromUrl) {
    setPrevSupplyFromUrl(supplyFromUrl);
    if (supplyFromUrl) setSearchQuery(supplyFromUrl);
  }

  const { address } = useWallet();
  const { addNotification } = useToast();

  const showError = useCallback(
    (msg: string) =>
      addNotification(t("somethingWentWrong"), "error", {
        ...TOAST_CONFIG.defaultOpts,
        description: msg,
      }),
    [addNotification, t]
  );
  const showSuccess = useCallback(
    (msg: string) =>
      addNotification(t("success"), "success", {
        ...TOAST_CONFIG.defaultOpts,
        description: msg,
      }),
    [addNotification, t]
  );

  const {
    data: orchestratorPools = [],
    isLoading: isLoadingOrchestratorPools,
    isFetching: isFetchingOrchestratorPools,
    error: orchestratorPoolsError,
    refetch: refetchPools,
  } = usePools();

  const { mutateAsync: executePoolAction } = usePoolAction();

  const isLoadingPools = isLoadingOrchestratorPools;
  const isFetchingPools = isFetchingOrchestratorPools;
  const poolsError = orchestratorPoolsError;

  const pools: PoolData[] = useMemo(() => {
    return orchestratorPools
      .filter((p: PoolInfo) => p.supportedActions.includes("deposit"))
      .map((p: PoolInfo) => {
        const token = p.tokens[0];
        const decimals = token?.decimals ?? 7;
        const liquidityUsd = p.metadata?.liquidityUsd as string | undefined;
        const liquidity =
          liquidityUsd && parseFloat(liquidityUsd) > 0
            ? formatLiquidity(liquidityUsd, SUMMARY_DISPLAY_DECIMALS)
            : p.tvl > 0n
              ? formatLiquidity(
                  fromSmallestUnit(p.tvl.toString(), decimals),
                  SUMMARY_DISPLAY_DECIMALS
                )
              : "";
        const contractId = p.id.split(":")[1] ?? p.id;
        const canInteract = p.supportedActions.includes("deposit");

        let totalBorrowed: string | undefined;
        let liquidityTokenAmount: string | undefined;
        let liquidityTokenCode: string | undefined;
        let totalBorrowedTokenAmount: string | undefined;
        let borrowApy: string | undefined;
        if (p.type === "blend") {
          const liabRaw = String(
            (p.metadata?.totalLiabilities as string | undefined) ?? "0"
          );
          const liabTokens = fromSmallestUnit(liabRaw, decimals);
          totalBorrowed = formatLiquidity(liabTokens, SUMMARY_DISPLAY_DECIMALS);
          liquidityTokenAmount = fromSmallestUnit(p.tvl.toString(), decimals);
          liquidityTokenCode = token?.code;
          totalBorrowedTokenAmount = liabTokens;
          const bApy = (p.metadata?.borrowApy as number | undefined) ?? 0;
          borrowApy = `${bApy.toFixed(SUMMARY_DISPLAY_DECIMALS)}%`;
        }

        return {
          id: `agg-${p.id}`,
          protocolId: p.type,
          name: p.name,
          token1: token?.code ?? "?",
          token2: p.tokens[1]?.code ?? (canInteract ? "Lending" : ""),
          fee: "0%",
          roi:
            p.apy > 0 ? `${p.apy.toFixed(SUMMARY_DISPLAY_DECIMALS)}%` : "0.00%",
          feeApy:
            p.apy > 0 ? `${p.apy.toFixed(SUMMARY_DISPLAY_DECIMALS)}%` : "0.00%",
          liquidity,
          isActive: p.state === "active",
          assetCode: token?.code ?? "?",
          asset: token?.address ?? "",
          assetDecimals: decimals,
          bTokenRate: undefined,
          totalBorrowed,
          liquidityTokenAmount,
          liquidityTokenCode,
          totalBorrowedTokenAmount,
          borrowApy,
          contractId,
          isAggregated: true,
          orchestratorId: canInteract ? p.id : undefined,
          hideRowActions: !canInteract,
        };
      });
  }, [orchestratorPools]);

  const protocolOptions = useMemo(() => {
    const ids = new Set(pools.map((p) => p.protocolId));
    const order = LENDING_PROTOCOL_ORDER as readonly string[];
    const known = order
      .filter((id) => ids.has(id))
      .map((id) => ({ id, label: LENDING_PROTOCOL_LABELS[id] ?? id }));
    const unknown = [...ids].filter((id) => !order.includes(id));
    const extras = unknown.map((id) => ({
      id,
      label: LENDING_PROTOCOL_LABELS[id] ?? id,
    }));
    return [...known, ...extras];
  }, [pools]);

  const filteredPools = useMemo(() => {
    let result =
      protocolFilter === "all"
        ? pools
        : pools.filter((p) => p.protocolId === protocolFilter);
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.token1.toLowerCase().includes(q) ||
          p.token2.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pools, protocolFilter, searchQuery]);

  const totalRows = filteredPools.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const paginatedPools = filteredPools.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  const setProtocolFilter = useCallback((id: string) => {
    setProtocolFilterState(id);
    setPage(0);
  }, []);

  const handleSetSearchQuery = useCallback((q: string) => {
    setSearchQuery(q);
    setPage(0);
  }, []);

  const changeRowsPerPage = useCallback((value: number) => {
    setRowsPerPage(value);
    setPage(0);
  }, []);

  const openModal = useCallback((pool: PoolData, deposit: boolean) => {
    setSelectedPool(pool);
    setIsDeposit(deposit);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleConfirm = useCallback(
    async (amount: string) => {
      if (!selectedPool || !address || !amount || parseFloat(amount) <= 0)
        return;
      if (!selectedPool.orchestratorId) return;

      setIsLoading(true);

      try {
        const decimals = selectedPool.assetDecimals ?? 7;
        const rawAmount = decimalToAtomic(amount, decimals);
        const depositedRaw =
          selectedPool.depositedRaw != null
            ? BigInt(selectedPool.depositedRaw)
            : null;
        const isWithdrawAll =
          !isDeposit && depositedRaw != null && rawAmount >= depositedRaw;

        const txHash = await executePoolAction({
          poolId: selectedPool.orchestratorId,
          action: isDeposit
            ? "deposit"
            : (selectedPool.withdrawAction ?? "withdraw"),
          amount: rawAmount,
          withdrawAll: isWithdrawAll,
          withdrawUnit: selectedPool.withdrawUnit,
        });

        auditService.log({
          wallet_address: address,
          action_type: isDeposit ? "lend_deposit" : "lend_withdraw",
          asset_in: isDeposit ? selectedPool.assetCode : undefined,
          asset_out: isDeposit ? undefined : selectedPool.assetCode,
          token_amount_in: isDeposit ? parseFloat(amount) : undefined,
          amount_out: isDeposit ? undefined : parseFloat(amount),
          pool_id: selectedPool.orchestratorId,
          tx_hash: txHash,
        });

        await refetchPools();
        showSuccess(
          isDeposit
            ? t("depositSuccess", {
                amount,
                symbol: selectedPool.assetCode,
              })
            : t("withdrawSuccess", {
                amount,
                symbol: selectedPool.assetCode,
              })
        );
        closeModal();
      } catch (err) {
        const errorCode = getGenericErrorCode(err);
        showError(
          errorCode
            ? getErrorMessage(errorCode)
            : (extractContractErrorOrNull(err) ?? t("unexpectedError"))
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      selectedPool,
      address,
      isDeposit,
      executePoolAction,
      refetchPools,
      closeModal,
      showError,
      showSuccess,
      getErrorMessage,
      t,
    ]
  );

  return {
    pools,
    paginatedPools,
    isLoadingPools,
    isFetchingPools,
    poolsError,
    protocolFilter,
    setProtocolFilter,
    protocolOptions,
    page,
    totalRows,
    totalPages,
    rowsPerPage,
    setPage,
    changeRowsPerPage,
    selectedPool,
    isModalOpen,
    isDeposit,
    isLoading,
    bTokenBalance: null as string | null,
    isLoadingBalance: false,
    hasWallet: !!address,
    openModal,
    closeModal,
    handleConfirm,
    refreshBalance: () => Promise.resolve(),
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
  };
}
