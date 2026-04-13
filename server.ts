import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { clearOpenAIKey, resolveOpenAIKey, saveOpenAIKey } from "./db";

dotenv.config();

type AiConfig = {
  ctaText?: string;
  tone?: 'urgent' | 'bold' | 'inspiring' | 'investigative';
  imageStyle?: 'editorial' | 'dramatic' | 'modern' | 'clean';
};

type MetaConfig = {
  appId?: string;
  appSecret?: string;
  pageId?: string;
  pageAccessToken?: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'news';

const buildArticlePrompt = (category: string, aiConfig?: AiConfig) => {
  const tone = aiConfig?.tone || 'bold';
  const ctaText = aiConfig?.ctaText || 'Read the full story';
  return `
You are a viral but credible news editor for Nova News.
Write accurate, engaging, high-retention news articles with a strong hook, a clear takeaway, and a subtle CTA at the end.
Tone: ${tone}.
Include this CTA naturally in the closing section: "${ctaText}".
Return ONLY a JSON object with title, summary, content (markdown), author, imageKeyword, and imageSubject.

Category: ${category}
`;
};

const buildImagePrompt = (
  title: string,
  summary?: string,
  category?: string,
  imageKeyword?: string,
  imageSubject?: string,
  imagePrompt?: string,
  aiConfig?: AiConfig
) => {
  const style = aiConfig?.imageStyle || 'editorial';
  return `
Create a ${style} news cover photo that clearly matches this headline:
"${title}"

Article summary:
${summary || 'No summary provided.'}

Category:
${category || 'News'}

Use this visual keyword as the main subject if it helps:
${imageKeyword || 'news scene'}

Primary visual subject:
${imageSubject || imageKeyword || 'headline-related news subject'}

User image prompt:
${imagePrompt || 'No custom prompt provided.'}

Requirements:
- Depict the main event, subject, or consequence of the headline directly.
- Make the image obviously related to the title at a glance.
- Follow the user image prompt closely when it does not conflict with the headline.
- Use only subjects that are supported by the headline or summary.
- Do not invent animals, mascots, fantasy symbols, or unrelated props.
- Avoid generic stock-photo composition.
- No text overlays, logos, watermarks, or unrelated scenery.
- Keep the scene realistic, editorial, and shareable.
`.trim();
};

const buildImageFallbackPrompt = (title: string, summary?: string, category?: string, imageSubject?: string, imagePrompt?: string) => {
  return `
Generate a realistic editorial photo for the news story titled "${title}".
Summary: ${summary || 'No summary provided.'}
Category: ${category || 'News'}
Primary subject: ${imageSubject || 'headline-related people, place, or event'}
User image prompt: ${imagePrompt || 'No custom prompt provided.'}

The image must show the real-world subject implied by the headline and must not include animals, mascots, or unrelated scenery unless the headline explicitly says so.
`.trim();
};

const buildPortraitImagePrompt = (
  title: string,
  summary?: string,
  category?: string,
  imageKeyword?: string,
  imageSubject?: string,
  imagePrompt?: string,
  aiConfig?: AiConfig
) => {
  const style = aiConfig?.imageStyle || 'editorial';
  return `
Create a ${style} vertical 9:16 news story image for social sharing.
Headline:
"${title}"

Article summary:
${summary || 'No summary provided.'}

Category:
${category || 'News'}

Main visual subject:
${imageSubject || imageKeyword || 'headline-related subject'}

User image prompt:
${imagePrompt || 'No custom prompt provided.'}

Requirements:
- Format the image in a vertical 9:16 composition.
- Keep the subject clearly related to the headline.
- Leave some clean space for a title overlay.
- Avoid text, logos, watermarks, or unrelated objects.
- Do not invent animals, mascots, or fantasy details unless they are explicitly part of the story.
- Make it look like a premium story graphic for social sharing.
`.trim();
};

const generateImageUrl = async (
  client: OpenAI,
  prompt: string,
  size: '1792x1024' | '1024x1792'
) => {
  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    size,
    response_format: "url",
  });

  return response.data?.[0]?.url || '';
};

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v24.0";

