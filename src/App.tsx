import React from 'react';
import { Header } from './components/Header';
import { ArticleCard } from './components/ArticleCard';
import { AdminPanel } from './components/AdminPanel';
import { ArticleDetail } from './components/ArticleDetail';
import { AdBanner } from './components/AdBanner';
import { storage } from './lib/storage';
import { Article } from './types';
import { Toaster } from './components/ui/sonner';
import { Separator } from './components/ui/separator';

export default function App() {
  const [view, setView] = React.useState<'news' | 'admin'>('news');
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  React.useEffect(() => {
    storage.seedInitialData();
    setArticles(storage.getArticles());
  }, []);

  const refreshArticles = () => {
    setArticles(storage.getArticles());
  };

  const handleArticleClick = (article: Article) => {
    setSelectedArticle(article);
    window.scrollTo(0, 0);
  };

  const filteredArticles = selectedCategory 
    ? articles.filter(a => a.category === selectedCategory)
    : articles;

  const breakingNews = filteredArticles.find(a => a.isBreaking) || filteredArticles[0];
  const otherArticles = filteredArticles.filter(a => a.id !== breakingNews?.id);

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary selection:text-primary-foreground">
      <Header 
        currentView={view} 
        setView={(v) => { setView(v); setSelectedArticle(null); }} 
        selectedCategory={selectedCategory}
        onCategorySelect={(cat) => {
          setSelectedCategory(cat);
          setSelectedArticle(null);
          setView('news');
        }}
      />
      
      <main className="pb-24">
        {selectedArticle ? (
          <ArticleDetail article={selectedArticle} onBack={() => setSelectedArticle(null)} />
        ) : view === 'admin' ? (
          <AdminPanel onArticlesUpdate={refreshArticles} />
        ) : (
          <div className="container mx-auto px-4 py-12">
            {/* Hero Section */}
            <div className="editorial-grid mb-16">
              {breakingNews && (
                <ArticleCard 
                  article={breakingNews} 
                  onClick={handleArticleClick} 
                  variant="large" 
                />
              )}
              
              <div className="col-span-12 md:col-span-4 flex flex-col gap-8">
                <div className="bg-primary text-primary-foreground p-8 rounded-xl h-full flex flex-col justify-center">
                  <h3 className="text-xs font-bold uppercase tracking-[0.3em] mb-4 opacity-70">Editor's Choice</h3>
                  <h2 className="text-3xl font-serif font-bold leading-tight mb-6">
                    The stories that defined our week.
                  </h2>
                  <p className="text-sm opacity-80 leading-relaxed mb-8">
                    Our editors curate the most impactful stories across the globe, bringing you deep insights and unique perspectives.
                  </p>
                  <button className="text-sm font-bold uppercase tracking-widest border-b-2 border-primary-foreground/30 w-fit pb-1 hover:border-primary-foreground transition-all">
                    Explore Collection
                  </button>
                </div>
              </div>
            </div>

            <Separator className="mb-16" />

            <AdBanner type="adsense" className="mb-16" />

            {/* Secondary Grid */}
            <div className="mb-16">
              <h2 className="text-sm font-bold uppercase tracking-[0.4em] mb-8 text-muted-foreground">Latest Updates</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {otherArticles.slice(0, 3).map(article => (
                  <ArticleCard 
                    key={article.id} 
                    article={article} 
                    onClick={handleArticleClick} 
                    variant="medium" 
                  />
                ))}
              </div>
            </div>

            {/* More News */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {otherArticles.slice(3).map(article => (
                <ArticleCard 
                  key={article.id} 
                  article={article} 
                  onClick={handleArticleClick} 
                  variant="small" 
                />
              ))}
            </div>

            <AdBanner type="adskeeper" className="mt-16" />
            
            {articles.length === 0 && (
              <div className="text-center py-32">
                <h2 className="text-2xl font-serif font-bold text-muted-foreground">No news available.</h2>
                <p className="text-muted-foreground mt-2">Visit the admin panel to generate some stories.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-muted/50 border-t py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground p-1 rounded">
                <span className="font-bold text-lg">N</span>
              </div>
              <span className="text-xl font-serif font-black tracking-tighter uppercase">Nova News</span>
            </div>
            <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">About</a>
              <a href="#" className="hover:text-primary transition-colors">Contact</a>
              <a href="#" className="hover:text-primary transition-colors">Privacy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms</a>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2026 Nova News. Powered by Gemini AI.
            </p>
          </div>
        </div>
      </footer>
      
      <Toaster position="bottom-right" />
    </div>
  );
}

