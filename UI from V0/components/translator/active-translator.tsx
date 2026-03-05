"use client"

import { useState, useCallback, useEffect, useRef } from "react"

const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
}

interface ActiveTranslatorProps {
  langA: string
  langB: string
  onReset: () => void
}

type ListeningState = "idle" | "listening" | "hearing"

export function ActiveTranslator({ langA, langB, onReset }: ActiveTranslatorProps) {
  const [activeLang, setActiveLang] = useState<string | null>(null)
  const [listeningState, setListeningState] = useState<ListeningState>("idle")
  const hearingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const targetLang = activeLang === langA ? langB : langA

  const handleLangClick = useCallback((lang: string) => {
    if (activeLang === lang) {
      // Clicking the active language stops listening
      setActiveLang(null)
      setListeningState("idle")
      return
    }
    setActiveLang(lang)
    setListeningState("listening")
  }, [activeLang])

  // Simulate hearing detection (in real app, this would come from audio level analysis)
  useEffect(() => {
    if (listeningState !== "listening") return

    const interval = setInterval(() => {
      // Simulate intermittent "hearing" pulses
      setListeningState("hearing")
      if (hearingTimerRef.current) clearTimeout(hearingTimerRef.current)
      hearingTimerRef.current = setTimeout(() => {
        setListeningState((prev) => prev === "hearing" ? "listening" : prev)
      }, 800 + Math.random() * 700)
    }, 2000 + Math.random() * 2000)

    return () => {
      clearInterval(interval)
      if (hearingTimerRef.current) clearTimeout(hearingTimerRef.current)
    }
  }, [listeningState])

  const isActive = listeningState !== "idle"
  const isHearing = listeningState === "hearing"

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Language buttons - side by side */}
      <div className="flex items-stretch gap-3 px-4 py-4 sm:px-6">
        <LanguageButton
          lang={langA}
          name={LANGUAGES[langA]}
          isActive={activeLang === langA}
          isListening={activeLang === langA && isActive}
          onClick={() => handleLangClick(langA)}
        />
        <div className="flex flex-col items-center justify-center flex-shrink-0 gap-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 rotate-180">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
        <LanguageButton
          lang={langB}
          name={LANGUAGES[langB]}
          isActive={activeLang === langB}
          isListening={activeLang === langB && isActive}
          onClick={() => handleLangClick(langB)}
        />
      </div>

      {/* Translation display - two panels side by side */}
      <div className="flex-1 min-h-0 px-4 pb-3 sm:px-6">
        <div className="flex gap-3 h-full">
          {/* Source panel */}
          <div className={`flex-1 min-w-0 rounded-2xl border p-4 sm:p-5 flex flex-col overflow-hidden transition-all duration-300 ${
            isActive
              ? "border-primary/30 bg-primary/[0.06]"
              : "border-border/50 bg-secondary/20"
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                isActive ? "bg-primary" : "bg-muted-foreground/30"
              }`} />
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {activeLang ? LANGUAGES[activeLang] : "Source"}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <p className={`text-base sm:text-lg leading-relaxed ${
                isActive ? "text-foreground/50 italic" : "text-foreground/30 italic"
              }`}>
                {isActive
                  ? isHearing
                    ? "Hearing speech..."
                    : "Listening... speak now"
                  : "Tap a language button to start"
                }
              </p>
            </div>
          </div>

          {/* Translation panel */}
          <div className={`flex-1 min-w-0 rounded-2xl border p-4 sm:p-5 flex flex-col overflow-hidden transition-all duration-300 ${
            isActive
              ? "border-primary/20 bg-primary/[0.03]"
              : "border-border/50 bg-secondary/20"
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                isHearing ? "bg-primary animate-pulse" : "bg-muted-foreground/30"
              }`} />
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {targetLang && activeLang ? LANGUAGES[targetLang] : "Translation"}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <p className="text-base sm:text-lg leading-relaxed text-foreground/30 italic">
                {isActive
                  ? "Translation will appear here..."
                  : "Translated text appears here"
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar: mic indicator + status + reset */}
      <div className="border-t border-border/30 bg-card/50 backdrop-blur-md">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4">
          {/* Reset button */}
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Change languages"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            <span className="hidden sm:inline">Change Languages</span>
          </button>

          {/* Mic indicator (not clickable) */}
          <div className="flex flex-col items-center gap-2" aria-live="polite">
            <div className="relative flex items-center justify-center">
              {/* Glow rings for hearing state */}
              {isHearing && (
                <>
                  <div
                    className="absolute inset-0 rounded-full bg-primary/15 animate-ping"
                    style={{ animationDuration: "1.5s", width: 56, height: 56, left: -4, top: -4 }}
                  />
                  <div className="absolute rounded-full bg-primary/10" style={{ width: 64, height: 64, left: -8, top: -8 }} />
                </>
              )}
              {/* Listening subtle ring */}
              {isActive && !isHearing && (
                <div className="absolute rounded-full border-2 border-primary/25 animate-pulse" style={{ width: 60, height: 60, left: -6, top: -6 }} />
              )}

              <div
                className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isHearing
                    ? "bg-primary text-primary-foreground shadow-[0_0_24px_rgba(74,210,210,0.4)]"
                    : isActive
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/70 text-muted-foreground border border-border/50"
                }`}
                aria-label={
                  isHearing ? "Hearing speech" : isActive ? "Listening for speech" : "Microphone idle"
                }
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </div>
            </div>

            {/* Audio level bars */}
            <div className="flex items-end gap-[3px] h-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full transition-all duration-200"
                  style={{
                    height: isHearing ? `${6 + Math.sin(i * 1.3) * 6 + 6}px` : isActive ? "4px" : "3px",
                    backgroundColor: isHearing
                      ? `oklch(0.70 0.16 195 / ${0.5 + (i % 3) * 0.15})`
                      : isActive
                      ? "oklch(0.70 0.16 195 / 0.25)"
                      : "oklch(0.50 0 0 / 0.2)",
                    animation: isHearing
                      ? `barPulse ${0.35 + i * 0.08}s ease-in-out infinite alternate`
                      : "none",
                  }}
                />
              ))}
            </div>

            {/* Status text */}
            <p className={`text-xs font-medium tracking-wide transition-colors ${
              isHearing ? "text-primary" : isActive ? "text-primary/70" : "text-muted-foreground/50"
            }`}>
              {isHearing ? "Hearing..." : isActive ? "Listening..." : "Idle"}
            </p>
          </div>

          {/* Spacer for centering */}
          <div className="w-[120px] sm:w-[160px]" />
        </div>
      </div>
    </div>
  )
}

/* ─── Language Button ───────────────────────────────── */

interface LanguageButtonProps {
  lang: string
  name: string
  isActive: boolean
  isListening: boolean
  onClick: () => void
}

function LanguageButton({ name, isActive, isListening, onClick }: LanguageButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-2xl text-center transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 cursor-pointer ${
        isActive
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
          : "bg-secondary/60 text-foreground border border-border/50 hover:border-primary/40 hover:bg-secondary"
      }`}
      aria-label={isListening ? `Listening in ${name}. Tap to stop.` : `Tap to speak in ${name}`}
      aria-pressed={isActive}
    >
      {/* Small mic icon indicator */}
      <div className={`transition-all duration-300 ${isActive ? "opacity-100" : "opacity-40"}`}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={isActive ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isActive ? "opacity-80" : ""}
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>
      <span className="text-base sm:text-lg font-semibold truncate w-full">{name}</span>
      <span className={`text-[11px] font-medium tracking-wide transition-colors ${
        isActive ? "text-primary-foreground/80" : "text-muted-foreground"
      }`}>
        {isActive ? "Tap to stop" : "Tap to speak"}
      </span>
    </button>
  )
}