const safeReadJson = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  app.post("/api/admin/openai-key", async (req, res) => {
    const { apiKey } = req.body as { apiKey?: string };

    if (!apiKey?.trim()) {
      return res.status(400).json({
        saved: false,
        message: "Missing OpenAI API key.",
      });
    }

    try {
      await saveOpenAIKey(apiKey.trim());
      return res.json({
        saved: true,
        source: "database",
      });
    } catch (error: any) {
      console.error("Failed to save OpenAI key:", error);
      return res.status(500).json({
        saved: false,
        message: error.message || "Failed to save OpenAI key.",
      });
    }
  });

  app.delete("/api/admin/openai-key", async (_req, res) => {
    try {
      await clearOpenAIKey();
      return res.json({
        deleted: true,
        source: "none",
      });
    } catch (error: any) {
      console.error("Failed to clear OpenAI key:", error);
      return res.status(500).json({
        deleted: false,
        message: error.message || "Failed to clear OpenAI key.",
      });
    }
  });

  // API Route for AI Status Check
  app.get("/api/ai-status", async (req, res) => {
    const { key: apiKey, source } = await resolveOpenAIKey();
    
    if (!apiKey) {
      // If no OpenAI key, check if Gemini is available as a fallback
      const hasGemini = !!process.env.GEMINI_API_KEY;
      return res.json({ 
        connected: hasGemini, 
        model: hasGemini ? "gemini-2.0-flash" : "None", 
        provider: hasGemini ? "Gemini (Fallback)" : "None",
        keySource: source,
      });
    }

    try {
      const testOpenai = new OpenAI({ apiKey });
      await testOpenai.models.list();
      res.json({ 
        connected: true,
        model: "gpt-4o",
        provider: source === "database" ? "OpenAI (Database)" : "OpenAI (Environment)",
        keySource: source
      });
    } catch (error) {
      const hasGemini = !!process.env.GEMINI_API_KEY;
      res.json({ 
        connected: hasGemini, 
        model: hasGemini ? "gemini-2.0-flash" : "gpt-4o", 
        provider: hasGemini ? "Gemini (Fallback)" : "OpenAI",
        error: "Invalid OpenAI Key",
        keySource: source,
      });
    }
  });

  // API Route for News Generation
  app.post("/api/generate", async (req, res) => {
    const { category, aiConfig, imagePrompt: userImagePrompt } = req.body as { category: string; aiConfig?: AiConfig; imagePrompt?: string };
    const { key: apiKey } = await resolveOpenAIKey();

    const generateWithGemini = async () => {
      const prompt = buildArticlePrompt(category, aiConfig);
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

      const activeOpenai = new OpenAI({ apiKey });
      const response = await activeOpenai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: buildArticlePrompt(category, aiConfig)
          },
          {
            role: "user",
            content: `Generate the article now. Make it sharp, shareable, and optimized for the audience.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const data = JSON.parse(response.choices[0].message.content || "{}");
      const imageSubject = data.imageSubject || data.imageKeyword || data.title || category;
      const generatedImagePrompt = buildImagePrompt(
        data.title || category,
        data.summary,
        category,
        data.imageKeyword,
        imageSubject,
        userImagePrompt,
        aiConfig
      );
      const generatedPortraitPrompt = buildPortraitImagePrompt(
        data.title || category,
        data.summary,
        category,
        data.imageKeyword,
        imageSubject,
        userImagePrompt,
        aiConfig
      );
      let imageUrl = `https://picsum.photos/seed/${encodeURIComponent(slugify(data.title || category))}/1200/800`;
      let portraitImageUrl = `https://picsum.photos/seed/${encodeURIComponent(`${slugify(data.title || category)}-portrait`)}/1024/1792`;

      try {
        const generatedImage = await generateImageUrl(activeOpenai, generatedImagePrompt, "1792x1024");
        if (generatedImage) {
          imageUrl = generatedImage;
        }
      } catch (imageError) {
        console.warn("Image generation failed, retrying with stricter prompt:", imageError);
        try {
          const fallbackImage = await generateImageUrl(
            activeOpenai,
            buildImageFallbackPrompt(data.title || category, data.summary, category, imageSubject, userImagePrompt),
            "1792x1024"
          );
          if (fallbackImage) {
            imageUrl = fallbackImage;
          }
        } catch (fallbackError) {
          console.warn("Fallback image generation also failed, using placeholder:", fallbackError);
        }
      }

      try {
        const generatedPortraitImage = await generateImageUrl(activeOpenai, generatedPortraitPrompt, "1024x1792");
        if (generatedPortraitImage) {
          portraitImageUrl = generatedPortraitImage;
        }
      } catch (portraitError) {
        console.warn("Portrait image generation failed, using placeholder:", portraitError);
      }
      
      res.json({
        ...data,
        category,
        publishedAt: new Date().toISOString(),
        imageUrl,
        portraitImageUrl,
        imageSubject,
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
            imageUrl: `https://picsum.photos/seed/${encodeURIComponent(slugify(data.title || category))}/1200/800`,
            portraitImageUrl: `https://picsum.photos/seed/${encodeURIComponent(`${slugify(data.title || category)}-portrait`)}/1024/1792`,
            imageSubject: data.imageSubject || data.imageKeyword || data.title || category,
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

  app.post("/api/meta/test-connection", async (req, res) => {
    const { appId, appSecret, pageId, pageAccessToken } = req.body as MetaConfig;

    if (!appId || !appSecret || !pageId || !pageAccessToken) {
      return res.status(400).json({
        connected: false,
        message: "Missing Meta credentials.",
      });
    }

    try {
      const debugTokenUrl = new URL(`https://graph.facebook.com/debug_token`);
      debugTokenUrl.searchParams.set("input_token", pageAccessToken);
      debugTokenUrl.searchParams.set("access_token", `${appId}|${appSecret}`);

      const debugTokenResponse = await fetch(debugTokenUrl);
      const debugTokenData = await safeReadJson(debugTokenResponse);

      if (!debugTokenResponse.ok || !debugTokenData?.data?.is_valid) {
        return res.status(400).json({
          connected: false,
          message: debugTokenData?.error?.message || "Invalid Meta token.",
          debug: debugTokenData,
        });
      }

      const pageUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}`);
      pageUrl.searchParams.set("fields", "id,name");
      pageUrl.searchParams.set("access_token", pageAccessToken);

      const pageResponse = await fetch(pageUrl);
      const pageData = await safeReadJson(pageResponse);

      if (!pageResponse.ok) {
        return res.status(400).json({
          connected: false,
          message: pageData?.error?.message || "Could not load the Facebook Page.",
          debug: pageData,
        });
      }

      return res.json({
        connected: true,
        pageId: pageData.id,
        pageName: pageData.name,
        tokenType: debugTokenData?.data?.type,
        scopes: debugTokenData?.data?.scopes || [],
        message: "Meta credentials verified.",
      });
    } catch (error: any) {
      console.error("Meta connection test failed:", error);
      return res.status(500).json({
        connected: false,
        message: error.message || "Meta connection test failed.",
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
