"use client"

import { useState, useCallback } from "react"
import { Header } from "@/components/translator/header"
import { LanguageSetup } from "@/components/translator/language-setup"
import { ActiveTranslator } from "@/components/translator/active-translator"

export default function VoiceTranslatorPage() {
  const [languages, setLanguages] = useState<{ a: string; b: string } | null>(null)

  const handleConfirm = useCallback((langA: string, langB: string) => {
    setLanguages({ a: langA, b: langB })
  }, [])

  const handleReset = useCallback(() => {
    setLanguages(null)
  }, [])

  return (
    <div className="flex flex-col h-dvh bg-background text-foreground overflow-hidden">
      {/* Ambient background glow - softer for lighter theme */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      >
        <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <Header />

        {languages ? (
          <ActiveTranslator
            langA={languages.a}
            langB={languages.b}
            onReset={handleReset}
          />
        ) : (
          <LanguageSetup onConfirm={handleConfirm} />
        )}
      </div>

      {/* Keyframe animation for audio bars */}
      <style>{`
        @keyframes barPulse {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}
