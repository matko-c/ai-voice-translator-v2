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

// Enable CORS and JSON parsing (increased limit for base64 audio)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// Initialize Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Endpoint to handle audio-based translation requests
app.post('/api/translate', async (req, res) => {
    const { audio, lang1, lang2 } = req.body;

    if (!audio || !lang1 || !lang2) {
        return res.status(400).json({ error: 'Missing required parameters: audio, lang1, lang2' });
    }

    const prompt = `Listen to this audio. The users have selected two languages: ${lang1} and ${lang2}. Detect which of these two languages is being spoken in the audio. Transcribe the audio, and then translate it into the OTHER language. Also analyze the speaker's voice pitch and tone to infer their apparent gender. Return ONLY a JSON object with this exact structure: {"detectedLang": "...", "speakerGender": "male" | "female" | "unknown", "originalText": "...", "translatedText": "..."}`;

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

        let responseText = result.response.text().trim();

        // Strip markdown code fencing if present (```json ... ```)
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (parseErr) {
            // Gemini returned something that isn't valid JSON (e.g. "I cannot understand the audio")
            console.warn('Gemini returned non-JSON:', responseText);
            return res.status(422).json({
                error: 'Could not understand audio. Please speak more clearly.',
                details: responseText
            });
        }

        return res.json(parsed);
    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({
            error: 'An error occurred during translation.',
            details: error.message
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
