/* ─────────────────────────────────────────────────────────
   Voxify – Continuous Audio Translator
   Uses MediaRecorder + silence detection + Gemini Multimodal API
   ───────────────────────────────────────────────────────── */

/* ── Language Maps ──────────────────────────────────────── */
const LANG_NAMES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', ru: 'Russian'
};

const LANG_LOCALE = {
    en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
    it: 'it-IT', pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR',
    zh: 'zh-CN', ar: 'ar-SA', hi: 'hi-IN', ru: 'ru-RU'
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
const btnToggle = $('btnToggle');
const btnToggleLabel = $('btnToggleLabel');
const togglePair = $('togglePair');
const panelA = $('panelSource');
const panelB = $('panelTarget');
const dotA = $('dotSource');
const dotB = $('dotTarget');
const labelA = $('labelSource');
const labelB = $('labelTarget');
const textA = $('textSource');
const textB = $('textTarget');
const micCircle = $('micCircle');
const audioBarsEl = $('audioBars');
const micStatus = $('micStatus');
const btnReset = $('btnReset');

/* ── App State ───────────────────────────────────────────── */
let isConversationActive = false;
let isTranslating = false;
let isSpeaking = false;
let chosenA = selA.value;
let chosenB = selB.value;

/* ── Audio Pipeline State ────────────────────────────────── */
let mediaStream = null;
let mediaRecorder = null;
let audioContext = null;
let analyserNode = null;
let recordedChunks = [];
let silenceTimer = null;
let isSpeechDetected = false;
let animFrameId = null;

const SILENCE_THRESHOLD = 0.015;   // RMS below this = silence
const SILENCE_DURATION = 1500;     // ms of silence before we stop recording
const MIN_RECORDING_MS = 500;      // ignore chunks shorter than this
let recordingStartTime = 0;

/* ── Speech Synthesis ────────────────────────────────────── */
const synth = window.speechSynthesis;

/* ── Mic / UI State Machine ──────────────────────────────── */
function setMicState(state) {
    const bars = audioBarsEl.querySelectorAll('.audio-bar');

    micCircle.className = 'mic-circle';
    if (state === 'listening' || state === 'translating') micCircle.classList.add('listening');
    if (state === 'hearing' || state === 'speaking') micCircle.classList.add('hearing');

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

    micStatus.className = 'mic-status';
    const statusLabels = {
        idle: 'Idle', listening: 'Listening...', hearing: 'Hearing...',
        translating: 'Translating...', speaking: 'Speaking...'
    };
    micStatus.textContent = statusLabels[state] || 'Idle';
    if (state !== 'idle') {
        micStatus.classList.add(state === 'hearing' || state === 'speaking' ? 'hearing' : 'listening');
    }

    labelA.textContent = LANG_NAMES[chosenA];
    labelB.textContent = LANG_NAMES[chosenB];

    const isActive = state !== 'idle';
    if (!isActive) {
        panelA.className = 'panel';
        panelB.className = 'panel';
        dotA.className = 'panel-dot';
        dotB.className = 'panel-dot';
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
    togglePair.textContent = LANG_NAMES[chosenA] + ' \u2194 ' + LANG_NAMES[chosenB];
    labelA.textContent = LANG_NAMES[chosenA];
    labelB.textContent = LANG_NAMES[chosenB];
    textA.textContent = 'Press Start Conversation to begin';
    textA.className = 'panel-text';
    textB.textContent = 'Translation will appear here';
    textB.className = 'panel-text';
    setMicState('idle');
});

/* ── Toggle Conversation ─────────────────────────────────── */
btnToggle.addEventListener('click', async () => {
    if (isConversationActive) {
        stopConversation();
    } else {
        await startConversation();
    }
});

async function startConversation() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error('Microphone access denied:', err);
        showError('Microphone access denied');
        return;
    }

    // Warm up speech synthesis (iOS Safari fix)
    const warmUp = new SpeechSynthesisUtterance('');
    synth.speak(warmUp);

    isConversationActive = true;
    btnToggle.classList.add('active');
    btnToggleLabel.textContent = 'Stop Conversation';

    // Set up AudioContext + Analyser for silence detection
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    startRecording();
}

function stopConversation() {
    isConversationActive = false;
    isTranslating = false;
    isSpeaking = false;
    btnToggle.classList.remove('active');
    btnToggleLabel.textContent = 'Start Conversation';

    // Stop the recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (_) { }
    }
    mediaRecorder = null;
    recordedChunks = [];

    // Stop silence detection
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }

    // Close audio context
    if (audioContext) { audioContext.close(); audioContext = null; }

    // Stop mic stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }

    synth.cancel();
    setMicState('idle');
    textA.textContent = 'Press Start Conversation to begin';
    textA.className = 'panel-text';
    textB.textContent = 'Translation will appear here';
    textB.className = 'panel-text';
}

