/* ─────────────────────────────────────────────────────────
   Voxify – Real engine wired to V0 UI
   Panels are FIXED: left = Language A, right = Language B
   ───────────────────────────────────────────────────────── */

/* ── Language Maps ──────────────────────────────────────── */
const LANG_NAMES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', ru: 'Russian'
};

// BCP-47 locale tags for SpeechRecognition & SpeechSynthesis
const LANG_LOCALE = {
    en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
    it: 'it-IT', pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR',
    zh: 'zh-CN', ar: 'ar-SA', hi: 'hi-IN', ru: 'ru-RU'
};

// Placeholder: "Listening… speak now" in each language
const PLACEHOLDER_LISTEN = {
    en: 'Listening… speak now',
    es: 'Escuchando… habla ahora',
    fr: 'Écoute… parlez maintenant',
    de: 'Zuhören… sprechen Sie jetzt',
    it: 'Ascolto… parla adesso',
    pt: 'Ouvindo… fale agora',
    ja: '聞いています…今話してください',
    ko: '듣고 있어요… 지금 말하세요',
    zh: '正在听…请现在说话',
    ar: 'أستمع… تحدث الآن',
    hi: 'सुन रहा हूं… अभी बोलें',
    ru: 'Слушаю… говорите сейчас'
};

// Placeholder: "Translation will appear here" in each language
const PLACEHOLDER_TRANSLATE = {
    en: 'Translation will appear here',
    es: 'La traducción aparecerá aquí',
    fr: 'La traduction apparaîtra ici',
    de: 'Die Übersetzung erscheint hier',
    it: 'La traduzione apparirà qui',
    pt: 'A tradução aparecerá aqui',
    ja: '翻訳がここに表示されます',
    ko: '번역이 여기에 표시됩니다',
    zh: '翻译将显示在这里',
    ar: 'ستظهر الترجمة هنا',
    hi: 'अनुवाद यहां दिखाई देगा',
    ru: 'Перевод появится здесь'
};

// Idle placeholder in each language: "Tap the button above to speak"
const PLACEHOLDER_IDLE = {
    en: 'Tap the button above to speak',
    es: 'Toca el botón de arriba para hablar',
    fr: 'Appuyez sur le bouton ci-dessus pour parler',
    de: 'Tippen Sie oben auf die Schaltfläche zum Sprechen',
    it: 'Tocca il pulsante sopra per parlare',
    pt: 'Toque no botão acima para falar',
    ja: '上のボタンをタップして話してください',
    ko: '위 버튼을 눌러 말하세요',
    zh: '点击上方按钮开始说话',
    ar: 'اضغط على الزر أعلاه للتحدث',
    hi: 'बोलने के लिए ऊपर का बटन दबाएं',
    ru: 'Нажмите кнопку выше, чтобы говорить'
};

/* ── DOM Refs ─────────────────────────────────────────────  */
const $ = (id) => document.getElementById(id);
const viewSetup = $('viewSetup');
const viewActive = $('viewActive');
const selA = $('langA');
const selB = $('langB');
const btnStart = $('btnStart');
const setupWarning = $('setupWarning');
const setupSummary = $('setupSummary');
const btnLangA = $('btnLangA');
const btnLangB = $('btnLangB');
const btnLangAName = $('btnLangAName');
const btnLangBName = $('btnLangBName');
// panelA = left (Language A), panelB = right (Language B)
const panelA = $('panelSource');   // left
const panelB = $('panelTarget');   // right
const dotA = $('dotSource');     // left dot
const dotB = $('dotTarget');     // right dot
const labelA = $('labelSource');   // left header text
const labelB = $('labelTarget');   // right header text
const textA = $('textSource');    // left body text
const textB = $('textTarget');    // right body text
const micCircle = $('micCircle');
const audioBarsEl = $('audioBars');
const micStatus = $('micStatus');
const btnReset = $('btnReset');

/* ── App State ───────────────────────────────────────────── */
let activeLang = null;   // null | 'a' | 'b'
let isTranslating = false;
let isSpeaking = false;
let chosenA = selA.value;
let chosenB = selB.value;

/* ── Speech APIs ─────────────────────────────────────────── */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;
let recognition = null;

if (!SpeechRecognition) {
    alert('Speech Recognition is not supported in this browser. Please use Chrome or Edge.');
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setMicState('listening');

    recognition.onspeechstart = () => setMicState('hearing');

    recognition.onspeechend = () => recognition.stop();

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (!transcript) { restartListening(); return; }
        await handleTranslationFlow(transcript);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            showError(event.error);
        }
        if (event.error !== 'aborted') setTimeout(restartListening, 1000);
    };

    recognition.onend = () => {
        if (activeLang && !isTranslating && !isSpeaking) restartListening();
    };
}

