"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import useStealthVault from "../hooks/useStealthVault";
import { chains, hardhatLocal, polkadotHubTestnet } from "../lib/wagmi";

const shortenHex = (value?: `0x${string}` | string | null) => {
  if (!value) return null;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const WalletBar = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect, isPending: isDisconnecting } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { networkLabel, vaultAddress } = useStealthVault();

  const primaryConnector = connectors[0];

  const shortenedAddress = useMemo(() => shortenHex(address ?? null), [address]);

  const chainLabel = useMemo(() => {
    const chain = chains.find((c) => c.id === chainId);
    return chain
      ? `${chain.name} (#${chain.id})`
      : chainId
        ? `Chain ID: ${chainId}`
        : "Not connected";
  }, [chainId]);

  const handleConnect = async () => {
    if (!primaryConnector) return;

    try {
      await connect({
        connector: primaryConnector,
        chainId: hardhatLocal.id,
      });
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const renderSwitchButtons = () => {
    if (!chainId) return null;

    const buttons = [];
    if (chainId !== hardhatLocal.id) {
      buttons.push(
        <button
          key="switch-hardhat"
          type="button"
          className="primary-button"
          onClick={() => switchChain({ chainId: hardhatLocal.id })}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Hardhat"}
        </button>
      );
    }

    if (chainId !== polkadotHubTestnet.id) {
      buttons.push(
        <button
          key="switch-passet"
          type="button"
          className="secondary-button"
          onClick={() => switchChain({ chainId: polkadotHubTestnet.id })}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Passet Hub"}
        </button>
      );
    }

    return buttons;
  };

  return (
    <section className="wallet-bar card">
      {!isConnected ? (
        <div className="wallet-row">
          <p>Connect your EVM wallet to interact with the StealthVault.</p>
          <button
            type="button"
            className="primary-button"
            onClick={handleConnect}
            disabled={!primaryConnector || isPending}
          >
            {isPending ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      ) : (
        <div className="wallet-row connected">
          <div className="wallet-details">
            <span className="label">Address</span>
            <strong className="mono">{shortenedAddress}</strong>
          </div>
          <div className="wallet-details">
            <span className="label">Network</span>
            <strong>{networkLabel ?? chainLabel}</strong>
          </div>
          {vaultAddress && (
            <div className="wallet-details">
              <span className="label">Vault</span>
              <strong className="mono">{shortenHex(vaultAddress)}</strong>
            </div>
          )}
          <div className="wallet-actions">{renderSwitchButtons()}</div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => disconnect()}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
    </section>
  );
};

export default WalletBar;

