import { Article, Category, AiConfig, MetaConfig } from "../types";

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export type OpenAIKeySource = 'database' | 'environment' | 'none';

export async function saveOpenAIKey(apiKey: string): Promise<{ saved: boolean; source: OpenAIKeySource }> {
  const response = await fetch('/api/admin/openai-key', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ apiKey }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to save OpenAI key');
  }

  return data;
}

export async function clearOpenAIKey(): Promise<{ deleted: boolean; source: OpenAIKeySource }> {
  const response = await fetch('/api/admin/openai-key', {
    method: 'DELETE',
    headers: jsonHeaders,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to clear OpenAI key');
  }

  return data;
}

export async function generateNewsArticle(
  category: Category,
  aiConfig?: AiConfig,
  imagePrompt?: string
): Promise<Partial<Article>> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ category, aiConfig, imagePrompt }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to generate article');
  }

  return response.json();
}

export async function checkAIStatus(): Promise<{ connected: boolean; model: string; provider: string; keySource?: OpenAIKeySource }> {
  const response = await fetch('/api/ai-status', {
    headers: jsonHeaders,
  });
  if (!response.ok) throw new Error('Failed to check AI status');
  return response.json();
}

export async function testMetaConnection(metaConfig: MetaConfig): Promise<{
  connected: boolean;
  pageId?: string;
  pageName?: string;
  tokenType?: string;
  scopes?: string[];
  message?: string;
}> {
  const response = await fetch('/api/meta/test-connection', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(metaConfig),
  });

  const raw = await response.text();
  const data = raw.trim() ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to test Meta connection');
  }

  return data;
}
