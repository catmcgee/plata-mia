'use client';

import { useState } from "react";
import ProfileSection from "./components/ProfileSection";
import SendSection from "./components/SendSection";
import InboxSection from "./components/InboxSection";
import WalletBar from "./components/WalletBar";
import useStealthState from "./hooks/useStealthState";

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "send", label: "Send Payment" },
  { id: "inbox", label: "Inbox / Withdraw" },
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
          <p className="eyebrow">Plata Mia · Prototype</p>
          <h1>XCM Stealth Pay</h1>
          <p>Kusama Asset Hub × xx network (prototype)</p>
        </header>

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
          <InboxSection
            payments={payments}
            onWithdraw={withdrawPayment}
          />
        )}
      </main>
    </div>
  );
}
