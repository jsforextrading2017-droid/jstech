import { Article, AdConfig, AiConfig, DraftArticle, FacebookConfig, MetaConfig } from "../types";

const LEGACY_KEYS = {
  articles: 'nova_news_articles',
  drafts: 'nova_news_drafts',
  ads: 'nova_news_ads',
  ai: 'nova_news_ai',
  facebook: 'nova_news_facebook',
  meta: 'nova_news_meta',
  migrated: 'nova_news_storage_migrated_to_db',
} as const;

type PublicState = {
  articles: Article[];
  ads: AdConfig;
  aiConfig: AiConfig;
  facebookConfig: FacebookConfig;
};

type AdminState = {
  drafts: DraftArticle[];
  metaConfig: MetaConfig;
};

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const getAuthHeaders = () => {
  const headers: Record<string, string> = { ...jsonHeaders };
  const token = localStorage.getItem('nova_admin_session_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const requestJson = async <T>(response: Response): Promise<T> => {
  const raw = await response.text();
  const data = raw.trim() ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(data.message || data.error || raw || 'Request failed');
  }
  return data as T;
};

const adminRequestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });
  return requestJson<T>(response);
};

const publicRequestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers || {}),
    },
  });
  return requestJson<T>(response);
};

export const storage = {
  migrateLegacyLocalStorage: async (): Promise<void> => {
    if (localStorage.getItem(LEGACY_KEYS.migrated)) {
      return;
    }

    const legacyArticlesRaw = localStorage.getItem(LEGACY_KEYS.articles);
    const legacyDraftsRaw = localStorage.getItem(LEGACY_KEYS.drafts);
    const legacyAdsRaw = localStorage.getItem(LEGACY_KEYS.ads);
    const legacyAiRaw = localStorage.getItem(LEGACY_KEYS.ai);
    const legacyFacebookRaw = localStorage.getItem(LEGACY_KEYS.facebook);
    const legacyMetaRaw = localStorage.getItem(LEGACY_KEYS.meta);

    if (!legacyArticlesRaw && !legacyDraftsRaw && !legacyAdsRaw && !legacyAiRaw && !legacyFacebookRaw && !legacyMetaRaw) {
      localStorage.setItem(LEGACY_KEYS.migrated, 'true');
      return;
    }

    const parse = <T,>(raw: string | null): T | null => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    };

    const legacyArticles = parse<Article[]>(legacyArticlesRaw) || [];
    const legacyDrafts = parse<DraftArticle[]>(legacyDraftsRaw) || [];
    const legacyAds = parse<AdConfig | null>(legacyAdsRaw);
    const legacyAi = parse<AiConfig | null>(legacyAiRaw);
    const legacyFacebook = parse<FacebookConfig | null>(legacyFacebookRaw);
    const legacyMeta = parse<MetaConfig | null>(legacyMetaRaw);

    for (const article of legacyArticles) {
      await storage.saveArticle(article);
    }

    for (const draft of legacyDrafts) {
      await storage.saveDraft(draft);
    }

    if (legacyAds) {
      await storage.saveAds(legacyAds);
    }

    if (legacyAi) {
      await storage.saveAIConfig(legacyAi);
    }

    if (legacyFacebook) {
      await storage.saveFacebookConfig(legacyFacebook);
    }

    if (legacyMeta) {
      await storage.saveMetaConfig(legacyMeta);
    }

    Object.values(LEGACY_KEYS).forEach((key) => {
      if (key !== LEGACY_KEYS.migrated) {
        localStorage.removeItem(key);
      }
    });
    localStorage.setItem(LEGACY_KEYS.migrated, 'true');
  },

  loadPublicState: async (): Promise<PublicState> => {
    return publicRequestJson<PublicState>('/api/content/public');
  },

  loadAdminState: async (): Promise<AdminState> => {
    return adminRequestJson<AdminState>('/api/content/admin');
  },

  saveDraft: async (draft: DraftArticle): Promise<DraftArticle> => {
    const result = await adminRequestJson<{ draft: DraftArticle }>('/api/content/drafts', {
      method: 'POST',
      body: JSON.stringify(draft),
    });
    return result.draft;
  },

  saveArticle: async (article: Article): Promise<Article> => {
    const result = await adminRequestJson<{ saved: boolean; article: Article }>('/api/content/articles', {
      method: 'POST',
      body: JSON.stringify(article),
    });
    return result.article;
  },

  publishDraft: async (id: string): Promise<Article | null> => {
    const result = await adminRequestJson<{ published: boolean; article?: Article }>(`/api/content/drafts/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
    return result.article || null;
  },

  deleteDraft: async (id: string): Promise<void> => {
    await adminRequestJson<{ deleted: boolean }>(`/api/content/drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  deleteArticle: async (id: string): Promise<void> => {
    await adminRequestJson<{ deleted: boolean }>(`/api/content/articles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  saveAds: async (config: AdConfig): Promise<AdConfig> => {
    const result = await adminRequestJson<{ saved: boolean; ads: AdConfig }>('/api/content/config/public', {
      method: 'PUT',
      body: JSON.stringify({ ads: config }),
    });
    return result.ads;
  },

  saveAIConfig: async (config: AiConfig): Promise<AiConfig> => {
    const result = await adminRequestJson<{ saved: boolean; aiConfig: AiConfig }>('/api/content/config/public', {
      method: 'PUT',
      body: JSON.stringify({ aiConfig: config }),
    });
    return result.aiConfig;
  },

  saveFacebookConfig: async (config: FacebookConfig): Promise<FacebookConfig> => {
    const result = await adminRequestJson<{ saved: boolean; facebookConfig: FacebookConfig }>('/api/content/config/public', {
      method: 'PUT',
      body: JSON.stringify({ facebookConfig: config }),
    });
    return result.facebookConfig;
  },

  saveMetaConfig: async (config: MetaConfig): Promise<MetaConfig> => {
    const result = await adminRequestJson<{ saved: boolean; metaConfig: MetaConfig }>('/api/content/config/meta', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return result.metaConfig;
  },
};
