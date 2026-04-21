import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import OpenAI from "openai";
import { chromium, type BrowserContext, type Page } from "playwright";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import dotenv from "dotenv";
import crypto from "crypto";
import os from "os";
import {
  clearOpenAIKey,
  cleanupExpiredAdminSessions,
  createAdminSession,
  deleteStoredArticle,
  deleteStoredDraft,
  deleteAdminSession,
  getAdminPasswordRecord,
  getMediaAsset,
  getAdminSession,
  MediaAssetRecord,
  getJsonSetting,
  listStoredArticles,
  listStoredDrafts,
  listMediaAssets,
  resolveOpenAIKey,
  setJsonSetting,
  saveOpenAIKey,
  setAdminPassword,
  replaceStoredArticles,
  replaceStoredDrafts,
  upsertMediaAsset,
  upsertStoredArticle,
  upsertStoredDraft,
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

type AdConfig = {
  adsenseCode: string;
  adsKeeperCode: string;
  showAds: boolean;
};

type FacebookConfig = {
  pageName: string;
  storyCtaText: string;
  storyLinkLabel: string;
};

type ArticleRecord = {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  author: string;
  publishedAt: string;
  imageUrl: string;
  portraitImageUrl?: string;
  imageSourceUrl?: string;
  portraitImageSourceUrl?: string;
  imageSubject?: string;
  isBreaking?: boolean;
  provider?: string;
  warning?: string;
  facebookStoryStatus?: 'pending' | 'posted' | 'failed' | 'skipped';
  facebookStoryPublishedAt?: string;
  facebookStoryError?: string;
  facebookStoryPostId?: string;
};

type DraftRecord = ArticleRecord & {
  createdAt: string;
  imagePrompt?: string;
};

const STORAGE_KEYS = {
  ads: 'content_ads',
  ai: 'content_ai',
  facebook: 'content_facebook',
  meta: 'content_meta',
} as const;

const DEFAULT_ADS: AdConfig = { adsenseCode: '', adsKeeperCode: '', showAds: false };
const DEFAULT_AI: AiConfig = {
  ctaText: 'Read the full story',
  tone: 'bold',
  imageStyle: 'editorial',
};
const DEFAULT_FACEBOOK: FacebookConfig = {
  pageName: 'jshubnetwork',
  storyCtaText: 'Swipe to read',
  storyLinkLabel: 'Swipe up to read',
  siteUrl: process.env.PUBLIC_SITE_URL || '',
};
const DEFAULT_META: MetaConfig = {
  appId: '',
  appSecret: '',
  pageId: '',
  pageAccessToken: '',
};
const INITIAL_ARTICLES: ArticleRecord[] = [
  {
    id: '1',
    title: 'AI Breakthrough Reshapes the Tech Industry',
    summary: 'A new wave of AI tools is changing how startups build, test, and launch products.',
    content: 'A major shift is underway in the technology sector as AI tools become central to product development, design, and operations...',
    category: 'Tech',
    author: 'Dr. Elena Vance',
    publishedAt: new Date().toISOString(),
    imageUrl: 'https://picsum.photos/seed/tech/1200/800',
    isBreaking: true,
  },
  {
    id: '2',
    title: 'Travel Trends Shift as Remote Work Changes How People Explore',
    summary: 'More travelers are booking longer stays, blending work, leisure, and local experiences.',
    content: 'The travel industry is seeing a structural shift as remote work continues to reshape how and where people take vacations...',
    category: 'Travel',
    author: 'Marcus Thorne',
    publishedAt: new Date(Date.now() - 3600000).toISOString(),
    imageUrl: 'https://picsum.photos/seed/travel/1200/800',
  },
];

type FacebookStoryPayload = {
  title?: string;
  summary?: string;
  category?: string;
  imageUrl?: string;
  portraitImageUrl?: string;
  storyCtaText?: string;
  storyLinkLabel?: string;
  articleUrl?: string;
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
const FACEBOOK_PROFILE_DIR = path.join(process.cwd(), ".facebook-browser-profile");
const STORY_WORK_DIR = path.join(os.tmpdir(), "news-story-composer");
const PLAYWRIGHT_HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';

let facebookBrowserContext: BrowserContext | null = null;
let facebookBrowserPage: Page | null = null;

const safeReadJson = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const formatApiError = (context: string, response: Response, data: any) => {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const upstreamMessage =
    data?.error?.message ||
    data?.message ||
    data?.raw ||
    (typeof data === 'string' ? data : '');
  const details = upstreamMessage ? ` - ${upstreamMessage}` : '';
  return `${context} (HTTP ${response.status}${statusText})${details}`;
};

const readJsonSetting = async <T>(key: string, fallback: T): Promise<T> =>
  getJsonSetting<T>(key, fallback);

const isOptimizedMediaPath = (value?: string) => !!value?.startsWith('/media/');

const MEDIA_DIR = path.join(process.cwd(), 'media');
const MEDIA_URL_PREFIX = '/media';

const ensureMediaDir = async () => {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
};

const mediaUrlToFilePath = (url: string) => {
  if (!url.startsWith(MEDIA_URL_PREFIX)) {
    throw new Error('Not a local media URL.');
  }

  const relativePath = url.replace(new RegExp(`^${MEDIA_URL_PREFIX}/`), '');
  return path.join(MEDIA_DIR, relativePath);
};

const fetchImageBuffer = async (source: string) => {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Failed to parse embedded image data.');
    }

    return Buffer.from(match[2], 'base64');
  }

  if (source.startsWith(MEDIA_URL_PREFIX + '/')) {
    return fs.readFile(mediaUrlToFilePath(source));
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}).`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL.');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const tryReadLocalMediaBuffer = async (url: string) => {
  if (!url.startsWith(MEDIA_URL_PREFIX + '/')) {
    return null;
  }

  const filePath = mediaUrlToFilePath(url);
  try {
    return await fs.readFile(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const ensureParentDir = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const recordMediaAsset = async (params: {
  name: string;
  sourceUrl: string;
  optimizedUrl: string;
  kind: string;
  width: number;
  height: number;
  mimeType: string;
}) => {
  const filePath = mediaUrlToFilePath(params.optimizedUrl);
  const stat = await fs.stat(filePath).catch(async (error: any) => {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    try {
      const sourceBuffer = await fetchImageBuffer(params.sourceUrl);
      await ensureParentDir(filePath);
      await fs.writeFile(filePath, sourceBuffer);
      return fs.stat(filePath);
    } catch (sourceError: any) {
      if (sourceError?.code === 'ENOENT') {
        console.warn(`Skipping media asset record for missing source "${params.sourceUrl}".`);
        return null;
      }

      throw sourceError;
    }
  });
  if (!stat) {
    return '';
  }
  const id = crypto
    .createHash('sha1')
    .update(JSON.stringify({
      sourceUrl: params.sourceUrl,
      optimizedUrl: params.optimizedUrl,
      kind: params.kind,
      width: params.width,
      height: params.height,
      mimeType: params.mimeType,
    }))
    .digest('hex');

  await upsertMediaAsset({
    id,
    name: params.name,
    source_url: params.sourceUrl,
    optimized_url: params.optimizedUrl,
    kind: params.kind,
    width: params.width,
    height: params.height,
    mime_type: params.mimeType,
    size_bytes: stat.size,
  });

  return id;
};

type OptimizeMediaOptions = {
  width: number;
  height: number;
  quality?: number;
  format?: 'webp' | 'jpeg';
  fit?: 'cover' | 'contain' | 'inside' | 'outside';
};

const optimizeMediaUrl = async (source: string, options: OptimizeMediaOptions) => {
  if (!source || isOptimizedMediaPath(source)) {
    return source;
  }

  await ensureMediaDir();

  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ source, options }))
    .digest('hex');
  const extension = options.format === 'jpeg' ? 'jpg' : 'webp';
  const fileName = `${hash}-${options.width}x${options.height}.${extension}`;
  const filePath = path.join(MEDIA_DIR, fileName);

  try {
    await fs.access(filePath);
  } catch {
    const inputBuffer = (await tryReadLocalMediaBuffer(source)) || await fetchImageBuffer(source);
    await ensureParentDir(filePath);
    let image = sharp(inputBuffer).resize(options.width, options.height, {
      fit: options.fit || 'cover',
    });

    if (options.format === 'jpeg') {
      image = image.jpeg({ quality: options.quality || 82 });
    } else {
      image = image.webp({ quality: options.quality || 82 });
    }

    await image.toFile(filePath);
  }

  return `${MEDIA_URL_PREFIX}/${fileName}`;
};

const normalizeStoredImageFields = async <T extends {
  title?: string;
  id?: string;
  imageUrl?: string;
  portraitImageUrl?: string;
  imageSourceUrl?: string;
  portraitImageSourceUrl?: string;
}>(record: T): Promise<T & {
  imageUrl: string;
  imageSourceUrl: string;
  portraitImageUrl?: string;
  portraitImageSourceUrl?: string;
}> => {
  const title = record.title || record.id || 'story';
  const allowLocalSource = async (value?: string | null) => {
    if (!value?.startsWith(MEDIA_URL_PREFIX + '/')) {
      return value || null;
    }

    const localBuffer = await tryReadLocalMediaBuffer(value);
    if (localBuffer) {
      return value;
    }

    const storedAsset = (await listMediaAssets()).find(
      (asset) => asset.optimized_url === value || asset.source_url === value
    );
    return storedAsset?.source_url || null;
  };

  const imageSourceUrl =
    (await allowLocalSource(record.imageSourceUrl)) ||
    (await allowLocalSource(record.imageUrl)) ||
    fallbackImageUrl(title);
  const portraitSourceUrl =
    (await allowLocalSource(record.portraitImageSourceUrl)) ||
    (await allowLocalSource(record.portraitImageUrl)) ||
    fallbackPortraitUrl(title);

  let imageUrl = imageSourceUrl;
  try {
    imageUrl = await optimizeMediaUrl(imageSourceUrl, {
      width: 1200,
      height: 800,
      quality: 82,
      format: 'webp',
    });
  } catch (error) {
    console.warn(`Failed to optimize article image for "${title}". Falling back to source URL.`, error);
    imageUrl = imageSourceUrl;
  }

  let portraitImageUrl = portraitSourceUrl;
  if (portraitSourceUrl) {
    try {
      portraitImageUrl = await optimizeMediaUrl(portraitSourceUrl, {
        width: 1024,
        height: 1792,
        quality: 82,
        format: 'webp',
      });
    } catch (error) {
      console.warn(`Failed to optimize portrait image for "${title}". Falling back to source URL.`, error);
      portraitImageUrl = portraitSourceUrl;
    }
  }

  try {
    await recordMediaAsset({
      name: `${title}-cover`,
      sourceUrl: imageSourceUrl,
      optimizedUrl: imageUrl,
      kind: 'cover',
      width: 1200,
      height: 800,
      mimeType: 'image/webp',
    });
  } catch (error) {
    console.warn(`Failed to record media asset for "${title}".`, error);
  }

  if (portraitSourceUrl && portraitImageUrl) {
    try {
      await recordMediaAsset({
        name: `${title}-portrait`,
        sourceUrl: portraitSourceUrl,
        optimizedUrl: portraitImageUrl,
        kind: 'portrait',
        width: 1024,
        height: 1792,
        mimeType: 'image/webp',
      });
    } catch (error) {
      console.warn(`Failed to record portrait media asset for "${title}".`, error);
    }
  }

  return {
    ...record,
    imageUrl,
    imageSourceUrl,
    portraitImageUrl,
    portraitImageSourceUrl: portraitSourceUrl,
  } as T & {
    imageUrl: string;
    imageSourceUrl: string;
    portraitImageUrl?: string;
    portraitImageSourceUrl?: string;
  };
};

const fallbackImageUrl = (title: string, suffix = '') => {
  const seed = encodeURIComponent(`${slugify(title || 'story')}${suffix}`);
  return `https://picsum.photos/seed/${seed}/1200/800`;
};

