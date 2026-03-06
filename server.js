import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT || 3000;
let apiCallCount = 0;

// Enable CORS and JSON parsing (increased limit for base64 audio)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// Initialize Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

// Endpoint to handle audio-based translation requests
app.post('/api/translate', async (req, res) => {
    apiCallCount++;
    console.log(`\n[AUDIT] Request #${apiCallCount} received at ${new Date().toISOString()}. Audio payload size: ${req.body?.audio?.length || 0} bytes.`);

    const { audio, lang1, lang2 } = req.body;

    if (!audio || !lang1 || !lang2) {
        return res.status(400).json({ error: 'Missing required parameters: audio, lang1, lang2' });
    }

    const prompt = `Listen to this audio. The users have selected two languages: ${lang1} and ${lang2}. Detect which of these two languages is being spoken in the audio. Transcribe the audio, and then translate it into the OTHER language. Also analyze the speaker's voice pitch and tone to infer their apparent gender as either "male", "female", or "unknown". Return ONLY a valid JSON object with this exact structure: {"detectedLang": "...", "speakerGender": "...", "originalText": "...", "translatedText": "..."}. If the audio is just background noise or too short to understand, return empty strings for the text fields rather than failing.`;

    const startTime = Date.now();
    try {
        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'audio/webm',
                    data: audio
                }
            }
        ]);
        console.log(`[AUDIT TIMER] Gemini responded in ${Date.now() - startTime}ms.`);

        let responseText = result.response.text().trim();

        console.log('\n--- [GEMINI RAW RESPONSE] ---');
        console.log(responseText);
        console.log('-----------------------------\n');

        // Strip markdown code fencing if present (```json ... ```)
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (parseErr) {
            // Gemini returned something that isn't valid JSON
            console.warn('[SERVER] Gemini returned non-JSON/invalid JSON:', responseText);
            console.warn('[SERVER] Returning safe fallback JSON.');
            return res.json({
                detectedLang: "unknown",
                speakerGender: "unknown",
                originalText: "",
                translatedText: ""
            });
        }

        return res.json(parsed);
    } catch (error) {
        console.log(`[AUDIT TIMER] Gemini failed in ${Date.now() - startTime}ms.`);

        // Log full error for debugging
        console.error('[SERVER] Gemini API error/Inference failure:', error.message || error);
        console.warn('[SERVER] Returning safe fallback JSON due to inference error.');
        return res.json({
            detectedLang: "unknown",
            speakerGender: "unknown",
            originalText: "",
            translatedText: ""
        });
    }
});

// Only start listening when run directly (not during tests)
const isMain = process.argv[1] === __filename;
if (isMain) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log('Make sure you have set GEMINI_API_KEY in your .env file');
    });
}
