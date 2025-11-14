'use client';

import { useMemo } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { chains } from "../lib/wagmi";

const WalletBar = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect, isPending: isDisconnecting } = useDisconnect();

  const primaryConnector = connectors[0];

  const shortenedAddress = useMemo(() => {
    if (!address) {
      return null;
    }
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address]);

  const chainLabel = useMemo(() => {
    const chain = chains.find((c) => c.id === chainId);
    return chain ? `${chain.name} (#${chain.id})` : `Chain ID: ${chainId}`;
  }, [chainId]);

  return (
    <section className="wallet-bar card">
      {!isConnected ? (
        <div className="wallet-row">
          <p>Connect your EVM wallet to start simulating stealth activity.</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => primaryConnector && connect({ connector: primaryConnector })}
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
            <strong>{chainLabel}</strong>
          </div>
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

