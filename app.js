/* ─────────────────────────────────────────────────────────
   Voxify – Continuous Audio Translator
   Uses MediaRecorder + silence detection + Gemini Multimodal API
   ───────────────────────────────────────────────────────── */

let fetchCount = 0;
let recentFetches = [];

/* ── Language Maps ──────────────────────────────────────── */
const LANG_NAMES = {
    ar: 'Arabic', zh: 'Chinese', hr: 'Croatian', en: 'English',
    fr: 'French', de: 'German', hi: 'Hindi', it: 'Italian',
    ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian',
    es: 'Spanish', ta: 'Tamil'
};

const LANG_LOCALE = {
    ar: 'ar-SA', zh: 'zh-CN', hr: 'hr-HR', en: 'en-US',
    fr: 'fr-FR', de: 'de-DE', hi: 'hi-IN', it: 'it-IT',
    ja: 'ja-JP', ko: 'ko-KR', pt: 'pt-BR', ru: 'ru-RU',
    es: 'es-ES', ta: 'ta-IN'
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
let isRecordingToBuffer = false; // Add state variable for speech-end detection

const SILENCE_THRESHOLD = 0.025;   // RMS below this = silence (raised to avoid background noise false positives)
const SILENCE_DURATION = 2000;     // ms of silence before we stop recording and send (changed to 2s)
const MIN_RECORDING_MS = 1000;     // reset back to a smaller number since chunks are dynamically sized based on actual speech duration
const SPEAKING_VOLUME_THRESHOLD = 0.05; // RMS must hit this once to trigger recording
const MIN_BLOB_BYTES = 1000;       // ignore audio blobs smaller than ~1KB
let recordingStartTime = 0;
let maxVolumeDuringRecording = 0;

/* ── Speech Synthesis + Voice Selection ───────────────────── */
const synth = window.speechSynthesis;
let cachedVoices = [];
const PREMIUM_KEYWORDS = ['google', 'premium', 'enhanced', 'natural'];

// Known voice-name hints for gender matching
const MALE_HINTS = ['male', 'boy', 'david', 'mark', 'daniel', 'james', 'guy', 'thomas', 'luca', 'jorge', 'yuri', 'andrei'];
const FEMALE_HINTS = ['female', 'girl', 'zira', 'samantha', 'victoria', 'karen', 'moira', 'fiona', 'paulina', 'helena', 'elsa', 'google us english'];

// Load voices reliably (Chrome fires onvoiceschanged async)
function loadVoices() {
    return new Promise((resolve) => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
            cachedVoices = voices;
            resolve(voices);
            return;
        }
        // Wait for the async event
        synth.onvoiceschanged = () => {
            cachedVoices = synth.getVoices();
            resolve(cachedVoices);
        };
    });
}

// Kick off voice loading immediately
loadVoices();

/**
 * Guess gender from a voice name using heuristic keyword matching.
 * Returns 'male', 'female', or null.
 */
function guessVoiceGender(voiceName) {
    const n = voiceName.toLowerCase();
    if (MALE_HINTS.some(h => n.includes(h))) return 'male';
    if (FEMALE_HINTS.some(h => n.includes(h))) return 'female';
    return null;
}

/**
 * Pick the best available voice for a locale, optionally matching gender.
 * Priority: premium + gender match > any gender match > premium > first match.
 */
function getBestVoice(locale, gender) {
    const langPrefix = locale.split('-')[0];
    // All voices that match the exact locale or at least the language prefix
    const matching = cachedVoices.filter(
        v => v.lang === locale || v.lang.startsWith(langPrefix)
    );
    if (matching.length === 0) return null;

    const isPremium = (v) => {
        const name = v.name.toLowerCase();
        return PREMIUM_KEYWORDS.some(kw => name.includes(kw));
    };
    const matchesGender = (v) => guessVoiceGender(v.name) === gender;

    if (gender && gender !== 'unknown') {
        // 1. Premium + correct gender
        const premiumGender = matching.find(v => isPremium(v) && matchesGender(v));
        if (premiumGender) return premiumGender;

        // 2. Any voice with correct gender
        const anyGender = matching.find(v => matchesGender(v));
        if (anyGender) return anyGender;
    }

    // 3. Best premium (gender-agnostic)
    const premium = matching.find(v => isPremium(v));
    if (premium) return premium;

    // 4. First available
    return matching[0];
}

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
        translating: 'Processing...', speaking: 'Speaking...'
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

    // Initial setup: start monitoring for volume spikes
    setMicState('listening');
    monitorSilence();
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
    isRecordingToBuffer = false;

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
    maxVolumeDuringRecording = 0; // Reset max volume for this new chunk

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
        console.log(`[Mic] Recording stopped. Elapsed: ${elapsed}ms. Chunks: ${recordedChunks.length}. Max Vol: ${maxVolumeDuringRecording.toFixed(4)}`);

        // Reset recording state
        isRecordingToBuffer = false;

        if (elapsed < MIN_RECORDING_MS) {
            console.warn(`[Mic] Audio chunk too short (${elapsed}ms < ${MIN_RECORDING_MS}ms), ignoring.`);
            // Don't auto-restart, let the monitor loop detect speech again
            return;
        }

        if (recordedChunks.length === 0) {
            console.warn(`[Mic] No speech chunks, ignoring.`);
            return;
        }

        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        recordedChunks = [];

        // Skip tiny blobs that are likely just noise
        if (blob.size < MIN_BLOB_BYTES) {
            console.warn(`[Mic] Audio blob too small (${blob.size} bytes), ignoring.`);
            return;
        }

        // Send to backend, don't restart recording - we're in 'Translating...' state now
        sendAudioForTranslation(blob);
    };

    mediaRecorder.start(250); // collect data in 250ms intervals
    recordingStartTime = Date.now();
    console.log(`[Mic] Speech detected - Recording started at ${new Date(recordingStartTime).toISOString()}`);
    setMicState('hearing');
}

