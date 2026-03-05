import { jest } from '@jest/globals';

// --- Mock @google/generative-ai BEFORE importing server ---
const mockText = jest.fn();
const mockGenerateContent = jest.fn();

jest.unstable_mockModule('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
            generateContent: mockGenerateContent,
        })),
    })),
}));

// Dynamically import AFTER mock is registered
const { default: request } = await import('supertest');
const { app } = await import('./server.js');

// ─────────────────────────────────────────────────────────────
// Helper: configure mockGenerateContent to return a response
// ─────────────────────────────────────────────────────────────
function setupSuccessfulTranslation(jsonResponse) {
    mockGenerateContent.mockResolvedValueOnce({
        response: {
            text: () => JSON.stringify(jsonResponse),
        },
    });
}

// A minimal valid base64 string to act as audio data
const FAKE_AUDIO = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
describe('POST /api/translate', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // ── Happy path ──────────────────────────────────────────
    test('returns parsed JSON for a valid audio request', async () => {
        const geminiResponse = {
            detectedLang: 'English',
            speakerGender: 'male',
            originalText: 'Hello',
            translatedText: 'Hola'
        };
        setupSuccessfulTranslation(geminiResponse);

        const res = await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang1: 'English', lang2: 'Spanish' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(geminiResponse);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    test('handles markdown-fenced JSON from Gemini', async () => {
        // Simulate Gemini wrapping the JSON in ```json ... ```
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () => '```json\n{"detectedLang":"French","speakerGender":"female","originalText":"Bonjour","translatedText":"Hello"}\n```',
            },
        });

        const res = await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang1: 'English', lang2: 'French' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            detectedLang: 'French',
            speakerGender: 'female',
            originalText: 'Bonjour',
            translatedText: 'Hello'
        });
    });

    test('passes audio data and language pair to Gemini', async () => {
        setupSuccessfulTranslation({
            detectedLang: 'English',
            speakerGender: 'male',
            originalText: 'Hi',
            translatedText: 'Ciao'
        });

        await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang1: 'English', lang2: 'Italian' });

        const calledArgs = mockGenerateContent.mock.calls[0][0];
        // Should be an array with a text part and an inlineData part
        expect(Array.isArray(calledArgs)).toBe(true);
        expect(calledArgs.length).toBe(2);

        // Text prompt should contain the languages
        expect(calledArgs[0].text).toContain('English');
        expect(calledArgs[0].text).toContain('Italian');

        // Audio data should be passed as inlineData
        expect(calledArgs[1].inlineData.mimeType).toBe('audio/webm');
        expect(calledArgs[1].inlineData.data).toBe(FAKE_AUDIO);
    });

    // ── Validation errors ───────────────────────────────────
    test('returns 400 when "audio" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ lang1: 'English', lang2: 'Spanish' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test('returns 400 when "lang1" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang2: 'Spanish' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
    });

    test('returns 400 when "lang2" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang1: 'English' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
    });

    test('returns 400 when body is completely empty', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({});

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
    });

    // ── Gemini API error ────────────────────────────────────
    test('returns 500 when the Gemini API throws an error', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('Gemini quota exceeded'));

        const res = await request(app)
            .post('/api/translate')
            .send({ audio: FAKE_AUDIO, lang1: 'English', lang2: 'German' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toMatch(/error occurred during translation/i);
        expect(res.body.details).toBe('Gemini quota exceeded');
    });
});