/* ── Recording + Silence Detection ───────────────────────── */
function startRecording() {
    if (!isConversationActive || !mediaStream) return;

    recordedChunks = [];
    isSpeechDetected = false;

    // Choose a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        if (!isConversationActive) return;

        const elapsed = Date.now() - recordingStartTime;
        if (elapsed < MIN_RECORDING_MS || recordedChunks.length === 0 || !isSpeechDetected) {
            // Too short or no speech detected — restart immediately
            startRecording();
            return;
        }

        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        recordedChunks = [];

        // Send to backend, and immediately start recording the next chunk
        sendAudioForTranslation(blob);
        startRecording();
    };

    mediaRecorder.start(250); // collect data in 250ms intervals
    recordingStartTime = Date.now();
    setMicState('listening');

    // Start monitoring for silence
    monitorSilence();
}

function monitorSilence() {
    if (!analyserNode || !isConversationActive) return;

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    function check() {
        if (!isConversationActive) return;

        analyserNode.getByteTimeDomainData(dataArray);

        // Compute RMS
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        if (rms > SILENCE_THRESHOLD) {
            // Sound detected
            if (!isSpeechDetected) {
                isSpeechDetected = true;
                setMicState('hearing');
            }
            // Reset silence timer
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        } else if (isSpeechDetected && !silenceTimer) {
            // Speech was detected before, now it's silent — start countdown
            silenceTimer = setTimeout(() => {
                silenceTimer = null;
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, SILENCE_DURATION);
        }

        animFrameId = requestAnimationFrame(check);
    }

    animFrameId = requestAnimationFrame(check);
}

/* ── Send Audio to Backend ───────────────────────────────── */
async function sendAudioForTranslation(blob) {
    isTranslating = true;
    setMicState('translating');

    textA.textContent = '…';
    textA.className = 'panel-text listening';
    textB.textContent = '…';
    textB.className = 'panel-text listening';

    try {
        // Convert blob to base64
        const base64 = await blobToBase64(blob);

        const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio: base64,
                lang1: LANG_NAMES[chosenA],
                lang2: LANG_NAMES[chosenB]
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        // data = { detectedLang, originalText, translatedText }

        if (!isConversationActive) return;

        // Determine which panel gets which text
        // If detected language matches chosenA → original on left, translation on right
        const detectedIsA = isLangMatch(data.detectedLang, chosenA);

        if (detectedIsA) {
            textA.textContent = data.originalText;
            textA.className = 'panel-text has-content';
            panelA.className = 'panel source-active';
            dotA.className = 'panel-dot on';
            textB.textContent = data.translatedText;
            textB.className = 'panel-text has-content';
            panelB.className = 'panel target-active';
            dotB.className = 'panel-dot pulsing';
        } else {
            textB.textContent = data.originalText;
            textB.className = 'panel-text has-content';
            panelB.className = 'panel source-active';
            dotB.className = 'panel-dot on';
            textA.textContent = data.translatedText;
            textA.className = 'panel-text has-content';
            panelA.className = 'panel target-active';
            dotA.className = 'panel-dot pulsing';
        }

        // Speak the translation
        const targetLangCode = detectedIsA ? chosenB : chosenA;
        speakTranslation(data.translatedText, LANG_LOCALE[targetLangCode]);

    } catch (err) {
        console.error('Translation error:', err);
        isTranslating = false;
        showError(err.message);
    }
}

function isLangMatch(detectedLang, langCode) {
    // detectedLang from Gemini could be "English", "en", "en-US", etc.
    const name = LANG_NAMES[langCode].toLowerCase();
    const detected = detectedLang.toLowerCase();
    return detected.includes(name) || detected.includes(langCode) || name.includes(detected);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            // Strip the "data:audio/webm;base64," prefix
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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
        if (isConversationActive) setMicState('listening');
    };
    utterance.onerror = (e) => {
        console.error('TTS error:', e);
        isSpeaking = false;
        if (isConversationActive) setMicState('listening');
    };
    synth.speak(utterance);
}

/* ── Reset / Change Languages ────────────────────────────── */
btnReset.addEventListener('click', () => {
    stopConversation();
    viewActive.classList.add('hidden');
    viewSetup.classList.remove('hidden');
});

/* ── Utilities ───────────────────────────────────────────── */
function showError(msg) {
    const panel = textA;
    panel.style.color = 'var(--destructive)';
    panel.textContent = '⚠ ' + msg;
    setTimeout(() => {
        panel.style.color = '';
        if (isConversationActive) {
            panel.textContent = '';
        }
    }, 3000);
}

// Pre-load voices (Chrome loads them async)
if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => synth.getVoices();
}
