"use client";

import type { ReactNode } from "react";
import { NEARBY_LABEL } from "@/lib/nearby/offline";
import { HostSession, type NearbyClient } from "@/lib/nearby/session";
import { NearbyInvite } from "./nearby-invite";
import "./nearby.css";

/**
 * Wraps the friends' lobby for a nearby table: the "Nearby · free" label, the host's Add a player, and
 * the lobby itself with its online-only parts (the table code and invite link) hidden.
 */
export function NearbyLobby({ client, children }: { client: NearbyClient; children: ReactNode }) {
  return (
    <div className="nb-lobby">
      <div className="nb-lobby-bar">
        <span className="nb-tag">{NEARBY_LABEL}</span>
        {client instanceof HostSession ? <NearbyInvite session={client} /> : <span className="nb-note">The host starts the game</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * During a nearby game: the label, a dot that goes dim when the link to the host is lost, and for the
 * host a way to let someone (back) in.
 */
export function NearbyBadge({ client, live }: { client: NearbyClient; live: boolean }) {
  return (
    <div className="nb-badge">
      <span className="nb-dot" data-live={live} aria-hidden />
      <span className="nb-tag">{NEARBY_LABEL}</span>
      {client instanceof HostSession && <NearbyInvite session={client} compact />}
    </div>
  );
}
