import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import dotenv from "dotenv";
import crypto from "crypto";
import {
  clearOpenAIKey,
  cleanupExpiredAdminSessions,
  createAdminSession,
  deleteAdminSession,
  getAdminPasswordRecord,
  getAdminSession,
  resolveOpenAIKey,
  saveOpenAIKey,
  setAdminPassword,
  verifyPasswordRecord,
} from "./db";

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

type FacebookStoryPayload = {
  title?: string;
  summary?: string;
  category?: string;
  imageUrl?: string;
  portraitImageUrl?: string;
  storyCtaText?: string;
  pageName?: string;
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

const createStoryOverlaySvg = (payload: {
  title: string;
  summary: string;
  category: string;
  storyCtaText: string;
  pageName: string;
  isBreaking?: boolean;
}) => {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const wrapLine = (text: string, maxChars: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const titleLines = wrapLine(payload.title, 24).slice(0, 5);
  const summaryLines = wrapLine(payload.summary, 38).slice(0, 5);
  const titleStartY = payload.isBreaking ? 248 : 188;
  const summaryStartY = titleStartY + titleLines.length * 78 + 28;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.1)" />
          <stop offset="55%" stop-color="rgba(0,0,0,0.2)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.88)" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="#0b0b0f" />
      <rect width="1080" height="1920" fill="url(#fade)" />
      <rect x="72" y="84" width="180" height="6" rx="3" fill="rgba(255,255,255,0.92)" />
      <text x="72" y="138" fill="rgba(255,255,255,0.76)" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escape(payload.category.toUpperCase())}</text>
      ${payload.isBreaking ? `<rect x="72" y="160" width="190" height="48" rx="10" fill="#dc2626" />` : ''}
      ${payload.isBreaking ? `<text x="98" y="194" fill="#ffffff" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="700">BREAKING</text>` : ''}
      ${titleLines
        .map(
          (line, index) =>
            `<text x="72" y="${titleStartY + index * 78}" fill="#ffffff" font-size="68" font-family="Georgia, 'Times New Roman', serif" font-weight="700">${escape(line)}</text>`
        )
        .join('')}
      ${summaryLines
        .map(
          (line, index) =>
            `<text x="72" y="${summaryStartY + index * 46}" fill="rgba(255,255,255,0.9)" font-size="34" font-family="Arial, Helvetica, sans-serif">${escape(line)}</text>`
        )
        .join('')}
      <text x="72" y="1770" fill="rgba(255,255,255,0.82)" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escape(payload.storyCtaText.toUpperCase())}</text>
      <text x="72" y="1812" fill="rgba(255,255,255,0.8)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escape(payload.pageName)}</text>
    </svg>
  `;
};

const renderStoryImage = async (payload: FacebookStoryPayload & { isBreaking?: boolean }) => {
  const bgUrl = payload.portraitImageUrl || payload.imageUrl;
  if (!bgUrl) {
    throw new Error('Missing story background image');
  }

  const imageResponse = await fetch(bgUrl);
  if (!imageResponse.ok) {
    throw new Error('Failed to load story background image');
  }

  const bgBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const base = sharp(bgBuffer).resize(1080, 1920, { fit: 'cover' });
  const overlay = Buffer.from(
    createStoryOverlaySvg({
      title: payload.title || 'Story',
      summary: payload.summary || '',
      category: payload.category || 'News',
      storyCtaText: payload.storyCtaText || 'Swipe to read',
      pageName: payload.pageName || 'jshubnetwork',
      isBreaking: payload.isBreaking,
    })
  );

  return base
    .composite([{ input: overlay }])
    .jpeg({ quality: 92 })
    .toBuffer();
};

const uploadFacebookStory = async (payload: FacebookStoryPayload & { isBreaking?: boolean }) => {
  const pageId = payload.pageId?.trim();
  const pageAccessToken = payload.pageAccessToken?.trim();

  if (!pageId || !pageAccessToken) {
    throw new Error('Missing Meta page credentials.');
  }

  const storyBuffer = await renderStoryImage(payload);
  const form = new FormData();
  form.append('source', new Blob([storyBuffer], { type: 'image/jpeg' }), 'facebook-story.jpg');
  form.append('published', 'false');

  const uploadUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/photos`);
  uploadUrl.searchParams.set('access_token', pageAccessToken);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
  });
  const uploadData = await safeReadJson(uploadResponse);
  if (!uploadResponse.ok) {
    throw new Error(uploadData?.error?.message || 'Failed to upload story image.');
  }

  const photoId = uploadData?.id || uploadData?.photo_id;
  if (!photoId) {
    throw new Error('Facebook did not return a photo id.');
  }

  const storyUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/photo_stories`);
  storyUrl.searchParams.set('access_token', pageAccessToken);
  storyUrl.searchParams.set('attached_media', JSON.stringify([{ media_fbid: photoId }]));

  const storyResponse = await fetch(storyUrl, {
    method: 'POST',
  });
  const storyData = await safeReadJson(storyResponse);
  if (!storyResponse.ok) {
    throw new Error(storyData?.error?.message || 'Failed to publish Facebook story.');
  }

  return storyData;
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const getBearerToken = (req: express.Request) => {
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match?.[1] || null;
  };

  const requireAdmin = async (req: express.Request, res: express.Response) => {
    await cleanupExpiredAdminSessions();
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ authenticated: false, message: 'Not authenticated' });
      return null;
    }

    const session = await getAdminSession(token);
    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      if (session) {
        await deleteAdminSession(token);
      }
      res.status(401).json({ authenticated: false, message: 'Session expired' });
      return null;
    }

    return token;
  };

  app.get("/api/admin/me", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.json({ authenticated: false });
    }

    const session = await getAdminSession(token);
    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      if (session) {
        await deleteAdminSession(token);
      }
      return res.json({ authenticated: false });
    }

    return res.json({ authenticated: true });
  });

  app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (username !== 'admin' || !password) {
      return res.status(400).json({
        authenticated: false,
        message: 'Invalid credentials.',
      });
    }

    try {
      const record = await getAdminPasswordRecord();
      const ok = verifyPasswordRecord(password, record);
      if (!ok) {
        return res.status(401).json({
          authenticated: false,
          message: 'Invalid username or password.',
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
      await createAdminSession(token, expiresAt);

      return res.json({
        authenticated: true,
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Admin login failed:", error);
      return res.status(500).json({
        authenticated: false,
        message: error.message || 'Admin login failed.',
      });
    }
  });

  app.post("/api/admin/logout", async (req, res) => {
    const token = getBearerToken(req);
    if (token) {
      await deleteAdminSession(token);
    }

    return res.json({ loggedOut: true });
  });

  app.post("/api/admin/password", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        updated: false,
        message: 'Current and new passwords are required.',
      });
    }

    try {
      const record = await getAdminPasswordRecord();
      if (!verifyPasswordRecord(currentPassword, record)) {
        return res.status(401).json({
          updated: false,
          message: 'Current password is incorrect.',
        });
      }

      await setAdminPassword(newPassword);
      await deleteAdminSession(token);
      return res.json({
        updated: true,
        message: 'Password updated. Please log in again.',
      });
    } catch (error: any) {
      console.error("Password update failed:", error);
      return res.status(500).json({
        updated: false,
        message: error.message || 'Password update failed.',
      });
    }
  });

  app.post("/api/admin/openai-key", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

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
    const token = await requireAdmin(_req, res);
    if (!token) return;

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

  app.post("/api/meta/publish-story", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    const payload = req.body as FacebookStoryPayload;
    const pageId = payload.pageId?.trim();
    const pageAccessToken = payload.pageAccessToken?.trim();

    if (!pageId || !pageAccessToken) {
      return res.status(400).json({
        published: false,
        message: "Missing Meta credentials.",
      });
    }

    if (!payload.title || (!payload.imageUrl && !payload.portraitImageUrl)) {
      return res.status(400).json({
        published: false,
        message: "Missing story content.",
      });
    }

    try {
      const result = await uploadFacebookStory({
        ...payload,
        pageId,
        pageAccessToken,
      });

      return res.json({
        published: true,
        result,
      });
    } catch (error: any) {
      console.error("Facebook story publish failed:", error);
      return res.status(500).json({
        published: false,
        message: error.message || "Facebook story publish failed.",
        error: error.message || "Facebook story publish failed.",
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
