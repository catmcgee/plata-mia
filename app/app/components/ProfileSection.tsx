'use client';

import { FormEvent, useEffect, useState } from "react";
import { StealthProfile } from "../types";

type ProfileSectionProps = {
  profile: StealthProfile;
  onSave: (profile: StealthProfile) => void;
};

const ProfileSection = ({ profile, onSave }: ProfileSectionProps) => {
  const [formState, setFormState] = useState<StealthProfile>(profile);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setFormState(profile);
  }, [profile]);

  useEffect(() => {
    if (!showSaved) {
      return;
    }
    const timeout = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timeout);
  }, [showSaved]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(formState);
    setShowSaved(true);
  };

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Stealth Identity</h2>
        </div>
        {showSaved && <span className="status-pill success">Saved</span>}
      </header>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="input-control">
          <span>Stealth Public ID</span>
          <input
            type="text"
            value={formState.stealthPublicId}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                stealthPublicId: event.target.value,
              }))
            }
            placeholder="e.g. stealth-kusama-123"
          />
        </label>

        <label className="input-control">
          <span>xx Identity</span>
          <input
            type="text"
            value={formState.xxIdentity}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                xxIdentity: event.target.value,
              }))
            }
            placeholder="your.xx.identity"
          />
        </label>

        <div className="actions-row">
          <button type="submit" className="primary-button">
            Save Profile
          </button>
        </div>
      </form>

      <div className="summary">
        <p>
          Current Stealth ID:{" "}
          <strong>{profile.stealthPublicId || "not configured"}</strong>
        </p>
        <p>
          xx Identity: <strong>{profile.xxIdentity || "not configured"}</strong>
        </p>
      </div>
    </section>
  );
};

export default ProfileSection;

