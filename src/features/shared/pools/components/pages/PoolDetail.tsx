"use client";

import React, { useMemo, useState, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  orchestrator,
  useUserPosition,
  usePoolAction,
  usePools,
} from "@/lib/orchestrator";
import { fromSmallestUnit, toSmallestUnit } from "@neko-protocol/orchestrator";
import {
  atomicToDecimal,
  decimalToAtomic,
  reserveStroopsFromApiString,
} from "@neko-protocol/orchestrator";
import type { PoolAction, PoolInfo } from "@/lib/orchestrator";
import { useWallet } from "@/hooks/useWallet";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { usePoolDetail } from "@/features/shared/pools/hooks/usePoolDetail";
import {
  PoolDetailLayout,
  PoolDetailSkeleton,
  type PoolDetailPanelPool,
  type CollateralOption,
} from "../ui/PoolDetailPanel";
import {
  formatAmount,
  formatLiquidity,
  safeParseFloat,
} from "@/lib/helpers/formatUtils";
import { getPoolTokenIcon } from "../../utils/poolTokenIcons";
import { ensureTrustlineForSAC } from "@/lib/helpers/stellar/trustline";
import { spendableNativeStroops } from "@/lib/helpers/stellar/stellarAccountReserve";

function calculateBorrowLimit(
  collateralAmount: number,
  collateralFactorPct: number
): number {
  if (!Number.isFinite(collateralAmount) || collateralAmount <= 0) return 0;
  return collateralAmount * (collateralFactorPct / 100);
}
import { useToast } from "@/hooks/useToast";
import { isUserCancellationError } from "@neko-protocol/orchestrator";
import { useFxRate } from "@/hooks/useFxRate";
import { useCurrencyStore } from "@/stores/currency.store";
import { convertUsdToSelected, formatCurrency } from "@/lib/helpers/currency";

interface PoolDetailProps {
  params: Promise<{ contractid: string }>;
}

const ISSUER_LABEL_KEYS: Record<string, string> = {
  blend: "issuerBlend",
  neko: "issuerNeko",
  aqua: "issuerAqua",
};

const ISSUER_ICONS: Record<string, string> = {
  blend: "/assets/vault-creators/blend.png",
  neko: "/logo.svg",
  aqua: "https://coin-images.coingecko.com/coins/images/20026/small/aqua-logo.png?1696519446",
};

