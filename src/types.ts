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
  siteUrl?: string;
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

export interface MediaAsset {
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
}
