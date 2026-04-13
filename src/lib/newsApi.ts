import { Article, Category, AiConfig, MetaConfig } from "../types";

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export type OpenAIKeySource = 'database' | 'environment' | 'none';
export type AdminAuthState = {
  authenticated: boolean;
  token?: string;
  expiresAt?: string;
};

const getAuthHeaders = () => {
  const headers: Record<string, string> = { ...jsonHeaders };
  const token = localStorage.getItem('nova_admin_session_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export async function checkAdminSession(): Promise<{ authenticated: boolean }> {
  const response = await fetch('/api/admin/me', {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
}

export async function loginAdmin(username: string, password: string): Promise<AdminAuthState> {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to log in');
  }

  return data;
}

export async function logoutAdmin(): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  localStorage.removeItem('nova_admin_session_token');
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ updated: boolean; message?: string }> {
  const response = await fetch('/api/admin/password', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to change password');
  }

  return data;
}

export async function saveOpenAIKey(apiKey: string): Promise<{ saved: boolean; source: OpenAIKeySource }> {
  const response = await fetch('/api/admin/openai-key', {
    method: 'POST',
    headers: getAuthHeaders(),
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
    headers: getAuthHeaders(),
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

export async function publishFacebookStory(payload: {
  title: string;
  summary: string;
  category: string;
  imageUrl: string;
  portraitImageUrl?: string;
  storyCtaText: string;
  pageName: string;
  pageId: string;
  pageAccessToken: string;
  isBreaking?: boolean;
}): Promise<{ published: boolean; result?: unknown }> {
  const response = await fetch('/api/meta/publish-story', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to publish Facebook story');
  }

  return data;
}
