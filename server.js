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

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// Initialize Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Endpoint to handle translation requests
app.post('/api/translate', async (req, res) => {
    const { text, source_language, target_language } = req.body;

    if (!text || !source_language || !target_language) {
        return res.status(400).json({ error: 'Missing required parameters: text, source_language, target_language' });
    }

    const prompt = `You are a professional translator. Translate this exact text: "${text}" from ${source_language} to ${target_language}. Return ONLY the translated string, with no quotes, markdown, or conversational filler.`;

    try {
        const result = await model.generateContent(prompt);
        const translatedText = result.response.text().trim();
        return res.json({ text: translatedText });
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