const fallbackPortraitUrl = (title: string) => {
  const seed = encodeURIComponent(`${slugify(title || 'story')}-portrait`);
  return `https://picsum.photos/seed/${seed}/1024/1792`;
};

const loadPublicState = async () => ({
  articles: await listStoredArticles<ArticleRecord>(),
  ads: await readJsonSetting<AdConfig>(STORAGE_KEYS.ads, DEFAULT_ADS),
  aiConfig: await readJsonSetting<AiConfig>(STORAGE_KEYS.ai, DEFAULT_AI),
  facebookConfig: await readJsonSetting<FacebookConfig>(STORAGE_KEYS.facebook, DEFAULT_FACEBOOK),
});

const loadAdminState = async () => ({
  drafts: await listStoredDrafts<DraftRecord>(),
  metaConfig: await readJsonSetting<MetaConfig>(STORAGE_KEYS.meta, DEFAULT_META),
});

const seedContentIfNeeded = async () => {
  const publicState = await loadPublicState();
  if (publicState.articles.length === 0) {
    const optimizedInitialArticles = await Promise.all(INITIAL_ARTICLES.map((article) => normalizeStoredImageFields(article)));
    await replaceStoredArticles(optimizedInitialArticles);
  }

  if (!publicState.ads || Object.keys(publicState.ads).length === 0) {
    await setJsonSetting(STORAGE_KEYS.ads, DEFAULT_ADS);
  }

  if (!publicState.aiConfig || Object.keys(publicState.aiConfig).length === 0) {
    await setJsonSetting(STORAGE_KEYS.ai, DEFAULT_AI);
  }

  if (!publicState.facebookConfig || Object.keys(publicState.facebookConfig).length === 0) {
    await setJsonSetting(STORAGE_KEYS.facebook, DEFAULT_FACEBOOK);
  }

  const adminState = await loadAdminState();
  if (!adminState.metaConfig || Object.keys(adminState.metaConfig).length === 0) {
    await setJsonSetting(STORAGE_KEYS.meta, DEFAULT_META);
  }
};