/* ── Mic / UI State Machine ──────────────────────────────── */
// states: 'idle' | 'listening' | 'hearing' | 'translating' | 'speaking'
function setMicState(state) {
    const bars = audioBarsEl.querySelectorAll('.audio-bar');

    /* Mic circle */
    micCircle.className = 'mic-circle';
    if (state === 'listening' || state === 'translating') micCircle.classList.add('listening');
    if (state === 'hearing' || state === 'speaking') micCircle.classList.add('hearing');

    /* Audio bars */
    bars.forEach((bar, i) => {
        bar.className = 'audio-bar';
        if (state === 'listening' || state === 'translating') {
            bar.classList.add('listening');
            bar.style.height = '4px';
        } else if (state === 'hearing' || state === 'speaking') {
            bar.classList.add('hearing');
            bar.style.height = (6 + Math.sin(i * 1.3) * 6 + 6) + 'px';
        } else {
            bar.style.height = '3px';
        }
    });

    /* Status text */
    micStatus.className = 'mic-status';
    const statusLabels = {
        idle: 'Idle', listening: 'Listening...', hearing: 'Hearing...',
        translating: 'Translating...', speaking: 'Speaking...'
    };
    micStatus.textContent = statusLabels[state] || 'Idle';
    if (state !== 'idle') {
        micStatus.classList.add(state === 'hearing' || state === 'speaking' ? 'hearing' : 'listening');
    }

    /* Panel labels – always fixed to their language */
    labelA.textContent = LANG_NAMES[chosenA];
    labelB.textContent = LANG_NAMES[chosenB];

    /* Panel highlight + dot:
       Left (A) = source when activeLang=a, target when activeLang=b
       Right (B) = source when activeLang=b, target when activeLang=a  */
    const isActive = state !== 'idle';
    const aIsSource = activeLang === 'a';

    if (!isActive) {
        panelA.className = 'panel';
        panelB.className = 'panel';
        dotA.className = 'panel-dot';
        dotB.className = 'panel-dot';
    } else if (aIsSource) {
        // A button active → A panel is speaking side
        panelA.className = 'panel source-active';
        panelB.className = 'panel target-active';
        dotA.className = 'panel-dot on';
        dotB.className = 'panel-dot' + (state === 'translating' || state === 'speaking' ? ' pulsing' : '');
    } else {
        // B button active → B panel is speaking side
        panelA.className = 'panel target-active';
        panelB.className = 'panel source-active';
        dotA.className = 'panel-dot' + (state === 'translating' || state === 'speaking' ? ' pulsing' : '');
        dotB.className = 'panel-dot on';
    }
}

/* ── Setup View ──────────────────────────────────────────── */
function updateSetup() {
    chosenA = selA.value;
    chosenB = selB.value;
    const same = chosenA === chosenB;
    setupWarning.classList.toggle('hidden', !same);
    btnStart.disabled = same;
    setupSummary.textContent = LANG_NAMES[chosenA] + ' \u2194 ' + LANG_NAMES[chosenB];
}

selA.addEventListener('change', updateSetup);
selB.addEventListener('change', updateSetup);
updateSetup();

btnStart.addEventListener('click', () => {
    if (chosenA === chosenB) return;
    viewSetup.classList.add('hidden');
    viewActive.classList.remove('hidden');
    btnLangAName.textContent = LANG_NAMES[chosenA];
    btnLangBName.textContent = LANG_NAMES[chosenB];
    resetActiveState();
});

/* ── Active View ─────────────────────────────────────────── */
function setIdlePanels() {
    // Show idle placeholders in each panel's own language
    textA.textContent = PLACEHOLDER_IDLE[chosenA];
    textA.className = 'panel-text';
    textB.textContent = PLACEHOLDER_IDLE[chosenB];
    textB.className = 'panel-text';
}

function setListeningPanels(listeningLang) {
    // listeningLang: 'a' | 'b'
    if (listeningLang === 'a') {
        textA.textContent = PLACEHOLDER_LISTEN[chosenA];
        textA.className = 'panel-text listening';
        textB.textContent = PLACEHOLDER_TRANSLATE[chosenB];
        textB.className = 'panel-text';
    } else {
        textB.textContent = PLACEHOLDER_LISTEN[chosenB];
        textB.className = 'panel-text listening';
        textA.textContent = PLACEHOLDER_TRANSLATE[chosenA];
        textA.className = 'panel-text';
    }
}

function resetActiveState() {
    stopEverything();
    btnLangA.classList.remove('active');
    btnLangB.classList.remove('active');
    btnLangA.setAttribute('aria-pressed', 'false');
    btnLangB.setAttribute('aria-pressed', 'false');
    btnLangA.querySelector('.lang-btn-hint').textContent = 'Tap to speak';
    btnLangB.querySelector('.lang-btn-hint').textContent = 'Tap to speak';
    setMicState('idle');
    setIdlePanels();
}

