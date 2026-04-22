import React from 'react';
import { Header } from './components/Header';
import { ArticleCard } from './components/ArticleCard';
import { AdminPanel } from './components/AdminPanel';
import { StoryTestPage } from './components/StoryTestPage';
import { ArticleDetail } from './components/ArticleDetail';
import { AdBanner } from './components/AdBanner';
import { storage } from './lib/storage';
import { checkAdminSession, loginAdmin } from './lib/newsApi';
import { AdConfig, Article, FacebookConfig } from './types';
import { Toaster } from './components/ui/sonner';
import { Separator } from './components/ui/separator';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { LogIn, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const getViewFromPath = () => {
    if (window.location.pathname.startsWith('/admin')) return 'admin';
    if (window.location.pathname.startsWith('/story-test')) return 'story-test';
    return 'news';
  };
  const getPostIdFromPath = () => new URLSearchParams(window.location.search).get('post');
  const [view, setView] = React.useState<'news' | 'admin' | 'story-test'>(getViewFromPath);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = React.useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = React.useState(true);
  const [adminUsername, setAdminUsername] = React.useState('admin');
  const [adminPassword, setAdminPassword] = React.useState('admin123');
  const [isAdminLoggingIn, setIsAdminLoggingIn] = React.useState(false);
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [adConfig, setAdConfig] = React.useState<AdConfig>({ adsenseCode: '', adsKeeperCode: '', showAds: false });
  const [facebookConfig, setFacebookConfig] = React.useState<FacebookConfig>({
    pageName: 'jshubnetwork',
    storyCtaText: 'Swipe to read',
    storyLinkLabel: 'Swipe up to read',
  });
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const sections = ['Tech', 'Travel', 'Animal', 'Facts', 'Cars', 'Building Homes'] as const;

  React.useEffect(() => {
    const loadState = async () => {
      try {
        const publicState = await storage.loadPublicState();
        setArticles(publicState.articles);
        setAdConfig(publicState.ads);
        setFacebookConfig(publicState.facebookConfig);
      } catch (error) {
        console.error(error);
      }
    };

    loadState();
  }, []);

  React.useEffect(() => {
    if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/story-test')) {
      return;
    }

    const postId = getPostIdFromPath();
    if (!postId) {
      setSelectedArticle(null);
      return;
    }

    const matchedArticle = articles.find((article) => article.id === postId) || null;
    setSelectedArticle(matchedArticle);
  }, [articles]);

  React.useEffect(() => {
    const syncAuth = async () => {
      const protectedView = window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/story-test');
      if (!protectedView) {
        setIsAdminAuthenticated(false);
        setIsCheckingAdmin(false);
        return;
      }

      setIsCheckingAdmin(true);
      try {
        const session = await checkAdminSession();
        setIsAdminAuthenticated(session.authenticated);
        if (!session.authenticated) {
          localStorage.removeItem('nova_admin_session_token');
        }
      } catch (error) {
        console.error(error);
        setIsAdminAuthenticated(false);
      } finally {
        setIsCheckingAdmin(false);
      }
    };

    syncAuth();
  }, [view]);

  React.useEffect(() => {
    const handlePopState = () => {
      setView(getViewFromPath());
      if (window.location.pathname.startsWith('/admin')) {
        setSelectedArticle(null);
        return;
      }

      const postId = getPostIdFromPath();
      const matchedArticle = articles.find((article) => article.id === postId) || null;
      setSelectedArticle(matchedArticle);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [articles]);

  const refreshArticles = () => {
    storage.loadPublicState()
      .then((publicState) => {
        setArticles(publicState.articles);
        setAdConfig(publicState.ads);
        setFacebookConfig(publicState.facebookConfig);
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const navigateToView = (nextView: 'news' | 'admin' | 'story-test') => {
    const nextPath = nextView === 'admin' ? '/admin' : nextView === 'story-test' ? '/story-test' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setView(nextView);
    setSelectedArticle(null);
  };

  const handleAdminLogin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      return;
    }

    setIsAdminLoggingIn(true);
    try {
      const result = await loginAdmin(adminUsername.trim(), adminPassword);
      if (result.token) {
        localStorage.setItem('nova_admin_session_token', result.token);
      }
      setIsAdminAuthenticated(true);
    } catch (error) {
      console.error(error);
      setIsAdminAuthenticated(false);
      alert(error instanceof Error ? error.message : 'Failed to log in.');
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const handleArticleClick = (article: Article) => {
    setSelectedArticle(article);
    window.history.pushState({}, '', `/?post=${article.id}`);
    window.scrollTo(0, 0);
  };

  const filteredArticles = selectedCategory 
    ? articles.filter(a => a.category === selectedCategory)
    : articles;

  const leadArticle = filteredArticles.find(a => a.isBreaking) || filteredArticles[0];
  const rankedArticles = filteredArticles.filter(a => a.id !== leadArticle?.id);
  const trendingArticles = [...filteredArticles].slice(0, 5);
  const categorySections = sections
    .map((category) => ({
      category,
      articles: filteredArticles.filter(article => article.category === category),
    }))
    .filter(section => section.articles.length > 0);

  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary selection:text-primary-foreground">
      <Header 
        selectedCategory={selectedCategory}
        onCategorySelect={(cat) => {
          setSelectedCategory(cat);
          setSelectedArticle(null);
          navigateToView('news');
        }}
      />
      
      <main className="pb-24">
        {selectedArticle ? (
          <ArticleDetail
            article={selectedArticle}
            adConfig={adConfig}
            facebookConfig={facebookConfig}
            onBack={() => {
              window.history.pushState({}, '', '/');
              setSelectedArticle(null);
            }}
          />
        ) : view === 'admin' ? (
          isCheckingAdmin ? (
            <div className="container mx-auto px-4 py-32 text-center">
              <p className="text-muted-foreground">Checking admin session...</p>
            </div>
          ) : !isAdminAuthenticated ? (
            <div className="container mx-auto px-4 py-20">
              <div className="mx-auto max-w-md rounded-[2rem] border bg-card p-8 shadow-sm">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheck size={32} />
                  </div>
                  <h1 className="text-3xl font-serif font-black">Admin Login</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Enter your admin credentials to continue.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminUsername">Username</Label>
                    <Input
                      id="adminUsername"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">Password</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button className="w-full gap-2" onClick={handleAdminLogin} disabled={isAdminLoggingIn}>
                    <LogIn size={16} />
                    {isAdminLoggingIn ? 'Signing in...' : 'Log In'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
          <AdminPanel
            onArticlesUpdate={refreshArticles}
            onLogout={() => {
              localStorage.removeItem('nova_admin_session_token');
              setIsAdminAuthenticated(false);
            }}
          />
          )
        ) : view === 'story-test' ? (
          isCheckingAdmin ? (
            <div className="container mx-auto px-4 py-32 text-center">
              <p className="text-muted-foreground">Checking admin session...</p>
            </div>
          ) : !isAdminAuthenticated ? (
            <div className="container mx-auto px-4 py-20">
              <div className="mx-auto max-w-md rounded-[2rem] border bg-card p-8 shadow-sm">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheck size={32} />
                  </div>
                  <h1 className="text-3xl font-serif font-black">Story Test Login</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Enter your admin credentials to continue.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="storyTestUsername">Username</Label>
                    <Input
                      id="storyTestUsername"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storyTestPassword">Password</Label>
                    <Input
                      id="storyTestPassword"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button className="w-full gap-2" onClick={handleAdminLogin} disabled={isAdminLoggingIn}>
                    <LogIn size={16} />
                    {isAdminLoggingIn ? 'Signing in...' : 'Log In'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <StoryTestPage
              onBackToAdmin={() => {
                window.history.pushState({}, '', '/admin');
                setView('admin');
              }}
            />
          )
        ) : (
          <div className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,_rgba(0,0,0,0.08),_transparent_45%),linear-gradient(180deg,_rgba(0,0,0,0.03),_transparent_55%)] pointer-events-none" />
            <div className="absolute -top-20 right-[-6rem] h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute top-40 left-[-4rem] h-56 w-56 rounded-full bg-muted/70 blur-3xl pointer-events-none" />

            <div className="container mx-auto px-4 py-10 relative">
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-10 flex flex-col gap-6 border-b pb-8"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full px-4 py-1 uppercase tracking-[0.25em] bg-primary text-primary-foreground">Daily Front Page</Badge>
                  <span className="text-sm text-muted-foreground">Curated for jshubnetwork readers</span>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
                  <div>
                    <h1 className="max-w-4xl text-5xl md:text-7xl font-serif font-black tracking-tight leading-[0.95]">
                      Sharp stories, bold visuals, and a cleaner magazine-style front page.
                    </h1>
                    <p className="mt-5 max-w-2xl text-lg text-muted-foreground leading-relaxed">
                      A stronger lead story, more editorial hierarchy, and category-driven sections designed to feel closer to a premium modern magazine.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Stories</div>
                      <div className="mt-2 text-3xl font-serif font-black">{articles.length}</div>
                    </div>
                    <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Sections</div>
                      <div className="mt-2 text-3xl font-serif font-black">{sections.length}</div>
                    </div>
                  </div>
                </div>
              </motion.section>

              <section className="grid gap-8 lg:grid-cols-[1.45fr_0.75fr] mb-14">
                {leadArticle ? (
                  <motion.button
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05 }}
                    onClick={() => handleArticleClick(leadArticle)}
                    className="group text-left rounded-[2rem] overflow-hidden border bg-card shadow-[0_20px_80px_rgba(0,0,0,0.08)]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <img
                        src={leadArticle.imageUrl}
                        alt={leadArticle.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                      <div className="absolute left-6 top-6 flex items-center gap-2">
                        <Badge className="bg-black/80 text-white border-0 uppercase tracking-[0.2em]">
                          {leadArticle.category}
                        </Badge>
                        {leadArticle.isBreaking && (
                          <Badge className="bg-red-600 text-white border-0 uppercase tracking-[0.2em]">
                            Breaking
                          </Badge>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 text-white">
                        <div className="mb-3 text-xs uppercase tracking-[0.35em] text-white/70">Lead Story</div>
                        <h2 className="max-w-3xl text-3xl md:text-5xl font-serif font-black leading-[0.95]">
                          {leadArticle.title}
                        </h2>
                        <p className="mt-4 max-w-2xl text-sm md:text-base text-white/85 leading-relaxed">
                          {leadArticle.summary}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.25em] text-white/70">
                          <span>{leadArticle.author}</span>
                          <span>{new Date(leadArticle.publishedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ) : (
                  <div className="rounded-[2rem] border bg-card p-10 text-center">
                    <p className="text-muted-foreground">No articles available yet.</p>
                  </div>
                )}

                <motion.aside
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="space-y-4"
                >
                  <div className="rounded-[2rem] border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Trending Now</div>
                        <h3 className="mt-2 text-2xl font-serif font-black">Fast reads, high interest</h3>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        01
                      </div>
                    </div>
                    <div className="space-y-4">
                      {trendingArticles.slice(0, 4).map((article, index) => (
                        <button
                          key={article.id}
                          onClick={() => handleArticleClick(article)}
                          className="flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all hover:bg-muted/40"
                        >
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-muted text-xs font-bold">
                            0{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{article.category}</div>
                            <div className="truncate font-semibold leading-snug">{article.title}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border bg-primary text-primary-foreground p-6 shadow-lg">
                    <div className="text-xs uppercase tracking-[0.3em] text-primary-foreground/70">Editor's Pick</div>
                    <h3 className="mt-3 text-2xl font-serif font-black leading-tight">A more curated, more magazine-like layout.</h3>
                    <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
                      This front page now uses stronger story hierarchy, a prominent feature lead, and tighter category groupings.
                    </p>
                </div>
              </motion.aside>
              </section>

              <AdBanner type="adsense" adConfig={adConfig} className="mb-14" />

              <section className="mb-16">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Feature Grid</div>
                    <h2 className="mt-2 text-3xl font-serif font-black">Category sections with lead stories</h2>
                  </div>
                </div>
                <div className="space-y-10">
                  {categorySections.map((section) => {
                    const [lead, ...rest] = section.articles;
                    const smallPosts = rest.slice(0, 4);
                    return (
                      <div key={section.category} className="rounded-[2rem] border bg-card p-6 md:p-8 shadow-sm">
                        <div className="mb-6 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">{section.category}</div>
                            <h3 className="mt-2 text-2xl font-serif font-black">From the {section.category.toLowerCase()} desk</h3>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(section.category)}>
                            View all
                          </Button>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                          {lead && (
                            <button
                              onClick={() => handleArticleClick(lead)}
                              className="group text-left rounded-[1.75rem] overflow-hidden border bg-background"
                            >
                              <div className="aspect-[16/10] overflow-hidden">
                                <img
                                  src={lead.imageUrl}
                                  alt={lead.title}
                                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="p-5">
                                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{lead.author}</div>
                                <h4 className="mt-2 text-2xl font-serif font-black leading-tight">{lead.title}</h4>
                                <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{lead.summary}</p>
                              </div>
                            </button>
                          )}

                          <div className="grid gap-4 sm:grid-cols-2">
                            {smallPosts.map(article => (
                              <button
                                key={article.id}
                                onClick={() => handleArticleClick(article)}
                                className="group rounded-2xl border bg-background p-3 text-left transition-colors hover:bg-muted/40"
                              >
                                <div className="aspect-[4/3] overflow-hidden rounded-xl">
                                  <img
                                    src={article.imageUrl}
                                    alt={article.title}
                                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{article.category}</div>
                                <div className="mt-1 line-clamp-2 font-semibold leading-snug">{article.title}</div>
                              </button>
                            ))}

                            {smallPosts.length < 4 && (
                              <div className="sm:col-span-2 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                                Add more stories in this category to fill the grid.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <Separator className="mb-14" />

              <section className="grid gap-8 lg:grid-cols-[1fr_0.6fr]">
                <div>
                  <div className="mb-6 flex items-end justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">All Stories</div>
                      <h2 className="mt-2 text-3xl font-serif font-black">The full network</h2>
                    </div>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    {rankedArticles.slice(0, 4).map(article => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        onClick={handleArticleClick}
                        variant="medium"
                      />
                    ))}
                  </div>
                </div>

                <aside className="space-y-6">
                  <div className="rounded-[2rem] border bg-card p-6">
                    <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Quick Links</div>
                    <div className="mt-4 space-y-3">
                      {sections.map((category) => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <span className="font-semibold">{category}</span>
                          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Open</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <AdBanner type="adskeeper" adConfig={adConfig} />
                </aside>
              </section>

              {articles.length === 0 && (
                <div className="text-center py-32">
                  <h2 className="text-2xl font-serif font-bold text-muted-foreground">No news available.</h2>
                </div>
              )}
            </div>
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
              <span className="text-xl font-serif font-black tracking-tighter uppercase">jshubnetwork</span>
            </div>
            <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">About</a>
              <a href="#" className="hover:text-primary transition-colors">Contact</a>
              <a href="#" className="hover:text-primary transition-colors">Privacy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms</a>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2026 jshubnetwork. Powered by Gemini AI.
            </p>
          </div>
        </div>
      </footer>
      
      <Toaster position="bottom-right" />
    </div>
  );
}

