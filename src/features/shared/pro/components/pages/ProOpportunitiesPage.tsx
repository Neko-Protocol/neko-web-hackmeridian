"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/ui/PageContainer";
import { BannerPage } from "@/components/ui/BannerPage";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { proImageUrl } from "@/lib/config/storage.config";
import { useProVaults } from "../../hooks/useProVaults";
import type { VaultCategory } from "../../types/vault";
import { VaultCard } from "../ui/VaultCard";

type CategoryFilter = VaultCategory | "all";

const CATEGORY_FILTERS: CategoryFilter[] = [
  "all",
  "real-estate",
  "agriculture",
  "energy",
  "private-credit",
];

export function ProOpportunitiesPage() {
  const t = useTranslations("sharedPro.page");
  const tCategory = useTranslations("sharedPro.categories");
  const vaultsQuery = useProVaults();
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);

  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!filtersRef.current?.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const counts = useMemo(() => {
    const c: Record<CategoryFilter, number> = {
      all: vaults.length,
      "real-estate": 0,
      agriculture: 0,
      energy: 0,
      "private-credit": 0,
    };
    for (const v of vaults) c[v.category] += 1;
    return c;
  }, [vaults]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vaults.filter((v) => {
      if (activeFilter !== "all" && v.category !== activeFilter) return false;
      if (!q) return true;
      return [v.name, v.description, v.symbol].some((text) =>
        text.toLowerCase().includes(q)
      );
    });
  }, [vaults, activeFilter, query]);

  return (
    <PageContainer maxWidth="7xl">
      <BannerPage
        title={t("title")}
        subtitle={t("subtitle")}
        badge={t("badge")}
        imageSrc={proImageUrl("banners/pro.png")}
        imageAlt={t("imageAlt")}
        // Wider than the default 55% so the illustration fills the banner's
        // height and its pedestal reads in full, rather than sitting small in
        // the middle.
        imageLayoutClassName="right-0 top-[11%] h-full w-[75%]"
        className="mb-8"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
              filtersOpen || activeFilter !== "all"
                ? "border-white bg-white text-[#121212]"
                : "border-white/5 bg-[#1C1C1C] text-white/70 hover:border-white/15 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {activeFilter === "all" ? t("filters") : tCategory(activeFilter)}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {filtersOpen && (
            <ul
              role="listbox"
              aria-label={t("categoryAriaLabel")}
              className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#1C1C1C] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            >
              {CATEGORY_FILTERS.map((f) => {
                const active = activeFilter === f;
                return (
                  <li key={f} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveFilter(f);
                        setFiltersOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Check
                          className={`h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-0"}`}
                          aria-hidden
                        />
                        {f === "all" ? t("all") : tCategory(f)}
                      </span>
                      <span className="tabular-nums rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/40">
                        {counts[f]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-[#1C1C1C] border border-white/5 rounded-full pl-9 pr-9 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-white/40 hover:text-white hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {vaultsQuery.isPending ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-[#1C1C1C] p-12 text-center">
          <LoadingSpinner variant="spinner" size="md" />
          <p className="text-sm text-white/40">{t("loading")}</p>
        </div>
      ) : vaultsQuery.isError ? (
        <div className="rounded-2xl border border-white/5 bg-[#1C1C1C] p-12 text-center">
          <p className="text-base text-white/40">{t("loadError")}</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((vault) => (
            <VaultCard key={vault.id} vault={vault} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#1C1C1C] border border-white/5 p-12 text-center">
          <p className="text-white/40 text-base">{t("noMatches")}</p>
          <button
            type="button"
            onClick={() => {
              setActiveFilter("all");
              setQuery("");
            }}
            className="mt-3 text-xs font-semibold text-[#229EDF] hover:underline"
          >
            {t("clearFilters")}
          </button>
        </div>
      )}
    </PageContainer>
  );
}