const PoolDetail: React.FC<PoolDetailProps> = ({ params }) => {
  const { contractid: rawId } = use(params);
  const contractid = decodeURIComponent(rawId);
  const t = useTranslations("sharedPools.detail");
  const tPanel = useTranslations("sharedPools.panel");
  const tErrors = useTranslations("sharedPools.errors");

  const {
    address,
    nativeBalanceStroops,
    subentryCount,
    refetchBalances,
    signTransaction,
  } = useWallet();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab") === "borrow" ? "borrow" : "lend";

  const { data: pool, isLoading, error } = usePoolDetail(contractid);
  const { data: position } = useUserPosition(contractid, address);
  const { balance: token1Balance } = useTokenBalance(pool?.tokens[0]?.address);
  const { balance: token2Balance } = useTokenBalance(pool?.tokens[1]?.address);

  const primaryTokenCode = pool?.tokens[0]?.code;
  const { price: primaryTokenPrice } = useTokenPrice(primaryTokenCode);
  const selectedCurrency = useCurrencyStore((state) => state.selectedCurrency);
  const { rate: fxRate } = useFxRate({ currency: selectedCurrency });

  // Sibling reserves in the same Blend pool contract (used as collateral options)
  const { data: allPools = [] } = usePools();
  const blendPoolContractId =
    pool?.type === "blend"
      ? (pool.metadata?.poolContractId as string | undefined)
      : undefined;

  const collateralOptions = useMemo<CollateralOption[]>(() => {
    if (!blendPoolContractId) return [];
    return allPools
      .filter(
        (p: PoolInfo) =>
          p.type === "blend" &&
          (p.metadata?.poolContractId as string) === blendPoolContractId &&
          p.id !== contractid
      )
      .map((p: PoolInfo) => ({
        symbol: p.tokens[0]?.code ?? "?",
        address: p.tokens[0]?.address ?? "",
        poolId: p.id,
        decimals: p.tokens[0]?.decimals ?? 7,
        cFactor: (p.metadata?.cFactor as number) ?? 0,
        userBalance: "0", // updated below via useUserPosition per sibling pool
      }));
  }, [allPools, blendPoolContractId, contractid]);

  // Fetch user's deposited position in each sibling pool (up to 3 siblings typical)
  const collateralPosition0 = useUserPosition(
    collateralOptions[0]?.poolId,
    address
  );
  const collateralPosition1 = useUserPosition(
    collateralOptions[1]?.poolId,
    address
  );
  const collateralPosition2 = useUserPosition(
    collateralOptions[2]?.poolId,
    address
  );

  const { balance: collateralWallet0 } = useTokenBalance(
    collateralOptions[0]?.address
  );
  const { balance: collateralWallet1 } = useTokenBalance(
    collateralOptions[1]?.address
  );
  const { balance: collateralWallet2 } = useTokenBalance(
    collateralOptions[2]?.address
  );

  const collateralOptionsWithBalances = useMemo<CollateralOption[]>(() => {
    const deposited = [
      collateralPosition0.data?.depositedFormatted ?? "0",
      collateralPosition1.data?.depositedFormatted ?? "0",
      collateralPosition2.data?.depositedFormatted ?? "0",
    ];
    const wallets = [collateralWallet0, collateralWallet1, collateralWallet2];
    return collateralOptions.map((opt, i) => ({
      ...opt,
      userBalance: deposited[i] ?? "0",
      walletBalance: wallets[i],
    }));
  }, [
    collateralOptions,
    collateralPosition0.data,
    collateralPosition1.data,
    collateralPosition2.data,
    collateralWallet0,
    collateralWallet1,
    collateralWallet2,
  ]);

  const { mutateAsync: executePoolAction, isPending: isActionPending } =
    usePoolAction();
  const { addNotification } = useToast();
  const [isBorrowWithCollateralPending, setIsBorrowWithCollateralPending] =
    useState(false);

  const supportedActions = useMemo(
    () =>
      pool
        ? pool.supportedActions.filter((a: PoolAction) =>
            orchestrator.supportsAction(contractid, a)
          )
        : [],
    [contractid, pool]
  );

  const isLendingPool = pool?.type === "blend" || pool?.type === "neko";

  const { canLend, lendAction, canBorrow, canRemoveOrWithdraw } =
    useMemo(() => {
      if (!pool) {
        return {
          canLend: false,
          lendAction: "deposit" as PoolAction,
          canBorrow: false,
          canRemoveOrWithdraw: false,
        };
      }
      const dep = supportedActions.includes("deposit");
      const sc = supportedActions.includes("supplyCollateral");
      const canL = dep || sc;
      const lAct: PoolAction = dep ? "deposit" : "supplyCollateral";
      const canB = supportedActions.includes("borrow");
      const canR = supportedActions.includes("withdraw");
      return {
        canLend: canL,
        lendAction: lAct,
        canBorrow: canB,
        canRemoveOrWithdraw: canR,
      };
    }, [pool, supportedActions]);

  /** AMM / Neko-style: deposit + withdraw, no protocol borrow */
  const isAmmPairPool = pool?.type === "aqua";
  const depositWithdrawMode =
    !!pool && canLend && !canBorrow && (canRemoveOrWithdraw || isAmmPairPool);

  const [ammTab, setAmmTab] = useState<"deposit" | "withdraw">("deposit");
  const [ammAmount, setAmmAmount] = useState("");
  const [ammAmount2, setAmmAmount2] = useState("");
  const [ammInputTokenIndex, setAmmInputTokenIndex] = useState<0 | 1>(0);

  const handleAmmTabChange = useCallback((t: "deposit" | "withdraw") => {
    setAmmTab(t);
    setAmmAmount("");
    setAmmAmount2("");
    setAmmInputTokenIndex(0);
  }, []);

  const handleAmmAmountChange = useCallback((value: string) => {
    setAmmInputTokenIndex(0);
    setAmmAmount(value);
  }, []);

  const handleAmmAmount2Change = useCallback((value: string) => {
    setAmmInputTokenIndex(1);
    setAmmAmount2(value);
  }, []);

  const isAmmPairDeposit = !!pool && isAmmPairPool && ammTab === "deposit";

  const decimals = pool?.tokens[0]?.decimals ?? 7;

  const spendableXlmStroops = useMemo(
    () => spendableNativeStroops(nativeBalanceStroops, subentryCount),
    [nativeBalanceStroops, subentryCount]
  );

  const token1AvailableBalance = useMemo(() => {
    if (!pool) return token1Balance ?? "0";
    const d1 = pool.tokens[0]?.decimals ?? 7;
    return pool.tokens[0]?.code === "XLM"
      ? atomicToDecimal(spendableXlmStroops, d1)
      : (token1Balance ?? "0");
  }, [pool, spendableXlmStroops, token1Balance]);

  const token2AvailableBalance = useMemo(() => {
    if (!pool) return token2Balance ?? "0";
    const d2 = pool.tokens[1]?.decimals ?? 7;
    return pool.tokens[1]?.code === "XLM"
      ? atomicToDecimal(spendableXlmStroops, d2)
      : (token2Balance ?? "0");
  }, [pool, spendableXlmStroops, token2Balance]);

  const pairReserves = useMemo(() => {
    if (!pool || !isAmmPairPool || pool.tokens.length < 2) return null;
    const reserveA =
      pool.type === "aqua"
        ? reserveStroopsFromApiString(
            ((pool.metadata.reserves as string[] | undefined) ?? [])[0] ?? "0"
          )
        : reserveStroopsFromApiString(String(pool.metadata.reserveA ?? "0"));
    const reserveB =
      pool.type === "aqua"
        ? reserveStroopsFromApiString(
            ((pool.metadata.reserves as string[] | undefined) ?? [])[1] ?? "0"
          )
        : reserveStroopsFromApiString(String(pool.metadata.reserveB ?? "0"));
    if (reserveA <= 0n || reserveB <= 0n) return null;
    return { reserveA, reserveB };
  }, [pool, isAmmPairPool]);

  const requiredSecondLegFormatted = useMemo(() => {
    if (
      !pool ||
      !isAmmPairPool ||
      ammTab !== "deposit" ||
      !ammAmount ||
      !pairReserves
    ) {
      return null;
    }
    const n = parseFloat(ammAmount);
    if (isNaN(n) || n <= 0) return null;
    const amountA = decimalToAtomic(ammAmount, decimals);
    const amtB =
      pool.type === "aqua"
        ? (amountA * pairReserves.reserveB * 101n) /
          (pairReserves.reserveA * 100n)
        : (amountA * pairReserves.reserveB) / pairReserves.reserveA;
    const d2 = pool.tokens[1]?.decimals ?? 7;
    return fromSmallestUnit(amtB.toString(), d2);
  }, [pool, isAmmPairPool, ammTab, ammAmount, decimals, pairReserves]);

  const requiredFirstLegFormatted = useMemo(() => {
    if (
      !pool ||
      !isAmmPairPool ||
      ammTab !== "deposit" ||
      !ammAmount2 ||
      !pairReserves
    ) {
      return null;
    }
    const n = parseFloat(ammAmount2);
    if (isNaN(n) || n <= 0) return null;
    const d2 = pool.tokens[1]?.decimals ?? 7;
    const amountB = decimalToAtomic(ammAmount2, d2);
    const amtA =
      pool.type === "aqua"
        ? (amountB * pairReserves.reserveA * 100n) /
          (pairReserves.reserveB * 101n)
        : (amountB * pairReserves.reserveA) / pairReserves.reserveB;
    return fromSmallestUnit(amtA.toString(), decimals);
  }, [pool, isAmmPairPool, ammTab, ammAmount2, decimals, pairReserves]);

  const maxAmmDepositAmount = useMemo(() => {
    if (!pool || !isAmmPairPool) return token1AvailableBalance;
    if (!pairReserves || pool.tokens.length < 2) return token1AvailableBalance;

    const d1 = pool.tokens[0]?.decimals ?? 7;
    const d2 = pool.tokens[1]?.decimals ?? 7;

    const t1MaxStroops = decimalToAtomic(token1AvailableBalance, d1);

    const t2BalStroops = decimalToAtomic(token2AvailableBalance, d2);

    const maxT1FromT2Stroops =
      pool.type === "aqua"
        ? (t2BalStroops * pairReserves.reserveA * 100n) /
          (pairReserves.reserveB * 101n)
        : (t2BalStroops * pairReserves.reserveA) / pairReserves.reserveB;
    const limitingStroops =
      t1MaxStroops < maxT1FromT2Stroops ? t1MaxStroops : maxT1FromT2Stroops;

    return fromSmallestUnit(limitingStroops.toString(), d1);
  }, [
    pool,
    isAmmPairPool,
    pairReserves,
    token1AvailableBalance,
    token2AvailableBalance,
  ]);

  const maxAmmDepositAmount2 = useMemo(() => {
    if (!pool || !isAmmPairPool || !pairReserves || pool.tokens.length < 2) {
      return token2AvailableBalance;
    }

    const d1 = pool.tokens[0]?.decimals ?? 7;
    const d2 = pool.tokens[1]?.decimals ?? 7;
    const t1BalStroops = decimalToAtomic(token1AvailableBalance, d1);
    const t2MaxStroops = decimalToAtomic(token2AvailableBalance, d2);

    const maxT2FromT1Stroops =
      pool.type === "aqua"
        ? (t1BalStroops * pairReserves.reserveB * 101n) /
          (pairReserves.reserveA * 100n)
        : (t1BalStroops * pairReserves.reserveB) / pairReserves.reserveA;
    const limitingStroops =
      t2MaxStroops < maxT2FromT1Stroops ? t2MaxStroops : maxT2FromT1Stroops;

    return fromSmallestUnit(limitingStroops.toString(), d2);
  }, [
    pool,
    isAmmPairPool,
    pairReserves,
    token1AvailableBalance,
    token2AvailableBalance,
  ]);

  const displayedAmmAmount =
    ammInputTokenIndex === 0 ? ammAmount : (requiredFirstLegFormatted ?? "");
  const displayedAmmAmount2 =
    ammInputTokenIndex === 1 ? ammAmount2 : (requiredSecondLegFormatted ?? "");

  const firstLegDepositAmount =
    ammInputTokenIndex === 0 ? ammAmount : (requiredFirstLegFormatted ?? "");
  const secondLegDepositAmount =
    ammInputTokenIndex === 1 ? ammAmount2 : (requiredSecondLegFormatted ?? "");

  const firstLegDepositRaw = useMemo(() => {
    if (!firstLegDepositAmount) return null;
    try {
      return decimalToAtomic(firstLegDepositAmount, decimals);
    } catch {
      return null;
    }
  }, [firstLegDepositAmount, decimals]);

  const secondLegDepositRaw = useMemo(() => {
    if (!pool || !secondLegDepositAmount || pool.tokens.length < 2) return null;
    try {
      return decimalToAtomic(
        secondLegDepositAmount,
        pool.tokens[1]?.decimals ?? 7
      );
    } catch {
      return null;
    }
  }, [pool, secondLegDepositAmount]);

  const secondTokenInsufficient =
    isAmmPairDeposit &&
    pool &&
    pool.tokens.length >= 2 &&
    secondLegDepositRaw != null &&
    secondLegDepositRaw >
      decimalToAtomic(token2AvailableBalance, pool.tokens[1]?.decimals ?? 7);

  const refetchAfterTx = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: ["orchestrator", "pool", contractid],
      }),
      address
        ? queryClient.refetchQueries({
            queryKey: ["orchestrator", "position", contractid, address],
          })
        : Promise.resolve(),
      address
        ? queryClient.refetchQueries({
            queryKey: ["balances", address],
          })
        : Promise.resolve(),
      queryClient.refetchQueries({ queryKey: ["tokenBalance"] }),
    ]);
    await refetchBalances();
  }, [queryClient, contractid, address, refetchBalances]);

  const runPoolAction = useCallback(
    async (
      action: PoolAction,
      amount: bigint,
      extras?: { collateralAssetAddress?: string; collateralAmount?: bigint }
    ) => {
      if (!pool) return;
      await executePoolAction({
        poolId: contractid,
        action,
        amount,
        tokenIndex: 0,
        ...extras,
        audit: {
          tokens: pool.tokens,
          poolType: pool.type,
          metadata: pool.metadata,
        },
      });
      await refetchAfterTx();
    },
    [contractid, executePoolAction, refetchAfterTx, pool]
  );

  const ammFirstLegDepositInsufficient = useMemo(() => {
    if (
      ammTab !== "deposit" ||
      !depositWithdrawMode ||
      firstLegDepositRaw == null ||
      firstLegDepositRaw <= 0n
    ) {
      return false;
    }
    const maxToken0 = decimalToAtomic(
      token1AvailableBalance,
      pool?.tokens[0]?.decimals ?? 7
    );
    return firstLegDepositRaw > maxToken0;
  }, [
    ammTab,
    depositWithdrawMode,
    firstLegDepositRaw,
    pool?.tokens,
    token1AvailableBalance,
  ]);

  const withdrawableRaw = useMemo(() => {
    if (!position) return 0n;
    if (pool?.type === "blend") {
      return BigInt(String(position.metadata?.supplied ?? "0"));
    }
    return position.deposited;
  }, [pool?.type, position]);

  const withdrawableFormatted = useMemo(
    () => atomicToDecimal(withdrawableRaw, decimals),
    [withdrawableRaw, decimals]
  );

  const secondaryUnderlyingAmountsRaw = position?.metadata
    ?.underlyingAmountsRaw as string[] | undefined;
  const secondaryWithdrawableRaw =
    position && isAmmPairPool
      ? BigInt(secondaryUnderlyingAmountsRaw?.[1] ?? "0")
      : 0n;

  const secondaryDecimals = pool?.tokens[1]?.decimals ?? 7;
  const secondaryWithdrawableFormatted = useMemo(
    () => atomicToDecimal(secondaryWithdrawableRaw, secondaryDecimals),
    [secondaryWithdrawableRaw, secondaryDecimals]
  );

  const ammWithdrawInsufficient = useMemo(() => {
    if (ammTab !== "withdraw" || !depositWithdrawMode || !ammAmount) {
      return false;
    }
    const n = parseFloat(ammAmount);
    if (isNaN(n) || n <= 0) return false;
    const max = parseFloat(withdrawableFormatted);
    return n > max + 1e-10;
  }, [ammTab, depositWithdrawMode, ammAmount, withdrawableFormatted]);

  const ammInsufficientFunds = useMemo(() => {
    if (ammTab === "withdraw") return ammWithdrawInsufficient;
    return ammFirstLegDepositInsufficient || secondTokenInsufficient;
  }, [
    ammTab,
    ammFirstLegDepositInsufficient,
    ammWithdrawInsufficient,
    secondTokenInsufficient,
  ]);

  const handleAmmSubmit = useCallback(async () => {
    if (!pool || !address) return;
    const submitAmount =
      ammTab === "deposit" ? firstLegDepositAmount : ammAmount;
    const num = parseFloat(submitAmount);
    if (isNaN(num) || num <= 0) return;
    if (ammInsufficientFunds) return;

    const amountBigInt =
      ammTab === "deposit" && firstLegDepositRaw != null
        ? firstLegDepositRaw
        : decimalToAtomic(submitAmount, decimals);
    if (amountBigInt <= 0n) return;

    const action: PoolAction = ammTab === "deposit" ? "deposit" : "withdraw";
    const withdrawUnit =
      action === "withdraw" && pool.type === "aqua"
        ? (position?.metadata?.withdrawUnit as
            | "underlying"
            | "lp_shares"
            | undefined)
        : undefined;
    await executePoolAction({
      poolId: contractid,
      action,
      amount: amountBigInt,
      tokenIndex: 0,
      withdrawAll:
        action === "withdraw" &&
        withdrawableRaw > 0n &&
        amountBigInt >= withdrawableRaw,
      withdrawUnit,
      audit: pool
        ? {
            tokens: pool.tokens,
            poolType: pool.type,
            metadata: pool.metadata,
          }
        : undefined,
    });
    setAmmAmount("");
    setAmmAmount2("");
    setAmmInputTokenIndex(0);
    await refetchAfterTx();
  }, [
    pool,
    address,
    ammAmount,
    firstLegDepositAmount,
    firstLegDepositRaw,
    decimals,
    ammTab,
    ammInsufficientFunds,
    contractid,
    executePoolAction,
    refetchAfterTx,
    withdrawableRaw,
    position?.metadata,
  ]);

  const handleLendOnlySubmit = useCallback(
    async (supplyAmount: string) => {
      if (!address) return;
      const n = parseFloat(supplyAmount);
      if (isNaN(n) || n <= 0) return;
      if (n > parseFloat(token1Balance ?? "0") + 1e-10) {
        addNotification(tErrors("insufficientBalanceDeposit"), "error");
        return;
      }
      const amountBigInt = decimalToAtomic(supplyAmount, decimals);
      await runPoolAction(lendAction, amountBigInt);
    },
    [
      address,
      decimals,
      lendAction,
      runPoolAction,
      token1Balance,
      addNotification,
      tErrors,
    ]
  );

  const handleWithdrawOnlySubmit = useCallback(
    async (withdrawAmount: string) => {
      if (!address || !pool) return;
      const n = parseFloat(withdrawAmount);
      if (isNaN(n) || n <= 0) return;
      const amountBigInt = decimalToAtomic(withdrawAmount, decimals);
      if (withdrawableRaw <= 0n) {
        addNotification(tErrors("noSuppliedBalance"), "error");
        return;
      }
      if (amountBigInt > withdrawableRaw) {
        addNotification(tErrors("insufficientSuppliedBalance"), "error");
        return;
      }
      await executePoolAction({
        poolId: contractid,
        action: "withdraw",
        amount: amountBigInt,
        withdrawAll: amountBigInt >= withdrawableRaw,
        audit: {
          tokens: pool.tokens,
          poolType: pool.type,
          metadata: pool.metadata,
        },
      });
      await refetchAfterTx();
    },
    [
      address,
      pool,
      decimals,
      withdrawableRaw,
      executePoolAction,
      contractid,
      refetchAfterTx,
      addNotification,
      tErrors,
    ]
  );

  const handleBorrowingSubmit = useCallback(
    async (
      borrowAmount: string,
      collateralAssetAddress: string,
      collateralAmt: string
    ) => {
      if (!address || !signTransaction) return;
      const b = parseFloat(borrowAmount);
      if (isNaN(b) || b <= 0) return;

      const borrowTokenAddress = pool?.tokens[0]?.address;
      const borrowTokenCode = pool?.tokens[0]?.code;
      if (borrowTokenAddress && borrowTokenCode) {
        try {
          await ensureTrustlineForSAC(
            borrowTokenAddress,
            borrowTokenCode,
            address,
            signTransaction
          );
        } catch (err) {
          if (isUserCancellationError(err)) return;
          const msg =
            err instanceof Error
              ? err.message
              : tErrors("trustlineFailedGeneric");
          addNotification(
            tErrors("trustlineSetupFailed", { message: msg }),
            "error"
          );
          return;
        }
      }
      const bDec = pool?.tokens[0]?.decimals ?? 7;
      const borrowBigInt = BigInt(toSmallestUnit(borrowAmount, bDec));

      const cNum = parseFloat(collateralAmt);
      const hasCollateral =
        !!collateralAssetAddress && !isNaN(cNum) && cNum > 0;

      if (hasCollateral) {
        const collateralOption = collateralOptionsWithBalances.find(
          (o) => o.address === collateralAssetAddress
        );
        const cDec = collateralOption?.decimals ?? 7;
        const collateralBigInt = BigInt(toSmallestUnit(collateralAmt, cDec));

        setIsBorrowWithCollateralPending(true);
        try {
          await runPoolAction("borrowWithCollateral", borrowBigInt, {
            collateralAssetAddress,
            collateralAmount: collateralBigInt,
          });
        } finally {
          setIsBorrowWithCollateralPending(false);
        }
        return;
      }

      await runPoolAction("borrow", borrowBigInt);
    },
    [
      address,
      signTransaction,
      pool,
      contractid,
      collateralOptionsWithBalances,
      runPoolAction,
      refetchAfterTx,
      addNotification,
      tErrors,
    ]
  );

  const activeAmmInputAmount =
    ammInputTokenIndex === 0 ? ammAmount : ammAmount2;

  const ammSubmitDisabled =
    isActionPending ||
    !address ||
    !activeAmmInputAmount ||
    parseFloat(activeAmmInputAmount) <= 0 ||
    (ammTab === "deposit" &&
      (firstLegDepositRaw == null || firstLegDepositRaw <= 0n)) ||
    ammInsufficientFunds;

  const ammInsufficientFundsMessage = useMemo(() => {
    if (
      !depositWithdrawMode ||
      isActionPending ||
      !activeAmmInputAmount ||
      parseFloat(activeAmmInputAmount) <= 0
    ) {
      return null;
    }
    if (!ammInsufficientFunds) return null;
    if (ammTab === "withdraw") {
      return tErrors("insufficientPoolPosition");
    }
    const missingAssets = [
      ammFirstLegDepositInsufficient ? pool?.tokens[0]?.code : null,
      secondTokenInsufficient ? pool?.tokens[1]?.code : null,
    ]
      .filter((symbol): symbol is string => Boolean(symbol))
      .map((symbol) => (symbol === "XLM" ? tErrors("spendableXlm") : symbol));

    if (missingAssets.length > 0) {
      return tErrors("insufficientAssetsBalance", {
        assets: missingAssets.join(` ${tErrors("andJoiner")} `),
      });
    }
    return tErrors("insufficientFunds");
  }, [
    depositWithdrawMode,
    isActionPending,
    activeAmmInputAmount,
    ammInsufficientFunds,
    ammTab,
    ammFirstLegDepositInsufficient,
    secondTokenInsufficient,
    pool?.tokens,
    tErrors,
  ]);

  const panelPool = useMemo<PoolDetailPanelPool | null>(() => {
    if (!pool) return null;

    const t1 = pool.tokens[0];
    const t2 = pool.tokens[1] ?? t1;
    const d = t1?.decimals ?? 7;

    const tvlRaw = fromSmallestUnit(pool.tvl.toString(), d);
    const tvlNum = parseFloat(tvlRaw);

    const liabilitiesStr = position?.metadata?.liabilities
      ? String(position.metadata.liabilities)
      : "0";
    const totalLiabilities = parseFloat(
      fromSmallestUnit(
        (pool.metadata.totalLiabilities as string | undefined) ?? "0",
        d
      )
    );
    const availableLiquidityNum = Math.max(0, tvlNum - totalLiabilities);

    const cFactor = (pool.metadata.cFactor as number | undefined) ?? 0;
    const liquidationLtv = Math.round(cFactor * 100);

    const collateralRaw =
      position?.metadata?.collateral &&
      String(position.metadata.collateral) !== "0"
        ? fromSmallestUnit(String(position.metadata.collateral), d)
        : formatAmount(0);

    const collateralNum = parseFloat(collateralRaw);
    const borrowLimitNum =
      collateralNum > 0
        ? Math.min(
            calculateBorrowLimit(collateralNum, liquidationLtv),
            availableLiquidityNum
          )
        : 0;
    const borrowLimit =
      borrowLimitNum > 0 ? formatAmount(borrowLimitNum) : undefined;

    const loanRaw =
      liabilitiesStr !== "0"
        ? fromSmallestUnit(liabilitiesStr, d)
        : formatAmount(0);

    const supplyApyFromMeta =
      (pool.metadata.supplyApy as number | undefined) ?? pool.apy;
    const borrowApy = (pool.metadata.borrowApy as number | undefined) ?? 0;

    const isAqua = pool.type === "aqua";
    const isPairAmm = isAqua;
    const liquidityUsd = String(
      (pool.metadata.liquidityUsd as string | undefined) ?? "0"
    );
    const reserveList = isAqua
      ? ((pool.metadata.reserves as string[] | undefined) ?? [])
      : [];

    let totalLiquidity: string;
    let totalLiquidityRaw: string | undefined;
    let totalBorrowedStat: string | undefined;
    let totalBorrowedStatRaw: string | undefined;
    let supplyApyDisplay: string;
    let supplyApySub: string | undefined;
    let borrowApyLabel: string | undefined;
    let poolTypeLabel: string | undefined;
    let poolTypeDetail: string | undefined;
    let oraclePrice: string | undefined;
    let utilization: string | undefined;

    if (isPairAmm) {
      const usd = safeParseFloat(liquidityUsd);
      totalLiquidity =
        isAqua && usd > 0
          ? formatLiquidity(usd, 2)
          : formatLiquidity(availableLiquidityNum.toString(), 2);
      totalLiquidityRaw = pool.tokens
        .map((t, i) => {
          const r = reserveList[i] ?? "0";
          const dec = t.decimals ?? 7;
          const amt = fromSmallestUnit(
            reserveStroopsFromApiString(r).toString(),
            dec
          );
          return `${formatAmount(amt, 2)} ${t.code ?? ""}`.trim();
        })
        .filter(Boolean)
        .join(" · ");

      const baseSup = (pool.metadata.supplyApy as number | undefined) ?? 0;
      const rewards = (pool.metadata.rewardsApy as number | undefined) ?? 0;
      const totalApy = pool.apy;
      supplyApyDisplay = `${Number.isFinite(totalApy) ? totalApy.toFixed(2) : "0.00"}%`;
      if (rewards > 0.0001) {
        supplyApySub = t("baseRewards", {
          base: baseSup.toFixed(2),
          rewards: rewards.toFixed(2),
        });
      }
      const aquaPoolType = pool.metadata.aquaPoolType as string | undefined;
      if (aquaPoolType === "stable_swap" || aquaPoolType === "stable") {
        poolTypeLabel = t("stableSwap");
        const amp = pool.metadata.amplificationFactor as
          | number
          | null
          | undefined;
        if (amp != null) poolTypeDetail = t("amplification", { amp });
      } else if (aquaPoolType === "constant_product") {
        poolTypeLabel = t("constantProduct");
      }
      if (primaryTokenPrice > 0 && t1?.code) {
        oraclePrice = `${t1.code} = ${formatCurrency(
          convertUsdToSelected(primaryTokenPrice, fxRate),
          selectedCurrency
        )}`;
      }
    } else if (isLendingPool) {
      const liqUsd =
        primaryTokenPrice > 0
          ? availableLiquidityNum * primaryTokenPrice
          : availableLiquidityNum;
      totalLiquidity = formatLiquidity(String(liqUsd), 2);
      totalLiquidityRaw = `${formatAmount(availableLiquidityNum, 2)} ${t1?.code ?? ""}`;
      supplyApyDisplay = `${supplyApyFromMeta.toFixed(2)}%`;
      borrowApyLabel = `${borrowApy.toFixed(2)}%`;

      if (totalLiabilities > 0) {
        const borrowUsd =
          primaryTokenPrice > 0
            ? totalLiabilities * primaryTokenPrice
            : totalLiabilities;
        totalBorrowedStat = formatLiquidity(String(borrowUsd), 2);
        totalBorrowedStatRaw = `${formatAmount(totalLiabilities, 2)} ${t1?.code ?? ""}`;
        if (tvlNum > 0) {
          utilization = `${((totalLiabilities / tvlNum) * 100).toFixed(2)}%`;
        }
      }
      if (primaryTokenPrice > 0 && t1?.code) {
        oraclePrice = `${t1.code} = ${formatCurrency(
          convertUsdToSelected(primaryTokenPrice, fxRate),
          selectedCurrency
        )}`;
      }
    } else {
      totalLiquidity = formatLiquidity(availableLiquidityNum.toString(), 2);
      totalLiquidityRaw = `${formatAmount(availableLiquidityNum, 2)} ${t1?.code ?? ""}`;
      supplyApyDisplay = pool.apy > 0 ? `${pool.apy.toFixed(2)}%` : "0.00%";
    }

    return {
      id: pool.id,
      name: pool.name || `${t1?.code ?? "?"} / ${t2?.code ?? "?"}`,
      token1: {
        symbol: t1?.code ?? "?",
        icon: getPoolTokenIcon({ type: "contract", code: t1?.code ?? "" }),
        address: t1?.address,
      },
      token2: {
        symbol: t2?.code ?? "?",
        icon: getPoolTokenIcon({ type: "contract", code: t2?.code ?? "" }),
        address: t2?.address,
      },
      liquidationLtv,
      contractAddress: pool.id,
      network: "Stellar",
      totalLiquidity,
      totalLiquidityRaw,
      totalBorrowed: totalBorrowedStat,
      totalBorrowedRaw: totalBorrowedStatRaw,
      supplyApy: supplyApyDisplay,
      supplyApySub,
      borrowApyLabel,
      poolType: poolTypeLabel,
      poolTypeDetail,
      oraclePrice,
      utilization,
      issuer: {
        name: ISSUER_LABEL_KEYS[pool.type]
          ? tPanel(ISSUER_LABEL_KEYS[pool.type])
          : pool.type,
        icon: ISSUER_ICONS[pool.type] ?? null,
      },
      token1Balance: token1AvailableBalance,
      token2Balance: token2AvailableBalance,
      /** LP / supplied position in human units (withdraw max) */
      lpBalance: withdrawableFormatted,
      lpBalance2: isPairAmm ? secondaryWithdrawableFormatted : undefined,
      collateralBalance: collateralRaw,
      loanBalance: loanRaw,
      borrowLimit,
      lFactor: (pool.metadata.lFactor as number | undefined) ?? 1,
      minCollateralUsd: (() => {
        const raw = pool.metadata.minCollateral as bigint | undefined;
        // minCollateral is in oracle base-asset units; Reflector oracle uses 14 decimals
        return raw && raw > 0n ? Number(raw) / 1e14 : undefined;
      })(),
      currentLtv: 0,
      collateralOptions: collateralOptionsWithBalances,
    };
  }, [
    pool,
    position,
    token1AvailableBalance,
    token2AvailableBalance,
    isLendingPool,
    collateralOptionsWithBalances,
    primaryTokenPrice,
    fxRate,
    selectedCurrency,
    withdrawableFormatted,
    secondaryWithdrawableFormatted,
    t,
    tPanel,
  ]);

  if (isLoading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:px-8">
        <div className="shrink-0 py-4">
          <Link
            href="/pools"
            className="inline-flex items-center gap-1 text-white/60 hover:text-white font-medium text-sm transition-colors"
          >
            {t("backToPools")}
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
          <PoolDetailSkeleton />
        </div>
      </div>
    );
  }

  if (error || !pool || !panelPool) {
    return (
      <div className="w-full flex items-center justify-center px-4 py-8 h-dvh">
        <div className="max-w-2xl w-full rounded-2xl bg-red-500/10 border border-red-500/20 p-8 text-center">
          <h1 className="text-xl font-bold text-red-400 mb-2">
            {t("notFoundTitle")}
          </h1>
          <p className="text-red-400/70 text-sm mb-6">
            {error instanceof Error ? error.message : t("notFoundBody")}
          </p>
          <Link
            href="/pools"
            className="text-[#229EDF] font-semibold text-sm hover:underline"
          >
            {t("backToPools")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="shrink-0 py-4">
        <Link
          href="/pools"
          className="inline-flex items-center gap-1 text-white/60 hover:text-white font-medium text-sm transition-colors"
        >
          {t("backToPools")}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
        <PoolDetailLayout
          pool={panelPool}
          type={initialTab}
          isWalletConnected={!!address}
          supportsBorrow={isLendingPool && supportedActions.includes("borrow")}
          depositWithdrawMode={depositWithdrawMode}
          ammTab={ammTab}
          onAmmTabChange={handleAmmTabChange}
          ammAmount={displayedAmmAmount}
          ammAmount2={displayedAmmAmount2}
          ammMaxAmount={maxAmmDepositAmount}
          ammMaxAmount2={maxAmmDepositAmount2}
          onAmmAmountChange={handleAmmAmountChange}
          onAmmAmount2Change={handleAmmAmount2Change}
          onAmmSubmit={handleAmmSubmit}
          isAmmSubmitting={isActionPending}
          ammSubmitDisabled={ammSubmitDisabled}
          ammInsufficientFundsMessage={ammInsufficientFundsMessage}
          canLend={canLend}
          canWithdraw={canRemoveOrWithdraw}
          canBorrow={canBorrow}
          onLendSubmit={handleLendOnlySubmit}
          onWithdrawSubmit={handleWithdrawOnlySubmit}
          onBorrowSubmit={handleBorrowingSubmit}
          isLendingActionPending={
            isActionPending || isBorrowWithCollateralPending
          }
        />
      </div>
    </div>
  );
};

export default PoolDetail;
