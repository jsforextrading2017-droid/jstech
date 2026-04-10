import { Article, Category } from "../types";

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

export async function generateNewsArticle(category: Category): Promise<Partial<Article>> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ category }),
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
