export type Category = 'Tech' | 'Travel' | 'Animal' | 'Facts' | 'Cars' | 'Building Homes';

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: Category;
  author: string;
  publishedAt: string;
  imageUrl: string;
  portraitImageUrl?: string;
  imageSubject?: string;
  isBreaking?: boolean;
  provider?: string;
  warning?: string;
}

export interface DraftArticle extends Omit<Article, 'id' | 'publishedAt'> {
  id: string;
  createdAt: string;
  imagePrompt?: string;
}

export interface AdConfig {
  adsenseCode: string;
  adsKeeperCode: string;
  showAds: boolean;
}

export interface AiConfig {
  ctaText: string;
  tone: 'urgent' | 'bold' | 'inspiring' | 'investigative';
  imageStyle: 'editorial' | 'dramatic' | 'modern' | 'clean';
}

export interface FacebookConfig {
  pageName: string;
  storyCtaText: string;
  storyLinkLabel: string;
}

export interface MetaConfig {
  appId: string;
  appSecret: string;
  pageId: string;
  pageAccessToken: string;
}

export interface NewsState {
  articles: Article[];
}
