import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return "auto";
}

function getNextMode(mode: ThemeMode): ThemeMode {
  switch (mode) {
    case "light":
      return "dark";
    case "dark":
      return "auto";
    case "auto":
      return "light";
  }
}

function getResolvedMode(mode: ThemeMode): Exclude<ThemeMode, "auto"> {
  if (mode !== "auto") {
    return mode;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeMode(mode: ThemeMode): void {
  const resolved = getResolvedMode(mode);

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
}

function getThemeIcon(mode: ThemeMode) {
  switch (mode) {
    case "light":
      return Sun;
    case "dark":
      return Moon;
    case "auto":
      return Monitor;
  }
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    const initialMode = getInitialMode();
    setMode(initialMode);
    applyThemeMode(initialMode);
  }, []);

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function toggleMode(): void {
    const nextMode = getNextMode(mode);
    setMode(nextMode);
    applyThemeMode(nextMode);
    window.localStorage.setItem("theme", nextMode);
  }

  const label = `Theme mode: ${mode}. Click to switch mode.`;
  const Icon = getThemeIcon(mode);

  return (
    <Button
      aria-label={label}
      onClick={toggleMode}
      size="icon"
      title={label}
      type="button"
      variant="outline"
    >
      <Icon />
    </Button>
  );
}
