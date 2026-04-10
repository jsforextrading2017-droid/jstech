import { Article, AdConfig, AiConfig, DraftArticle, FacebookConfig, MetaConfig } from "../types";

const STORAGE_KEY = 'nova_news_articles';
const DRAFTS_KEY = 'nova_news_drafts';
const ADS_KEY = 'nova_news_ads';
const AI_KEY = 'nova_news_ai';
const FACEBOOK_KEY = 'nova_news_facebook';
const META_KEY = 'nova_news_meta';

export const storage = {
  getArticles: (): Article[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },
  
  saveArticle: (article: Article) => {
    const articles = storage.getArticles();
    const updated = [article, ...articles];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  deleteArticle: (id: string) => {
    const articles = storage.getArticles();
    const updated = articles.filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  getDrafts: (): DraftArticle[] => {
    const data = localStorage.getItem(DRAFTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveDraft: (draft: DraftArticle) => {
    const drafts = storage.getDrafts();
    const updated = [draft, ...drafts];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
  },

  deleteDraft: (id: string) => {
    const drafts = storage.getDrafts();
    const updated = drafts.filter(d => d.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
  },

  publishDraft: (id: string) => {
    const drafts = storage.getDrafts();
    const draft = drafts.find(d => d.id === id);
    if (!draft) return null;

      const article: Article = {
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
      };

    storage.saveArticle(article);
    storage.deleteDraft(id);
    return article;
  },

  getAds: (): AdConfig => {
    const data = localStorage.getItem(ADS_KEY);
    return data ? JSON.parse(data) : { adsenseCode: '', adsKeeperCode: '', showAds: false };
  },

  saveAds: (config: AdConfig) => {
    localStorage.setItem(ADS_KEY, JSON.stringify(config));
  },

  getAIConfig: (): AiConfig => {
    const data = localStorage.getItem(AI_KEY);
    return data
      ? JSON.parse(data)
      : {
          ctaText: 'Read the full story',
          tone: 'bold',
          imageStyle: 'editorial',
        };
  },

  saveAIConfig: (config: AiConfig) => {
    localStorage.setItem(AI_KEY, JSON.stringify(config));
  },

  getFacebookConfig: (): FacebookConfig => {
    const data = localStorage.getItem(FACEBOOK_KEY);
    return data
      ? JSON.parse(data)
      : {
          pageName: 'jshubnetwork',
          storyCtaText: 'Swipe to read',
          storyLinkLabel: 'Read more',
        };
  },

  saveFacebookConfig: (config: FacebookConfig) => {
    localStorage.setItem(FACEBOOK_KEY, JSON.stringify(config));
  },

  getMetaConfig: (): MetaConfig => {
    const data = localStorage.getItem(META_KEY);
    return data
      ? JSON.parse(data)
      : {
          appId: '',
          appSecret: '',
          pageId: '',
          pageAccessToken: '',
        };
  },

  saveMetaConfig: (config: MetaConfig) => {
    localStorage.setItem(META_KEY, JSON.stringify(config));
  },

  seedInitialData: () => {
    if (storage.getArticles().length === 0) {
      const initial: Article[] = [
        {
          id: '1',
          title: 'AI Breakthrough Reshapes the Tech Industry',
          summary: 'A new wave of AI tools is changing how startups build, test, and launch products.',
          content: 'A major shift is underway in the technology sector as AI tools become central to product development, design, and operations...',
          category: 'Tech',
          author: 'Dr. Elena Vance',
          publishedAt: new Date().toISOString(),
          imageUrl: 'https://picsum.photos/seed/tech/1200/800',
          isBreaking: true
        },
        {
          id: '2',
          title: 'Travel Trends Shift as Remote Work Changes How People Explore',
          summary: 'More travelers are booking longer stays, blending work, leisure, and local experiences.',
          content: 'The travel industry is seeing a structural shift as remote work continues to reshape how and where people take vacations...',
          category: 'Travel',
          author: 'Marcus Thorne',
          publishedAt: new Date(Date.now() - 3600000).toISOString(),
          imageUrl: 'https://picsum.photos/seed/travel/1200/800'
        }
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    }
  }
};