function stopEverything() {
    activeLang = null;
    isTranslating = false;
    isSpeaking = false;
    if (recognition) { try { recognition.abort(); } catch (_) { } }
    synth.cancel();
}

function activateLang(which) {
    // iOS Safari blocks SpeechSynthesis if it isn't triggered directly inside
    // a user-gesture. Fire a silent utterance NOW (while we're still in the
    // click handler) to unlock the audio context before the async fetch runs.
    const iosWarmUp = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(iosWarmUp);

    stopEverything();
    activeLang = which;

    const isA = which === 'a';
    btnLangA.classList.toggle('active', isA);
    btnLangB.classList.toggle('active', !isA);
    btnLangA.setAttribute('aria-pressed', String(isA));
    btnLangB.setAttribute('aria-pressed', String(!isA));
    btnLangA.querySelector('.lang-btn-hint').textContent = isA ? 'Tap to stop' : 'Tap to speak';
    btnLangB.querySelector('.lang-btn-hint').textContent = isA ? 'Tap to speak' : 'Tap to stop';

    setListeningPanels(which);
    restartListening();
}

btnLangA.addEventListener('click', () => {
    if (activeLang === 'a') { resetActiveState(); } else { activateLang('a'); }
});

btnLangB.addEventListener('click', () => {
    if (activeLang === 'b') { resetActiveState(); } else { activateLang('b'); }
});

btnReset.addEventListener('click', () => {
    resetActiveState();
    viewActive.classList.add('hidden');
    viewSetup.classList.remove('hidden');
});

/* ── Recognition Helpers ─────────────────────────────────── */
function restartListening() {
    if (!activeLang || !recognition) return;
    const locale = activeLang === 'a' ? LANG_LOCALE[chosenA] : LANG_LOCALE[chosenB];
    recognition.lang = locale;
    try { recognition.start(); } catch (e) {
        if (e.name !== 'InvalidStateError') console.error(e);
    }
}

/* ── Translation Flow ────────────────────────────────────── */
async function handleTranslationFlow(transcript) {
    if (!activeLang) return;
    isTranslating = true;

    // Determine source/target based on which button is active
    const srcCode = activeLang === 'a' ? chosenA : chosenB;
    const tgtCode = activeLang === 'a' ? chosenB : chosenA;
    const srcName = LANG_NAMES[srcCode];
    const tgtName = LANG_NAMES[tgtCode];
    const tgtLocale = LANG_LOCALE[tgtCode];

    // Fill the speaking side's panel with transcript, other side with "…"
    if (activeLang === 'a') {
        textA.textContent = transcript;
        textA.className = 'panel-text has-content';
        textB.textContent = '…';
        textB.className = 'panel-text listening';
    } else {
        textB.textContent = transcript;
        textB.className = 'panel-text has-content';
        textA.textContent = '…';
        textA.className = 'panel-text listening';
    }
    setMicState('translating');

    try {
        const translatedText = await fetchTranslation(transcript, srcName, tgtName);
        if (!activeLang) return;

        // Fill the translation into the OTHER panel
        if (activeLang === 'a') {
            textB.textContent = translatedText;
            textB.className = 'panel-text has-content';
        } else {
            textA.textContent = translatedText;
            textA.className = 'panel-text has-content';
        }

        speakTranslation(translatedText, tgtLocale);
    } catch (err) {
        console.error('Translation error:', err);
        showError(err.message);
        isTranslating = false;
        setTimeout(restartListening, 2000);
    }
}

async function fetchTranslation(text, sourceName, targetName) {
    const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source_language: sourceName, target_language: targetName })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.text;
}

/* ── Speech Synthesis ────────────────────────────────────── */
function speakTranslation(text, locale) {
    isTranslating = false;
    isSpeaking = true;
    setMicState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    const voices = synth.getVoices();
    const langPrefix = locale.split('-')[0];
    const voice = voices.find(v => v.lang === locale) ||
        voices.find(v => v.lang.startsWith(langPrefix));
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
        isSpeaking = false;
        if (activeLang) restartListening();
    };
    utterance.onerror = (e) => {
        console.error('TTS error:', e);
        isSpeaking = false;
        if (activeLang) restartListening();
    };
    synth.speak(utterance);
}

/* ── Utilities ───────────────────────────────────────────── */
function showError(msg) {
    const panel = activeLang === 'a' ? textA : textB;
    const orig = panel.textContent;
    panel.style.color = 'var(--destructive)';
    panel.textContent = '⚠ ' + msg;
    setTimeout(() => {
        panel.style.color = '';
        panel.textContent = orig;
    }, 3000);
}

// Pre-load voices (Chrome loads them async)
if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => synth.getVoices();
}
