import { Article, AdConfig } from "../types";

const STORAGE_KEY = 'nova_news_articles';
const ADS_KEY = 'nova_news_ads';

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

  getAds: (): AdConfig => {
    const data = localStorage.getItem(ADS_KEY);
    return data ? JSON.parse(data) : { adsenseCode: '', adsKeeperCode: '', showAds: false };
  },

  saveAds: (config: AdConfig) => {
    localStorage.setItem(ADS_KEY, JSON.stringify(config));
  },

  seedInitialData: () => {
    if (storage.getArticles().length === 0) {
      const initial: Article[] = [
        {
          id: '1',
          title: 'The Future of Quantum Computing: A New Era Begins',
          summary: 'Researchers achieve a major breakthrough in quantum stability, paving the way for commercial applications.',
          content: 'Quantum computing has long been the holy grail of computer science. Today, a team of international researchers announced a significant milestone...',
          category: 'Tech',
          author: 'Dr. Elena Vance',
          publishedAt: new Date().toISOString(),
          imageUrl: 'https://picsum.photos/seed/quantum/1200/800',
          isBreaking: true
        },
        {
          id: '2',
          title: 'Global Climate Summit Reaches Landmark Agreement',
          summary: 'World leaders commit to aggressive new targets for carbon reduction in a historic midnight session.',
          content: 'In a surprising turn of events at the COP30 summit, nearly 200 nations have signed onto a binding agreement...',
          category: 'World',
          author: 'Marcus Thorne',
          publishedAt: new Date(Date.now() - 3600000).toISOString(),
          imageUrl: 'https://picsum.photos/seed/climate/1200/800'
        }
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    }
  }
};
