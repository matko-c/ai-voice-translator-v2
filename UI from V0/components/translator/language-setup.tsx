"use client"

import { useState } from "react"

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ru", name: "Russian" },
]

interface LanguageSetupProps {
  onConfirm: (langA: string, langB: string) => void
}

export function LanguageSetup({ onConfirm }: LanguageSetupProps) {
  const [langA, setLangA] = useState("en")
  const [langB, setLangB] = useState("es")

  const langAName = LANGUAGES.find((l) => l.code === langA)?.name
  const langBName = LANGUAGES.find((l) => l.code === langB)?.name

  const canConfirm = langA !== langB

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 gap-10">
      {/* Instruction */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Choose Two Languages
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Pick the two languages for your conversation. You can speak in either one.
        </p>
      </div>

      {/* Two dropdowns side by side */}
      <div className="flex items-center gap-4 w-full max-w-md">
        {/* Language A */}
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground text-center">
            Language 1
          </label>
          <div className="relative">
            <select
              value={langA}
              onChange={(e) => setLangA(e.target.value)}
              className="w-full appearance-none bg-secondary/70 border border-border/60 rounded-xl px-4 py-3.5 pr-10 text-base font-medium text-foreground cursor-pointer transition-all hover:bg-secondary hover:border-primary/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>

        {/* Divider icon */}
        <div className="flex-shrink-0 mt-6 text-muted-foreground/50">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3l4 4-4 4" />
            <path d="M16 3l-4 4 4 4" />
            <line x1="4" y1="21" x2="20" y2="21" />
          </svg>
        </div>

        {/* Language B */}
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground text-center">
            Language 2
          </label>
          <div className="relative">
            <select
              value={langB}
              onChange={(e) => setLangB(e.target.value)}
              className="w-full appearance-none bg-secondary/70 border border-border/60 rounded-xl px-4 py-3.5 pr-10 text-base font-medium text-foreground cursor-pointer transition-all hover:bg-secondary hover:border-primary/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Same-language warning */}
      {!canConfirm && (
        <p className="text-sm text-destructive font-medium">
          Please select two different languages.
        </p>
      )}

      {/* Confirm button */}
      <button
        onClick={() => canConfirm && onConfirm(langA, langB)}
        disabled={!canConfirm}
        className="px-8 py-3.5 rounded-xl text-base font-semibold transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        Start Translating
      </button>

      <p className="text-xs text-muted-foreground/60">
        {langAName} &harr; {langBName}
      </p>
    </div>
  )
}
