"use client";

import { GRADIENTS } from "@/lib/tokens";
import { getInitials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  index: number;
  size?: number;
  /** Profile picture URL; falls back to initials when absent. */
  src?: string;
}

export default function Avatar({ name, index, size = 36, src }: AvatarProps) {
  const shared: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.3,
    flexShrink: 0,
  };

  if (src) {
    // Avatars are already downscaled on upload and may be data URLs in sandbox
    // mode, so next/image optimisation would add nothing here.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={{ ...shared, objectFit: "cover", display: "block" }}
      />
    );
  }

  return (
    <div
      style={{
        ...shared,
        background: GRADIENTS[index % GRADIENTS.length],
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
    >
      {getInitials(name)}
    </div>
  );
}