function monitorSilence() {
    if (!analyserNode || !isConversationActive) return;

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    function check() {
        if (!isConversationActive) return;

        // Skip audio processing if we are currently translating or speaking
        if (isTranslating || isSpeaking) {
            // Cancel any ongoing recording/timers during translation
            if (isRecordingToBuffer) {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
                isRecordingToBuffer = false;
            }
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            animFrameId = requestAnimationFrame(check);
            return;
        }

        analyserNode.getByteTimeDomainData(dataArray);

        // Compute RMS
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // Track max volume if we are actively recording
        if (isRecordingToBuffer && rms > maxVolumeDuringRecording) {
            maxVolumeDuringRecording = rms;
        }

        // TRIGGER START: Sustained loud volume (speaking)
        if (rms > SPEAKING_VOLUME_THRESHOLD && !isRecordingToBuffer) {
            // User started talking, begin recording!
            isRecordingToBuffer = true;
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            startRecording();
        }
        // MAINTAIN RECORDING: User is talking, don't let silence timers fire
        else if (isRecordingToBuffer && rms > SILENCE_THRESHOLD) {
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        }
        // TRIGGER STOP: Volume fell below silence threshold during an active recording
        else if (isRecordingToBuffer && rms <= SILENCE_THRESHOLD) {
            if (!silenceTimer) {
                // Start a countdown. If they stay quiet for SILENCE_DURATION, stop and send.
                silenceTimer = setTimeout(() => {
                    silenceTimer = null;
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        // The onstop event will handle sending to the backend
                        mediaRecorder.stop();
                    }
                }, SILENCE_DURATION);
            }
        }

        animFrameId = requestAnimationFrame(check);
    }

    animFrameId = requestAnimationFrame(check);
}

/* ── Send Audio to Backend ───────────────────────────────── */
async function sendAudioForTranslation(blob) {
    // Audit Brake Mechanism: Max 5 requests per 10 seconds
    const now = Date.now();
    recentFetches.push(now);
    recentFetches = recentFetches.filter(t => now - t <= 10000); // 10s window

    if (recentFetches.length > 5) {
        console.error('SPAM DETECTED: Halting recording loop. More than 5 requests fired in 10 seconds.');
        // Unilaterally abort recording session
        stopConversation();
        return; // Kill the cascade right here
    }

    fetchCount++;
    console.warn(`[FRONTEND AUDIT] Sending fetch #${fetchCount} to server at ${new Date(now).toISOString()}. Reason: True speech-end detected and threshold met.`);

    isTranslating = true;
    setMicState('translating');

    textA.textContent = '…';
    textA.className = 'panel-text listening';
    textB.textContent = '…';
    textB.className = 'panel-text listening';

    try {
        // Convert blob to base64
        const base64 = await blobToBase64(blob);

        console.log(`[API] Sending audio payload to backend. Size: ~${Math.round(base64.length / 1024)}KB.`);

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
            // Any error from the translate endpoint = audio issue
            // Silently continue listening instead of showing a scary error
            console.warn('Translation request failed, continuing...', res.status, err.details || err.error);
            isTranslating = false;
            if (isConversationActive) setMicState('listening');
            return;
        }

        const data = await res.json();
        // data = { detectedLang, speakerGender, originalText, translatedText }

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

        // Speak the translation with gender-matched voice
        const targetLangCode = detectedIsA ? chosenB : chosenA;
        speakTranslation(data.translatedText, LANG_LOCALE[targetLangCode], data.speakerGender);

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

/* ── Speak Translation ───────────────────────────────────── */
function speakTranslation(text, locale, gender) {
    isTranslating = false;
    isSpeaking = true;
    setMicState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;

    const voice = getBestVoice(locale, gender);
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

