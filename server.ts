import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // API Route for AI Status Check
  app.get("/api/ai-status", async (req, res) => {
    const clientKey = req.headers['x-openai-key'] as string;
    const apiKey = clientKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      // If no OpenAI key, check if Gemini is available as a fallback
      const hasGemini = !!process.env.GEMINI_API_KEY;
      return res.json({ 
        connected: hasGemini, 
        model: hasGemini ? "gemini-2.0-flash" : "None", 
        provider: hasGemini ? "Gemini (Fallback)" : "None" 
      });
    }

    try {
      const testOpenai = new OpenAI({ apiKey });
      await testOpenai.models.list();
      res.json({ 
        connected: true,
        model: "gpt-4o",
        provider: "OpenAI",
        isClientKey: !!clientKey
      });
    } catch (error) {
      const hasGemini = !!process.env.GEMINI_API_KEY;
      res.json({ 
        connected: hasGemini, 
        model: hasGemini ? "gemini-2.0-flash" : "gpt-4o", 
        provider: hasGemini ? "Gemini (Fallback)" : "OpenAI",
        error: "Invalid OpenAI Key" 
      });
    }
  });

  // API Route for News Generation
  app.post("/api/generate", async (req, res) => {
    const { category } = req.body;
    const clientKey = req.headers['x-openai-key'] as string;
    const apiKey = clientKey || process.env.OPENAI_API_KEY;

    const generateWithGemini = async () => {
      const prompt = `You are a professional news editor for Nova News. Return a JSON object with title, summary, content (markdown), author, and imageKeyword. Generate a high-quality news article for the category: ${category}. Suggest a realistic author name and a descriptive keyword for an image. Return ONLY the JSON object.`;
      const result = await geminiModel.generateContent(prompt);
      const text = result.response.text();
      // Clean up potential markdown code blocks
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    };

    try {
      if (!apiKey) {
        throw new Error("NO_OPENAI_KEY");
      }

      const activeOpenai = clientKey ? new OpenAI({ apiKey }) : openai;
      const response = await activeOpenai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional news editor for Nova News. Return a JSON object with title, summary, content (markdown), author, and imageKeyword."
          },
          {
            role: "user",
            content: `Generate a high-quality news article for the category: ${category}. Suggest a realistic author name and a descriptive keyword for an image.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const data = JSON.parse(response.choices[0].message.content || "{}");
      
      res.json({
        ...data,
        category,
        publishedAt: new Date().toISOString(),
        imageUrl: `https://picsum.photos/seed/${encodeURIComponent(data.imageKeyword || 'news')}/1200/800`,
        provider: "OpenAI"
      });
    } catch (error: any) {
      console.error("AI Error:", error);
      
      // Fallback to Gemini if OpenAI fails due to quota or missing key
      if (error.status === 429 || error.message === "NO_OPENAI_KEY" || error.message?.includes("quota")) {
        try {
          console.log("Falling back to Gemini...");
          const data = await generateWithGemini();
          return res.json({
            ...data,
            category,
            publishedAt: new Date().toISOString(),
            imageUrl: `https://picsum.photos/seed/${encodeURIComponent(data.imageKeyword || 'news')}/1200/800`,
            provider: "Gemini (Fallback)",
            warning: "OpenAI quota exceeded. Used Gemini fallback."
          });
        } catch (geminiError: any) {
          return res.status(500).json({ 
            error: "All AI providers failed",
            message: "OpenAI quota exceeded and Gemini fallback failed: " + geminiError.message 
          });
        }
      }

      res.status(error.status || 500).json({ 
        error: "Generation Failed",
        message: error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
