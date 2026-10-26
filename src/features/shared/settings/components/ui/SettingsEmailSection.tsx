"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui/SectionCard";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { useToast } from "@/hooks/useToast";
import { usersService } from "@/lib/services/users.service";
import type { UserPublic } from "@/lib/types/user.types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SettingsEmailSectionProps {
  open?: boolean;
  onToggle?: () => void;
  icon?: React.ElementType;
}

export function SettingsEmailSection({
  open,
  onToggle,
  icon,
}: SettingsEmailSectionProps) {
  const t = useTranslations("sharedSettings.email");
  const { address, isConnected } = useStellarWallet();
  const { addNotification } = useToast();

  const [user, setUser] = useState<UserPublic | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [prevAddress, setPrevAddress] = useState(address);
  const [loadedForAddress, setLoadedForAddress] = useState<string | null>(null);

  if (address !== prevAddress) {
    setPrevAddress(address);
    setUser(null);
    setDraft("");
    setLoadedForAddress(null);
  }

  const loading = Boolean(address && loadedForAddress !== address);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void usersService.get(address).then((u) => {
      if (cancelled) return;
      setUser(u);
      setDraft(u?.email ?? "");
      setLoadedForAddress(address);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("email");
    if (status === "verified") {
      addNotification(t("emailVerifiedToast"), "success");
    } else if (status === "error") {
      addNotification(t("emailVerifyErrorToast"), "error");
    }
    if (status) {
      params.delete("email");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
      );
    }
  }, [addNotification, t]);

  const verified = Boolean(user?.email_verified_at);
  const hasEmail = Boolean(user?.email);

  const handleSend = async () => {
    if (!address) return;
    const email = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      addNotification(t("invalidEmailToast"), "error");
      return;
    }
    setSending(true);
    try {
      const res = await usersService.startEmailVerification(address, email);
      if (res.ok) {
        addNotification(t("verificationSentToast"), "success");
        const fresh = await usersService.get(address);
        setUser(fresh);
        setDraft(fresh?.email ?? email);
      } else {
        addNotification(
          res.error
            ? t("sendFailedWithReason", { error: res.error })
            : t("sendFailedGeneric"),
          "error"
        );
      }
    } finally {
      setSending(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <SectionCard
        title={t("title")}
        collapsible
        open={open}
        onToggle={onToggle}
        icon={icon}
      >
        <div className="rounded-xl bg-[#2A2A2A] px-4 py-5 text-center">
          <p className="text-sm text-white/40">{t("connectPrompt")}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div id="email" className="scroll-mt-24">
      <SectionCard
        title={t("title")}
        collapsible
        open={open}
        onToggle={onToggle}
        icon={icon}
      >
        <p className="text-xs leading-relaxed text-white/50">
          {t("description")}
        </p>

        {hasEmail && (
          <div className="flex items-center justify-between rounded-xl bg-[#2A2A2A] px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-white/40">{t("current")}</span>
              <span className="truncate text-sm font-medium text-white/80">
                {user?.email}
              </span>
            </div>
            {verified ? (
              <span className="ml-3 flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("verified")}
              </span>
            ) : (
              <span className="ml-3 shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
                {t("pending")}
              </span>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/40">
            {hasEmail ? t("changeEmail") : t("addEmail")}
          </span>
          <div className="flex items-center gap-2 rounded-xl bg-[#2A2A2A] px-3 py-2">
            <Mail className="h-4 w-4 text-white/30" />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={loading || sending}
              className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none disabled:opacity-50"
            />
          </div>
        </label>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={
            sending ||
            loading ||
            !draft.trim() ||
            (hasEmail && draft.trim().toLowerCase() === user?.email && verified)
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition-colors duration-150 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? t("sending") : t("sendLink")}
        </button>
      </SectionCard>
    </div>
  );
}