const cleanupEmbeddedImages = async () => {
  const publicState = await loadPublicState();
  const adminState = await loadAdminState();

  const cleanedArticles = await Promise.all(publicState.articles.map((article) => normalizeStoredImageFields(article)));
  const cleanedDrafts = await Promise.all(adminState.drafts.map((draft) => normalizeStoredImageFields(draft)));

  const articlesChanged = JSON.stringify(cleanedArticles) !== JSON.stringify(publicState.articles);
  const draftsChanged = JSON.stringify(cleanedDrafts) !== JSON.stringify(adminState.drafts);

  if (articlesChanged) {
    await replaceStoredArticles(cleanedArticles);
  }

  if (draftsChanged) {
    await replaceStoredDrafts(cleanedDrafts);
  }
};

const createStoryOverlaySvg = (payload: {
  title: string;
  summary: string;
  category: string;
  storyCtaText: string;
  storyLinkLabel: string;
  pageName: string;
  articleUrl?: string;
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

  const titleLines = wrapLine(payload.title, 18).slice(0, 3);
  const summaryLines = wrapLine(payload.summary, 34).slice(0, 3);
  const titleStartY = payload.isBreaking ? 1512 : 1480;
  const summaryStartY = titleStartY + titleLines.length * 54 + 18;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.00" />
          <stop offset="42%" stop-color="#000000" stop-opacity="0.10" />
          <stop offset="72%" stop-color="#000000" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#030712" stop-opacity="0.96" />
        </linearGradient>
        <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#fade)" />
      <rect x="0" y="0" width="1080" height="760" fill="#000000" fill-opacity="0.08" />
      <rect x="72" y="76" width="160" height="8" rx="4" fill="url(#accent)" />
      <rect x="72" y="118" width="268" height="54" rx="16" fill="rgba(255,255,255,0.10)" />
      <text x="96" y="155" fill="rgba(255,255,255,0.82)" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escape(payload.category.toUpperCase())}</text>
      ${payload.isBreaking ? `<rect x="72" y="194" width="190" height="48" rx="10" fill="#dc2626" />` : ''}
      ${payload.isBreaking ? `<text x="98" y="228" fill="#ffffff" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="700">BREAKING</text>` : ''}
      <rect x="72" y="1368" width="936" height="432" rx="34" fill="rgba(3,7,18,0.84)" stroke="rgba(255,255,255,0.12)" />
      <rect x="108" y="1410" width="200" height="44" rx="14" fill="rgba(255,255,255,0.10)" />
      <text x="132" y="1441" fill="rgba(255,255,255,0.88)" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escape(payload.category.toUpperCase())}</text>
      ${titleLines
        .map(
          (line, index) =>
            `<text x="540" y="${titleStartY + index * 54}" text-anchor="middle" fill="#ffffff" font-size="46" font-family="Arial, Helvetica, sans-serif" font-weight="800" letter-spacing="-0.02em">${escape(line)}</text>`
        )
        .join('')}
      ${summaryLines
        .map(
          (line, index) =>
            `<text x="540" y="${summaryStartY + index * 38}" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="28" font-family="Arial, Helvetica, sans-serif">${escape(line)}</text>`
        )
        .join('')}
      <rect x="108" y="1690" width="296" height="82" rx="20" fill="rgba(249,115,22,0.24)" stroke="rgba(249,115,22,0.50)" />
      <text x="256" y="1722" text-anchor="middle" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="800">${escape(payload.storyCtaText.toUpperCase())}</text>
      <text x="256" y="1752" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-size="18" font-family="Arial, Helvetica, sans-serif">${escape(payload.storyLinkLabel.toUpperCase())}</text>
      <text x="540" y="1862" text-anchor="middle" fill="rgba(255,255,255,0.84)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escape(payload.pageName)}</text>
      <text x="540" y="1892" text-anchor="middle" fill="rgba(255,255,255,0.58)" font-size="18" font-family="Arial, Helvetica, sans-serif">${escape(payload.storyLinkLabel.toUpperCase())}</text>
    </svg>
  `;
};

const renderStoryImage = async (payload: FacebookStoryPayload & { isBreaking?: boolean }) => {
  const bgUrl = payload.portraitImageUrl || payload.imageUrl;
  if (!bgUrl) {
    throw new Error('Missing story background image');
  }

  const bgBuffer = await fetchImageBuffer(bgUrl);

  const base = sharp(bgBuffer)
    .resize(1080, 1920, { fit: 'cover' })
    .modulate({ brightness: 1.08, saturation: 1.08 });
  const overlay = Buffer.from(
    createStoryOverlaySvg({
      title: payload.title || 'Story',
      summary: payload.summary || '',
      category: payload.category || 'News',
      storyCtaText: payload.storyCtaText || 'Swipe to read',
      storyLinkLabel: payload.storyLinkLabel || 'Swipe up to read',
      pageName: payload.pageName || 'jshubnetwork',
      articleUrl: payload.articleUrl,
      isBreaking: payload.isBreaking,
    })
  );

  return base
    .composite([{ input: overlay }])
    .jpeg({ quality: 92 })
    .toBuffer();
};

const STORY_COMPOSER_PAGES = [
  'Create a photo story',
  'Create photo story',
  'Create a story',
  'Create story',
];

const STORY_COMPOSER_BUTTONS = [
  'Add button',
  'Add Link',
  'Add link',
  'Visit a linked site',
  'Visit linked site',
  'Link to website',
];

const STORY_COMPOSER_PUBLISH = [
  'Share to story',
  'Share',
  'Post to story',
  'Publish',
  'Done',
];

const tryClickByText = async (page: Page, candidates: string[]) => {
  for (const label of candidates) {
    try {
      const roleCandidates = [
        page.getByRole('button', { name: new RegExp(label, 'i') }).first(),
        page.getByRole('link', { name: new RegExp(label, 'i') }).first(),
      ];

      for (const locator of roleCandidates) {
        if (await locator.isVisible()) {
          await locator.click();
          return label;
        }
      }

      const locator = page.getByText(label, { exact: false }).first();
      if (await locator.isVisible()) {
        await locator.click();
        return label;
      }
    } catch {
      // Keep trying other labels.
    }
  }

  return null;
};

const tryFillByPlaceholder = async (page: Page, patterns: RegExp[], value: string) => {
  const inputs = page.locator('input[type="text"], textarea');
  const total = await inputs.count();
  for (let index = 0; index < total; index += 1) {
    const field = inputs.nth(index);
    try {
      if (!(await field.isVisible())) {
        continue;
      }

      const placeholder = await field.getAttribute('placeholder');
      if (placeholder && patterns.some((pattern) => pattern.test(placeholder))) {
        await field.fill(value);
        return true;
      }
    } catch {
      // Ignore and continue scanning.
    }
  }

  return false;
};

const launchFacebookComposerSession = async () => {
  await fs.mkdir(FACEBOOK_PROFILE_DIR, { recursive: true });

  if (facebookBrowserContext && !facebookBrowserContext.isClosed()) {
    return facebookBrowserContext;
  }

  try {
    facebookBrowserContext = await chromium.launchPersistentContext(FACEBOOK_PROFILE_DIR, {
      headless: PLAYWRIGHT_HEADLESS,
      viewport: null,
      args: ['--start-maximized'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingBrowser =
      message.includes("Executable doesn't exist") ||
      message.includes('Looks like Playwright was just installed or updated') ||
      message.includes('error while loading shared libraries');
    if (missingBrowser) {
      throw new Error('Playwright cannot start Chromium in this deployment. Redeploy with the Docker image from this repo so the browser dependencies are present.');
    }

    throw error;
  }
  facebookBrowserContext.setDefaultTimeout(45000);
  facebookBrowserContext.on('close', () => {
    facebookBrowserContext = null;
    facebookBrowserPage = null;
  });

  return facebookBrowserContext;
};

const openFacebookStoryComposer = async (
  payload: FacebookStoryPayload & { isBreaking?: boolean }
) => {
  const context = await launchFacebookComposerSession();
  const page = context.pages()[0] || (await context.newPage());
  facebookBrowserPage = page;

  const storyBuffer = await renderStoryImage(payload);
  await fs.mkdir(STORY_WORK_DIR, { recursive: true });
  const storyFileName = `${slugify(payload.title || 'story')}-story.jpg`;
  const storyFilePath = path.join(STORY_WORK_DIR, storyFileName);
  await fs.writeFile(storyFilePath, storyBuffer);

  const destinationUrl =
    payload.pageId?.trim()
      ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(payload.pageId.trim())}`
      : `https://www.facebook.com/${encodeURIComponent(payload.pageName || 'jshubnetwork')}`;

  await page.goto(destinationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (/login|checkpoint/i.test(currentUrl)) {
    return {
      opened: true,
      needsLogin: true,
      message: 'Facebook login is required in the browser window. Log in once, then run this again.',
      destinationUrl,
    };
  }

  const actions: string[] = [];

  const composerLabel =
    (await tryClickByText(page, STORY_COMPOSER_PAGES)) || 'page feed';
  actions.push(`Opened ${composerLabel}`);
  await page.waitForTimeout(2000);

  const fileInputs = page.locator('input[type="file"]');
  if (await fileInputs.count()) {
    try {
      await fileInputs.first().setInputFiles(storyFilePath);
      actions.push('Uploaded story image');
    } catch (error) {
      actions.push(`Image upload failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  } else {
    actions.push('No file input found');
  }

  await page.waitForTimeout(2500);

  const buttonLabel = await tryClickByText(page, STORY_COMPOSER_BUTTONS);
  if (buttonLabel) {
    actions.push(`Opened ${buttonLabel}`);
    await page.waitForTimeout(1500);

    const linkFilled =
      (await tryFillByPlaceholder(
        page,
        [/link/i, /url/i, /website/i, /address/i, /destination/i],
        payload.articleUrl || ''
      )) ||
      (await tryFillByPlaceholder(page, [/link/i, /url/i], payload.articleUrl || ''));

    if (linkFilled) {
      actions.push('Filled article link');
    } else {
      actions.push('Could not find a link field');
    }
  } else {
    actions.push('Could not open link button controls');
  }

  await page.waitForTimeout(1500);
  const publishLabel = await tryClickByText(page, STORY_COMPOSER_PUBLISH);
  if (publishLabel) {
    actions.push(`Pressed ${publishLabel}`);
  } else {
    actions.push('Publish button not found; browser left open for manual finishing');
  }

  return {
    opened: true,
    needsLogin: false,
    message: 'Facebook story composer opened.',
    destinationUrl,
    actions,
  };
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
    throw new Error(formatApiError('Failed to upload story image.', uploadResponse, uploadData));
  }

  const photoId = uploadData?.id || uploadData?.photo_id;
  if (!photoId) {
    throw new Error('Facebook did not return a photo id.');
  }

  const storyUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/photo_stories`);
  storyUrl.searchParams.set('access_token', pageAccessToken);
  storyUrl.searchParams.set('photo_id', photoId);

  const storyResponse = await fetch(storyUrl, {
    method: 'POST',
  });
  const storyData = await safeReadJson(storyResponse);
  if (!storyResponse.ok) {
    throw new Error(formatApiError('Failed to publish Facebook story.', storyResponse, storyData));
  }

  return storyData;
};

const mimeToExtension = (mimeType: string) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'img';
};

const uploadMediaAsset = async (name: string, dataUrl: string) => {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const baseId = crypto.createHash('sha1').update(buffer).digest('hex');
  const safeName = slugify(name || 'upload');
  const extension = mimeToExtension(mimeType);
  const originalRelative = `uploads/originals/${baseId}.${extension}`;
  const originalFilePath = path.join(MEDIA_DIR, originalRelative);
  const optimizedRelative = `uploads/${baseId}-optimized.webp`;
  const optimizedFilePath = path.join(MEDIA_DIR, optimizedRelative);

  await ensureParentDir(originalFilePath);
  await ensureParentDir(optimizedFilePath);

  await fs.writeFile(originalFilePath, buffer);

  const image = sharp(buffer).resize(1600, 1600, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  const optimizedBuffer = await image.webp({ quality: 82 }).toBuffer();
  await fs.writeFile(optimizedFilePath, optimizedBuffer);

  const metadata = await sharp(buffer).metadata();
  const assetName = safeName === 'upload' ? baseId : safeName;
  const record = {
    id: baseId,
    name: assetName,
    source_url: `${MEDIA_URL_PREFIX}/${originalRelative}`,
    optimized_url: `${MEDIA_URL_PREFIX}/${optimizedRelative}`,
    kind: 'upload',
    width: metadata.width || 0,
    height: metadata.height || 0,
    mime_type: 'image/webp',
    size_bytes: optimizedBuffer.length,
  };

  await upsertMediaAsset(record);
  return record;
};

const regenerateMediaAsset = async (assetId: string) => {
  const asset = await getMediaAsset(assetId);
  if (!asset) {
    throw new Error('Media asset not found.');
  }

  const optimizedPath = mediaUrlToFilePath(asset.optimized_url);
  await fs.rm(optimizedPath, { force: true });
  await ensureParentDir(optimizedPath);
  const sourceBuffer = await fetchImageBuffer(asset.source_url);
  await sharp(sourceBuffer)
    .resize(asset.width || 1200, asset.height || 800, { fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(optimizedPath);

  await recordMediaAsset({
    name: asset.name,
    sourceUrl: asset.source_url,
    optimizedUrl: asset.optimized_url,
    kind: asset.kind,
    width: asset.width || 0,
    height: asset.height || 0,
    mimeType: 'image/webp',
  });

  return getMediaAsset(assetId);
};

type MediaAssetView = {
  id: string;
  name: string;
  sourceUrl: string;
  optimizedUrl: string;
  kind: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

const toMediaAssetView = (asset: MediaAssetRecord): MediaAssetView => ({
  id: asset.id,
  name: asset.name,
  sourceUrl: asset.source_url,
  optimizedUrl: asset.optimized_url,
  kind: asset.kind,
  width: asset.width,
  height: asset.height,
  mimeType: asset.mime_type,
  sizeBytes: Number(asset.size_bytes),
  createdAt: asset.created_at,
  updatedAt: asset.updated_at,
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use('/media', express.static(MEDIA_DIR, { immutable: true, maxAge: '365d' }));

  await seedContentIfNeeded();
  await cleanupEmbeddedImages();

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

      const optimizedMedia = await normalizeStoredImageFields({
        id: data.title || category,
        title: data.title || category,
        imageUrl,
        portraitImageUrl,
        imageSourceUrl: imageUrl,
        portraitImageSourceUrl: portraitImageUrl,
      });
      
      res.json({
        ...data,
        category,
        publishedAt: new Date().toISOString(),
        imageUrl: optimizedMedia.imageUrl,
        portraitImageUrl: optimizedMedia.portraitImageUrl,
        imageSourceUrl: optimizedMedia.imageSourceUrl,
        portraitImageSourceUrl: optimizedMedia.portraitImageSourceUrl,
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
          const optimizedMedia = await normalizeStoredImageFields({
            id: data.title || category,
            title: data.title || category,
            imageUrl: `https://picsum.photos/seed/${encodeURIComponent(slugify(data.title || category))}/1200/800`,
            portraitImageUrl: `https://picsum.photos/seed/${encodeURIComponent(`${slugify(data.title || category)}-portrait`)}/1024/1792`,
          });
          return res.json({
            ...data,
            category,
            publishedAt: new Date().toISOString(),
            imageUrl: optimizedMedia.imageUrl,
            portraitImageUrl: optimizedMedia.portraitImageUrl,
            imageSourceUrl: optimizedMedia.imageSourceUrl,
            portraitImageSourceUrl: optimizedMedia.portraitImageSourceUrl,
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

  app.get("/api/content/public", async (_req, res) => {
    try {
      await seedContentIfNeeded();
      return res.json(await loadPublicState());
    } catch (error: any) {
      console.error("Failed to load public content:", error);
      return res.status(500).json({
        message: error.message || "Failed to load public content.",
      });
    }
  });

  app.get("/api/content/admin", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      await seedContentIfNeeded();
      return res.json(await loadAdminState());
    } catch (error: any) {
      console.error("Failed to load admin content:", error);
      return res.status(500).json({
        message: error.message || "Failed to load admin content.",
      });
    }
  });

  app.post("/api/content/drafts", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const draft = req.body as DraftRecord;
      if (!draft?.id) {
        return res.status(400).json({ saved: false, message: "Missing draft id." });
      }

      const safeDraft = await normalizeStoredImageFields(draft);
      await upsertStoredDraft(safeDraft);
      return res.json({ saved: true, draft: safeDraft });
    } catch (error: any) {
      console.error("Failed to save draft:", error);
      return res.status(500).json({
        saved: false,
        message: error.message || "Failed to save draft.",
      });
    }
  });

  app.post("/api/content/articles", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const article = req.body as ArticleRecord;
      if (!article?.id) {
        return res.status(400).json({ saved: false, message: "Missing article id." });
      }

      const safeArticle = await normalizeStoredImageFields(article);
      await upsertStoredArticle(safeArticle);
      return res.json({ saved: true, article: safeArticle });
    } catch (error: any) {
      console.error("Failed to save article:", error);
      return res.status(500).json({
        saved: false,
        message: error.message || "Failed to save article.",
      });
    }
  });

  app.delete("/api/content/drafts/:id", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { id } = req.params;
      await deleteStoredDraft(id);
      return res.json({ deleted: true });
    } catch (error: any) {
      console.error("Failed to delete draft:", error);
      return res.status(500).json({
        deleted: false,
        message: error.message || "Failed to delete draft.",
      });
    }
  });

  app.post("/api/content/drafts/:id/publish", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { id } = req.params;
      const drafts = await listStoredDrafts<DraftRecord>();
      const draft = drafts.find((item) => item.id === id);
      if (!draft) {
        return res.status(404).json({ published: false, message: "Draft not found." });
      }

      const article: ArticleRecord = {
        id: draft.id,
        title: draft.title,
        summary: draft.summary,
        content: draft.content,
        category: draft.category,
        author: draft.author,
        publishedAt: new Date().toISOString(),
        imageUrl: draft.imageUrl,
        portraitImageUrl: draft.portraitImageUrl,
        imageSubject: draft.imageSubject,
        isBreaking: draft.isBreaking,
        provider: draft.provider,
        warning: draft.warning,
        facebookStoryStatus: draft.facebookStoryStatus,
        facebookStoryPublishedAt: draft.facebookStoryPublishedAt,
        facebookStoryError: draft.facebookStoryError,
        facebookStoryPostId: draft.facebookStoryPostId,
      };

      const safeArticle = await normalizeStoredImageFields(article);
      await Promise.all([
        upsertStoredArticle(safeArticle),
        deleteStoredDraft(id),
      ]);

      return res.json({ published: true, article: safeArticle });
    } catch (error: any) {
      console.error("Failed to publish draft:", error);
      return res.status(500).json({
        published: false,
        message: error.message || "Failed to publish draft.",
      });
    }
  });

  app.delete("/api/content/articles/:id", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { id } = req.params;
      await deleteStoredArticle(id);
      return res.json({ deleted: true });
    } catch (error: any) {
      console.error("Failed to delete article:", error);
      return res.status(500).json({
        deleted: false,
        message: error.message || "Failed to delete article.",
      });
    }
  });

  app.delete("/api/content/reset", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      await Promise.all([
        replaceStoredArticles([]),
        replaceStoredDrafts([]),
      ]);

      return res.json({
        reset: true,
        message: 'Articles and drafts cleared.',
      });
    } catch (error: any) {
      console.error("Failed to reset content:", error);
      return res.status(500).json({
        reset: false,
        message: error.message || "Failed to reset content.",
      });
    }
  });

  app.put("/api/content/config/public", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { ads, aiConfig, facebookConfig } = req.body as {
        ads?: AdConfig;
        aiConfig?: AiConfig;
        facebookConfig?: FacebookConfig;
      };

      if (ads) {
        await setJsonSetting(STORAGE_KEYS.ads, ads);
      }
      if (aiConfig) {
        await setJsonSetting(STORAGE_KEYS.ai, aiConfig);
      }
      if (facebookConfig) {
        await setJsonSetting(STORAGE_KEYS.facebook, facebookConfig);
      }

      return res.json({
        saved: true,
        ...(await loadPublicState()),
      });
    } catch (error: any) {
      console.error("Failed to save public config:", error);
      return res.status(500).json({
        saved: false,
        message: error.message || "Failed to save public config.",
      });
    }
  });

  app.put("/api/content/config/meta", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const metaConfig = req.body as MetaConfig;
      await setJsonSetting(STORAGE_KEYS.meta, metaConfig);
      return res.json({
        saved: true,
        metaConfig,
      });
    } catch (error: any) {
      console.error("Failed to save meta config:", error);
      return res.status(500).json({
        saved: false,
        message: error.message || "Failed to save meta config.",
      });
    }
  });

  app.get("/api/media/library", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const assets = await listMediaAssets();
      return res.json({
        assets: assets.map((asset) => toMediaAssetView(asset)),
      });
    } catch (error: any) {
      console.error("Failed to load media library:", error);
      return res.status(500).json({
        message: error.message || "Failed to load media library.",
      });
    }
  });

  app.post("/api/media/upload", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { name, dataUrl } = req.body as { name?: string; dataUrl?: string };
      if (!name || !dataUrl) {
        return res.status(400).json({
          uploaded: false,
          message: "Missing upload data.",
        });
      }

      const asset = await uploadMediaAsset(name, dataUrl);
      const storedAsset = await getMediaAsset(asset.id);
      return res.json({
        uploaded: true,
        asset: storedAsset ? toMediaAssetView(storedAsset) : null,
      });
    } catch (error: any) {
      console.error("Failed to upload media asset:", error);
      return res.status(500).json({
        uploaded: false,
        message: error.message || "Failed to upload media asset.",
      });
    }
  });

  app.post("/api/media/regenerate/:id", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    try {
      const { id } = req.params;
      const asset = await regenerateMediaAsset(id);
      if (!asset) {
        return res.status(404).json({
          regenerated: false,
          message: "Media asset not found.",
        });
      }

      return res.json({
        regenerated: true,
        asset: toMediaAssetView(asset),
      });
    } catch (error: any) {
      console.error("Failed to regenerate media asset:", error);
      return res.status(500).json({
        regenerated: false,
        message: error.message || "Failed to regenerate media asset.",
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
          message: formatApiError("Invalid Meta token.", debugTokenResponse, debugTokenData),
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
          message: formatApiError("Could not load the Facebook Page.", pageResponse, pageData),
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

  app.post("/api/meta/open-story-composer", async (req, res) => {
    const token = await requireAdmin(req, res);
    if (!token) return;

    const payload = req.body as FacebookStoryPayload & { isBreaking?: boolean };
    if (!payload.title || (!payload.imageUrl && !payload.portraitImageUrl)) {
      return res.status(400).json({
        opened: false,
        message: "Missing story content.",
      });
    }

    try {
      const result = await openFacebookStoryComposer(payload);
      return res.json(result);
    } catch (error: any) {
      console.error("Facebook story composer launch failed:", error);
      return res.status(500).json({
        opened: false,
        message: error.message || "Facebook story composer launch failed.",
        error: error.message || "Facebook story composer launch failed.",
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
