import { Article, Category, AiConfig, MetaConfig } from "../types";

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const userKey = localStorage.getItem('nova_openai_key');
  if (userKey) {
    headers['x-openai-key'] = userKey;
  }
  return headers;
};

export async function generateNewsArticle(
  category: Category,
  aiConfig?: AiConfig,
  imagePrompt?: string
): Promise<Partial<Article>> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ category, aiConfig, imagePrompt }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to generate article');
  }

  return response.json();
}

export async function checkAIStatus(): Promise<{ connected: boolean; model: string; provider: string; isClientKey?: boolean }> {
  const response = await fetch('/api/ai-status', {
    headers: getHeaders(),
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
    headers: getHeaders(),
    body: JSON.stringify(metaConfig),
  });

  const raw = await response.text();
  const data = raw.trim() ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to test Meta connection');
  }

  return data;
}
