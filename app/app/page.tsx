'use client';

import { useState } from "react";
import ProfileSection from "./components/ProfileSection";
import SendSection from "./components/SendSection";
import InboxSection from "./components/InboxSection";
import ShopSection from "./components/ShopSection";
import WalletBar from "./components/WalletBar";
import useStealthState from "./hooks/useStealthState";

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

  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="app-shell">
      <main className="main-container">
        <header className="page-header">
          <p className="eyebrow">HYPERBRIDGE STEALTH WALKTHROUGH</p>
          <h1>PLATA MIA</h1>
          <p>
            Private commerce on Polkadot Asset Hub using Hyperbridge discovery. Follow the inline cues
            to know which action to take and what’s happening behind the scenes.
          </p>
        </header>

        <div className="info-snippet">
          <p>
            <strong>Start here:</strong> Connect a wallet, stay on Polkadot Hub TestNet, then move
            through the tabs in order—profile, send, inbox, shop.
          </p>
          <p>
            <strong>What happens:</strong> Hyperbridge relays stealth proofs without ever linking them to
            your main address. That also means history is unlinkable; copy tx hashes and verify everything
            on-chain if you need evidence.
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
          />
        )}

        {activeTab === "inbox" && (
          <InboxSection payments={payments} onWithdraw={withdrawPayment} />
        )}

        {activeTab === "shop" && <ShopSection />}
      </main>
    </div>
  );
}
