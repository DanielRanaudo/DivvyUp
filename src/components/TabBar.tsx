"use client";

import { T } from "@/lib/tokens";
import type { Tab } from "@/lib/types";

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export default function TabBar({
  tabs,
  active,
  onChange,
  className,
}: TabBarProps) {
  return (
    <nav
      aria-label="Sections"
      className={className}
      style={{
        display: "flex",
        gap: 4,
        padding: "4px",
        marginBottom: 24,
        background: "rgba(0,0,0,0.04)",
        borderRadius: 12,
        position: "sticky",
        top: 8,
        zIndex: 10,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? "page" : undefined}
          style={{
            flex: 1,
            padding: "8px 6px",
            border: "none",
            background: active === t.id ? T.cardSolid : "transparent",
            fontFamily: T.font,
            fontSize: 13,
            fontWeight: 500,
            color: active === t.id ? T.text : T.secondary,
            borderRadius: 8,
            cursor: "pointer",
            boxShadow: active === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
            position: "relative",
          }}
        >
          {t.label}
          {t.badge ? (
            <>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: T.red,
                }}
              />
              {/* The red dot is the only thing marking a section as needing
                  attention, so it has to be readable as well as visible. */}
              <span className="visually-hidden"> — needs attention</span>
            </>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
