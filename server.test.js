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
function setupSuccessfulTranslation(translatedText) {
    mockGenerateContent.mockResolvedValueOnce({
        response: {
            text: () => translatedText,
        },
    });
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
describe('POST /api/translate', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // ── Happy path ──────────────────────────────────────────
    test('returns translated text for a valid request', async () => {
        setupSuccessfulTranslation('Hola');

        const res = await request(app)
            .post('/api/translate')
            .send({ text: 'Hello', source_language: 'English', target_language: 'Spanish' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ text: 'Hola' });
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    test('strips leading/trailing whitespace from the Gemini response', async () => {
        setupSuccessfulTranslation('  Bonjour  ');

        const res = await request(app)
            .post('/api/translate')
            .send({ text: 'Hello', source_language: 'English', target_language: 'French' });

        expect(res.statusCode).toBe(200);
        expect(res.body.text).toBe('Bonjour');
    });

    test('passes the correct prompt to the Gemini model', async () => {
        setupSuccessfulTranslation('Ciao');

        await request(app)
            .post('/api/translate')
            .send({ text: 'Hello', source_language: 'English', target_language: 'Italian' });

        const calledPrompt = mockGenerateContent.mock.calls[0][0];
        expect(calledPrompt).toContain('"Hello"');
        expect(calledPrompt).toContain('English');
        expect(calledPrompt).toContain('Italian');
        expect(calledPrompt).toContain('Return ONLY the translated string');
    });

    // ── Validation errors ───────────────────────────────────
    test('returns 400 when "text" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ source_language: 'English', target_language: 'Spanish' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    test('returns 400 when "source_language" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ text: 'Hello', target_language: 'Spanish' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/missing required parameters/i);
    });

    test('returns 400 when "target_language" is missing', async () => {
        const res = await request(app)
            .post('/api/translate')
            .send({ text: 'Hello', source_language: 'English' });

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
            .send({ text: 'Hello', source_language: 'English', target_language: 'German' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toMatch(/error occurred during translation/i);
        expect(res.body.details).toBe('Gemini quota exceeded');
    });
});
