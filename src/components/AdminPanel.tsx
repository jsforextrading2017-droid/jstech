import React from 'react';
import { generateNewsArticle, checkAIStatus, testMetaConnection } from '../lib/newsApi';
import { storage } from '../lib/storage';
import { Article, Category, AdConfig, AiConfig, DraftArticle, FacebookConfig, MetaConfig } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Loader2, Plus, RefreshCw, Trash2, Wand2, Megaphone, 
  FileText, Settings, CheckCircle2, XCircle, AlertCircle, 
  ExternalLink, LogOut, LogIn, Key, ShieldCheck, ClipboardList, Send, Ban 
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  onArticlesUpdate: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onArticlesUpdate }) => {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [drafts, setDrafts] = React.useState<DraftArticle[]>([]);
  const [adConfig, setAdConfig] = React.useState<AdConfig>({ adsenseCode: '', adsKeeperCode: '', showAds: false });
  const [aiConfig, setAiConfig] = React.useState<AiConfig>({
    ctaText: 'Read the full story',
    tone: 'bold',
    imageStyle: 'editorial',
  });
  const [imagePrompt, setImagePrompt] = React.useState('');
  const [facebookConfig, setFacebookConfig] = React.useState<FacebookConfig>({
    pageName: 'jshubnetwork',
    storyCtaText: 'Swipe to read',
    storyLinkLabel: 'Read more',
  });
  const [metaConfig, setMetaConfig] = React.useState<MetaConfig>({
    appId: '',
    appSecret: '',
    pageId: '',
    pageAccessToken: '',
  });
  const [aiStatus, setAiStatus] = React.useState<{ connected: boolean; model: string; provider: string; isClientKey?: boolean } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const [isTestingMeta, setIsTestingMeta] = React.useState(false);
  const [metaTestResult, setMetaTestResult] = React.useState<{ pageName?: string; tokenType?: string; scopes?: string[]; message?: string } | null>(null);
  const [showLoginModal, setShowLoginModal] = React.useState(false);
  const [tempKey, setTempKey] = React.useState('');

  React.useEffect(() => {
    setArticles(storage.getArticles());
    setDrafts(storage.getDrafts());
    setAdConfig(storage.getAds());
    setAiConfig(storage.getAIConfig());
    setFacebookConfig(storage.getFacebookConfig());
    setMetaConfig(storage.getMetaConfig());
    handleCheckStatus();
  }, []);

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const status = await checkAIStatus();
      setAiStatus(status);
    } catch (error) {
      console.error(error);
      setAiStatus({ connected: false, model: 'Unknown', provider: 'OpenAI' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleLogin = async () => {
    if (!tempKey.trim()) {
      toast.error("Please enter your OpenAI API Key.");
      return;
    }
    
    setIsCheckingStatus(true);
    // Temporarily save to test
    const oldKey = localStorage.getItem('nova_openai_key');
    localStorage.setItem('nova_openai_key', tempKey);
    
    try {
      const status = await checkAIStatus();
      if (status.connected) {
        setAiStatus(status);
        setShowLoginModal(false);
        setTempKey('');
        toast.success("Successfully signed in to ChatGPT!");
      } else {
        localStorage.setItem('nova_openai_key', oldKey || '');
        toast.error("Invalid API Key. Please check and try again.");
      }
    } catch (error) {
      localStorage.setItem('nova_openai_key', oldKey || '');
      toast.error("Failed to verify key.");
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('nova_openai_key');
    handleCheckStatus();
    toast.info("Signed out of ChatGPT.");
  };

  const refreshCollections = () => {
    setArticles(storage.getArticles());
    setDrafts(storage.getDrafts());
    onArticlesUpdate();
  };

  const handleGenerate = async (category: Category) => {
    if (!aiStatus?.connected) {
      setShowLoginModal(true);
      return;
    }
    setIsGenerating(true);
    try {
      const newArticleData = await generateNewsArticle(category, aiConfig, imagePrompt);
      const draft: DraftArticle = {
        id: Math.random().toString(36).substr(2, 9),
        ...(newArticleData as any),
        createdAt: new Date().toISOString(),
        imagePrompt,
      };
      storage.saveDraft(draft);
      setDrafts(storage.getDrafts());
      setImagePrompt('');
      
      if (newArticleData.warning) {
        toast.warning("OpenAI Quota Exceeded", {
          description: "The draft was saved using Gemini fallback. Review it before publishing.",
          duration: 5000,
        });
      } else {
        toast.success(`Generated new ${category} draft!`);
      }
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("Quota Exceeded")) {
        toast.error("OpenAI Quota Exceeded", {
          description: "Your account has reached its billing limit. Please check your OpenAI dashboard.",
          duration: 6000,
        });
      } else {
        toast.error(error.message || "Failed to generate article.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishDraft = (id: string) => {
    try {
      const published = storage.publishDraft(id);
      if (!published) {
        toast.error("Draft not found.");
        return;
      }
      setArticles(storage.getArticles());
      setDrafts(storage.getDrafts());
      onArticlesUpdate();
      toast.success(`Published "${published.title}"`);
    } catch (error: any) {
      console.error("Publish failed:", error);
      const message = String(error?.message || error);
      if (message.includes("QuotaExceededError") || message.toLowerCase().includes("quota")) {
        toast.error("Browser storage is full.", {
          description: "Delete older drafts or regenerate with the new URL-based image flow.",
          duration: 7000,
        });
      } else {
        toast.error(message || "Failed to publish draft.");
      }
    }
  };

  const handleDeleteDraft = (id: string) => {
    storage.deleteDraft(id);
    setDrafts(storage.getDrafts());
    toast.info("Draft removed.");
  };

  const handleDelete = (id: string) => {
    storage.deleteArticle(id);
    setArticles(storage.getArticles());
    onArticlesUpdate();
    toast.info("Article deleted.");
  };

  const handleSaveAds = () => {
    storage.saveAds(adConfig);
    toast.success("Ad configuration saved.");
  };

  const handleSaveAI = () => {
    storage.saveAIConfig(aiConfig);
    toast.success("AI configuration saved.");
  };

  const handleSaveFacebook = () => {
    storage.saveFacebookConfig(facebookConfig);
    toast.success("Facebook story settings saved.");
  };

  const handleSaveMeta = () => {
    storage.saveMetaConfig(metaConfig);
    toast.success("Meta credentials saved locally for testing.");
  };

  const handleTestMeta = async () => {
    setIsTestingMeta(true);
    setMetaTestResult(null);
    try {
      const result = await testMetaConnection(metaConfig);
      setMetaTestResult(result);
      toast.success("Meta credentials verified.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Meta credentials test failed.");
      setMetaTestResult({
        message: error.message || "Meta credentials test failed.",
      });
    } finally {
      setIsTestingMeta(false);
    }
  };

  if (!aiStatus?.connected && !showLoginModal) {
    return (
      <div className="container mx-auto px-4 py-24 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-8">
          <Key className="text-primary" size={40} />
        </div>
        <h1 className="text-4xl font-serif font-bold mb-4">Admin Authentication</h1>
        <p className="text-muted-foreground max-w-md mb-12">
          jshubnetwork uses ChatGPT to generate high-quality editorial content. Sign in with your OpenAI account to begin.
        </p>
        <Button size="lg" onClick={() => setShowLoginModal(true)} className="gap-2 px-8 h-12 text-lg">
          <LogIn size={20} />
          Sign in with ChatGPT
        </Button>
        <p className="mt-8 text-xs text-muted-foreground flex items-center gap-1">
          <ShieldCheck size={14} />
          Your API key is stored locally and used only for generation.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold mb-2">jshubnetwork Dashboard</h1>
          <p className="text-muted-foreground">Manage your content, advertising, and AI connection.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Account</p>
            <p className="text-sm font-medium">{aiStatus?.isClientKey ? 'Personal API Key' : 'System Account'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut size={14} />
            Sign Out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="space-y-8">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="content" className="gap-2">
            <FileText size={16} />
            Content
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <ClipboardList size={16} />
            Review
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-2">
            <Megaphone size={16} />
            Ads
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings size={16} />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-8">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Generate News</CardTitle>
                  <CardDescription>
                    Select a category to generate a new article using {aiStatus?.provider || 'AI'}.
                  </CardDescription>
                </div>
                <Badge variant={aiStatus?.provider?.includes('Fallback') ? 'secondary' : 'default'} className="gap-1">
                  {aiStatus?.connected ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {aiStatus?.provider || 'Disconnected'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-6">
                <Label htmlFor="imagePrompt">Image Prompt for This Story</Label>
                <textarea
                  id="imagePrompt"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Example: college football coach on the sideline using a tablet with AI analytics overlays, stadium lights, intense action..."
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  This prompt is used as the main visual direction for the generated image.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {(['Tech', 'Travel', 'Animal', 'Facts', 'Cars', 'Building Homes'] as Category[]).map((cat) => (
                  <Button
                    type="button"
                    key={cat}
                    variant="outline"
                    disabled={isGenerating}
                    onClick={() => handleGenerate(cat)}
                    className="gap-2 min-w-[140px]"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                    {cat}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6">
            <h2 className="text-xl font-bold font-serif">Recent Articles</h2>
            {articles.map((article) => (
              <Card key={article.id} className="group overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-48 h-32 overflow-hidden">
                    <img src={article.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary">{article.category}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(article.publishedAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg">{article.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">{article.summary}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() => handleDelete(article.id)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            
            {articles.length === 0 && (
              <div className="text-center py-24 border-2 border-dashed rounded-xl">
                <p className="text-muted-foreground">No articles yet. Start by generating some news!</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="review" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Draft Review Queue</CardTitle>
              <CardDescription>
                Review drafts here before publishing them to the live site.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {drafts.map((draft) => (
                <Card key={draft.id} className="overflow-hidden border">
                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-56 h-40 overflow-hidden">
                      <img
                        src={draft.imageUrl}
                        alt={draft.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">{draft.category}</Badge>
                            {draft.warning && <Badge variant="outline">Fallback</Badge>}
                          </div>
                          <h3 className="text-xl font-bold">{draft.title}</h3>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{draft.summary}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => handleDeleteDraft(draft.id)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <p><span className="font-semibold">Author:</span> {draft.author}</p>
                        <p><span className="font-semibold">Image subject:</span> {draft.imageSubject || 'Not set'}</p>
                        <p><span className="font-semibold">Created:</span> {new Date(draft.createdAt).toLocaleString()}</p>
                        <p><span className="font-semibold">Image prompt:</span> {draft.imagePrompt || 'Not provided'}</p>
                      </div>

                      {draft.portraitImageUrl && (
                        <div className="rounded-2xl border bg-muted/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">Story Preview</div>
                          <div className="aspect-[9/16] max-w-[180px] overflow-hidden rounded-xl">
                            <img
                              src={draft.portraitImageUrl}
                              alt={`${draft.title} portrait preview`}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button type="button" onClick={() => handlePublishDraft(draft.id)} className="gap-2">
                          <Send size={14} />
                          Publish
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => handleDeleteDraft(draft.id)} className="gap-2">
                          <Ban size={14} />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {drafts.length === 0 && (
                <div className="text-center py-24 border-2 border-dashed rounded-xl">
                  <p className="text-muted-foreground">No drafts waiting for review.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads">
          <Card>
            <CardHeader>
              <CardTitle>Advertising Settings</CardTitle>
              <CardDescription>Configure your Google AdSense and Ads Keeper scripts here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-2 mb-4">
                <input
                  type="checkbox"
                  id="showAds"
                  checked={adConfig.showAds}
                  onChange={(e) => setAdConfig({ ...adConfig, showAds: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="showAds" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Enable Ads across the site
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adsense">Google AdSense Code</Label>
                <textarea
                  id="adsense"
                  placeholder="Paste your AdSense script or <ins> tag here..."
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  value={adConfig.adsenseCode}
                  onChange={(e) => setAdConfig({ ...adConfig, adsenseCode: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adskeeper">Ads Keeper Code</Label>
                <textarea
                  id="adskeeper"
                  placeholder="Paste your Ads Keeper script here..."
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  value={adConfig.adsKeeperCode}
                  onChange={(e) => setAdConfig({ ...adConfig, adsKeeperCode: e.target.value })}
                />
              </div>

              <Button onClick={handleSaveAds} className="w-full md:w-auto">
                Save Ad Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>Configure your jshubnetwork platform preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="p-6 rounded-xl border bg-muted/30 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${aiStatus?.connected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {aiStatus?.connected ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      ChatGPT Status: {aiStatus?.connected ? 'Connected' : 'Disconnected'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {aiStatus?.connected 
                        ? `Using ${aiStatus.provider} ${aiStatus.model} for content generation.` 
                        : "Sign in to enable AI capabilities."}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleCheckStatus} 
                  disabled={isCheckingStatus}
                  className="gap-2"
                >
                  {isCheckingStatus ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  Refresh Status
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border p-6">
                <div>
                  <h3 className="text-lg font-bold">CTA and Cover Image</h3>
                  <p className="text-sm text-muted-foreground">
                    Control the article hook and the photo style generated from each title.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ctaText">CTA Text</Label>
                  <Input
                    id="ctaText"
                    value={aiConfig.ctaText}
                    onChange={(e) => setAiConfig({ ...aiConfig, ctaText: e.target.value })}
                    placeholder="Read the full story"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tone">Writing Tone</Label>
                    <select
                      id="tone"
                      value={aiConfig.tone}
                      onChange={(e) => setAiConfig({ ...aiConfig, tone: e.target.value as AiConfig['tone'] })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="urgent">Urgent</option>
                      <option value="bold">Bold</option>
                      <option value="inspiring">Inspiring</option>
                      <option value="investigative">Investigative</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="imageStyle">Cover Photo Style</Label>
                    <select
                      id="imageStyle"
                      value={aiConfig.imageStyle}
                      onChange={(e) => setAiConfig({ ...aiConfig, imageStyle: e.target.value as AiConfig['imageStyle'] })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="editorial">Editorial</option>
                      <option value="dramatic">Dramatic</option>
                      <option value="modern">Modern</option>
                      <option value="clean">Clean</option>
                    </select>
                  </div>
                </div>

                <Button onClick={handleSaveAI} className="w-full md:w-auto">
                  Save AI Configuration
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border p-6">
                <div>
                  <h3 className="text-lg font-bold">Facebook Story Setup</h3>
                  <p className="text-sm text-muted-foreground">
                    Prepare the Page Story package and CTA text. Automatic publishing still requires Meta-approved story access.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pageName">Facebook Page Name</Label>
                  <Input
                    id="pageName"
                    value={facebookConfig.pageName}
                    onChange={(e) => setFacebookConfig({ ...facebookConfig, pageName: e.target.value })}
                    placeholder="jshubnetwork"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storyCtaText">Story CTA Text</Label>
                  <Input
                    id="storyCtaText"
                    value={facebookConfig.storyCtaText}
                    onChange={(e) => setFacebookConfig({ ...facebookConfig, storyCtaText: e.target.value })}
                    placeholder="Swipe to read"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storyLinkLabel">Link Label</Label>
                  <Input
                    id="storyLinkLabel"
                    value={facebookConfig.storyLinkLabel}
                    onChange={(e) => setFacebookConfig({ ...facebookConfig, storyLinkLabel: e.target.value })}
                    placeholder="Read more"
                  />
                </div>

                <Button onClick={handleSaveFacebook} className="w-full md:w-auto">
                  Save Facebook Settings
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border p-6">
                <div>
                  <h3 className="text-lg font-bold">Meta API Credentials</h3>
                  <p className="text-sm text-muted-foreground">
                    Store your app ID, app secret, page ID, and page access token locally so we can test the publishing flow on this machine.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaAppId">App ID</Label>
                  <Input
                    id="metaAppId"
                    value={metaConfig.appId}
                    onChange={(e) => setMetaConfig({ ...metaConfig, appId: e.target.value })}
                    placeholder="123456789012345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaAppSecret">App Secret</Label>
                  <Input
                    id="metaAppSecret"
                    type="password"
                    value={metaConfig.appSecret}
                    onChange={(e) => setMetaConfig({ ...metaConfig, appSecret: e.target.value })}
                    placeholder="••••••••••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaPageId">Page ID</Label>
                  <Input
                    id="metaPageId"
                    value={metaConfig.pageId}
                    onChange={(e) => setMetaConfig({ ...metaConfig, pageId: e.target.value })}
                    placeholder="123456789012345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaPageAccessToken">Page Access Token</Label>
                  <Input
                    id="metaPageAccessToken"
                    type="password"
                    value={metaConfig.pageAccessToken}
                    onChange={(e) => setMetaConfig({ ...metaConfig, pageAccessToken: e.target.value })}
                    placeholder="EAAB..."
                  />
                </div>

                <Button onClick={handleSaveMeta} className="w-full md:w-auto">
                  Save Meta Credentials
                </Button>

                <Button variant="outline" onClick={handleTestMeta} disabled={isTestingMeta} className="w-full md:w-auto gap-2">
                  {isTestingMeta ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  Test Meta Connection
                </Button>

                {metaTestResult && (
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm space-y-2">
                    <div className="font-semibold">
                      {metaTestResult.message || 'Meta test complete.'}
                    </div>
                    {metaTestResult.pageName && (
                      <p><span className="font-medium">Page:</span> {metaTestResult.pageName}</p>
                    )}
                    {metaTestResult.tokenType && (
                      <p><span className="font-medium">Token type:</span> {metaTestResult.tokenType}</p>
                    )}
                    {metaTestResult.scopes && metaTestResult.scopes.length > 0 && (
                      <p><span className="font-medium">Scopes:</span> {metaTestResult.scopes.join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold">Sign in to ChatGPT</h2>
                    <p className="text-sm text-muted-foreground">Connect your OpenAI account to generate news.</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowLoginModal(false)}>
                    <XCircle size={20} />
                  </Button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">OpenAI API Key</Label>
                    <div className="relative">
                      <Input 
                        id="apiKey"
                        type="password"
                        placeholder="sk-..."
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        className="pr-10"
                      />
                      <Key className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Your key is used only for generation and never shared.
                    </p>
                  </div>

                  <Button 
                    className="w-full h-11 gap-2" 
                    onClick={handleLogin}
                    disabled={isCheckingStatus}
                  >
                    {isCheckingStatus ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                    Connect Account
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-zinc-900 px-2 text-muted-foreground">Help</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-2">
                    <p className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-primary" />
                      Don't have an API key?
                    </p>
                    <a 
                      href="https://platform.openai.com/api-keys" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      Get one from OpenAI Dashboard <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
