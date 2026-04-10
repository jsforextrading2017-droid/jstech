export type Category = 'World' | 'Politics' | 'Tech' | 'Science' | 'Health' | 'Entertainment' | 'Sport';

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: Category;
  author: string;
  publishedAt: string;
  imageUrl: string;
  isBreaking?: boolean;
  provider?: string;
  warning?: string;
}

export interface AdConfig {
  adsenseCode: string;
  adsKeeperCode: string;
  showAds: boolean;
}

export interface NewsState {
  articles: Article[];
}
