'use client';

import { useState } from "react";
import ProfileSection from "./components/ProfileSection";
import SendSection from "./components/SendSection";
import InboxSection from "./components/InboxSection";
import { XxInboxPanel } from "./components/XxInboxPanel";
import ShopSection from "./components/ShopSection";
import WalletBar from "./components/WalletBar";
import useStealthState from "./hooks/useStealthState";
import { useXxUserId } from "./lib/xxUser";

const tabs = [
  { id: "profile", label: "PROFILE" },
  { id: "send", label: "SEND PAYMENT" },
  { id: "inbox", label: "INBOX / WITHDRAW" },
  { id: "shop", label: "SHOP" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function Home() {
  const {
    profile,
    payments,
    updateProfile,
    sendStealthPayment,
    withdrawPayment,
  } = useStealthState();
  const xxUserId = useXxUserId(profile);

  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="app-shell">
      <main className="main-container">
        <header className="page-header">
          <p className="eyebrow">POLKADOT | HYPERBRIDGE | XXNETWORK</p>
          <h1>PLATA MIA</h1>
          <p>
            Crosschain stealth addresses
          </p>
        </header>

        <div className="info-snippet">
          <p>
            <strong>Start here:</strong> Connect a wallet, connect to Paseo testnet, then move
            through the tabs in order - profile, send, inbox, shop.
          </p>
          <p>
            <strong>What happens:</strong> You create and pay from stealth balanceswithout ever linking them to
            your main address. This means history is unlinkable, so you should copy your tx hashes because you might 
            find it difficult to find them later!
          </p>
        </div>

        <WalletBar />

        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <ProfileSection profile={profile} onSave={updateProfile} />
        )}

        {activeTab === "send" && (
          <SendSection
            onSend={sendStealthPayment}
            defaultRecipientStealthId={profile.stealthPublicId}
            xxUserId={xxUserId}
          />
        )}

        {activeTab === "inbox" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Private inbox (xx mixnet)</h2>
                <p className="text-sm text-muted-foreground">
                  These notifications are relayed through the xx network via our Go backend. They tell you
                  when new stealth deposits arrive or invoices get paid&mdash;without exposing receiver tags
                  or wallet addresses onchain.
                </p>
              </div>
              <XxInboxPanel />
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Onchain inbox (tags)</h3>
                <p className="text-sm text-muted-foreground">
                  Right now we are also tagging each payment onchain for proof of concept. It reads
                  events directly from the stealth contract and requires receiver tags to correlate payments.
                </p>
              </div>
              <InboxSection payments={payments} onWithdraw={withdrawPayment} />
            </div>
          </div>
        )}

        {activeTab === "shop" && <ShopSection xxUserId={xxUserId} />}
      </main>
    </div>
  );
}
