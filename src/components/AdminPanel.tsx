import React from 'react';
import { changeAdminPassword, generateNewsArticle, checkAIStatus, clearOpenAIKey, saveOpenAIKey, testFacebookStoryPublish, testMetaConnection, logoutAdmin, publishFacebookStory, loadMediaLibrary, uploadMediaAsset, regenerateMediaAsset } from '../lib/newsApi';
import { storage } from '../lib/storage';
import { Article, Category, AdConfig, AiConfig, DraftArticle, FacebookConfig, MediaAsset, MetaConfig } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Loader2, RefreshCw, Trash2, Wand2, Megaphone, 
  FileText, Settings, CheckCircle2, XCircle, ClipboardList, Send, Ban, Key, ShieldCheck, Upload, Image as ImageIcon, Copy, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface AdminPanelProps {
  onArticlesUpdate: () => void;
  onLogout: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onArticlesUpdate, onLogout }) => {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [drafts, setDrafts] = React.useState<DraftArticle[]>([]);
  const [mediaAssets, setMediaAssets] = React.useState<MediaAsset[]>([]);
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
    storyLinkLabel: 'Swipe up to read',
  });
  const [metaConfig, setMetaConfig] = React.useState<MetaConfig>({
    appId: '',
    appSecret: '',
    pageId: '',
    pageAccessToken: '',
  });
  const [aiStatus, setAiStatus] = React.useState<{ connected: boolean; model: string; provider: string; keySource?: 'database' | 'environment' | 'none' } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const [isTestingMeta, setIsTestingMeta] = React.useState(false);
  const [metaTestResult, setMetaTestResult] = React.useState<{ pageName?: string; tokenType?: string; scopes?: string[]; message?: string } | null>(null);
  const [isPublishingTest, setIsPublishingTest] = React.useState(false);
  const [openaiKey, setOpenaiKey] = React.useState('');
  const [republishingArticleId, setRepublishingArticleId] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isLoadingMedia, setIsLoadingMedia] = React.useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = React.useState(false);
  const [regeneratingAssetId, setRegeneratingAssetId] = React.useState<string | null>(null);
  const mediaInputRef = React.useRef<HTMLInputElement | null>(null);

  const buildArticleUrl = (id: string) => `${window.location.origin}/?post=${id}`;

  React.useEffect(() => {
    const loadState = async () => {
      try {
        await storage.migrateLegacyLocalStorage();
        const [publicState, adminState, mediaState] = await Promise.all([
          storage.loadPublicState(),
          storage.loadAdminState(),
          loadMediaLibrary(),
        ]);
        setArticles(publicState.articles);
        setAdConfig(publicState.ads);
        setAiConfig(publicState.aiConfig);
        setFacebookConfig(publicState.facebookConfig);
        setDrafts(adminState.drafts);
        setMetaConfig(adminState.metaConfig);
        setMediaAssets(mediaState.assets);
        handleCheckStatus();
      } catch (error) {
        console.error(error);
        toast.error('Failed to load database content.');
      }
    };

    loadState();
  }, []);

  React.useEffect(() => {
    const legacyKey = localStorage.getItem('nova_openai_key');
    if (!legacyKey) {
      return;
    }

    const migrateLegacyKey = async () => {
      try {
        await saveOpenAIKey(legacyKey);
        localStorage.removeItem('nova_openai_key');
        toast.success("Migrated your saved OpenAI key into the database.");
        handleCheckStatus();
      } catch (error) {
        console.error(error);
        toast.error("Could not migrate the saved OpenAI key.");
      }
    };

    migrateLegacyKey();
  }, []);

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const status = await checkAIStatus();
      setAiStatus(status);
    } catch (error) {
      console.error(error);
      setAiStatus({ connected: false, model: 'Unknown', provider: 'OpenAI', keySource: 'none' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleGenerate = async (category: Category) => {
    setIsGenerating(true);
    try {
      const newArticleData = await generateNewsArticle(category, aiConfig, imagePrompt);
      const draft: DraftArticle = {
        id: Math.random().toString(36).substr(2, 9),
        ...(newArticleData as any),
        createdAt: new Date().toISOString(),
        imagePrompt,
        facebookStoryStatus: 'pending',
      };
      const savedDraft = await storage.saveDraft(draft);
      setDrafts((current) => [savedDraft, ...current.filter((item) => item.id !== savedDraft.id)]);
      await refreshMediaLibrary();
      setImagePrompt('');

      const canPublishStory = metaConfig.pageId.trim() && metaConfig.pageAccessToken.trim();
      if (canPublishStory) {
        try {
          await publishFacebookStory({
            title: newArticleData.title || category,
            summary: newArticleData.summary || '',
            category,
            imageUrl: newArticleData.imageUrl || draft.imageUrl,
            portraitImageUrl: newArticleData.portraitImageUrl || draft.portraitImageUrl,
            storyCtaText: facebookConfig.storyCtaText,
            storyLinkLabel: facebookConfig.storyLinkLabel,
            pageName: facebookConfig.pageName,
            pageId: metaConfig.pageId,
            pageAccessToken: metaConfig.pageAccessToken,
            articleUrl: buildArticleUrl(draft.id),
            isBreaking: Boolean(newArticleData.isBreaking),
          });
          const updatedDraft = await storage.saveDraft({
            ...savedDraft,
            facebookStoryStatus: 'posted',
            facebookStoryPublishedAt: new Date().toISOString(),
            facebookStoryError: undefined,
          });
          setDrafts((current) => current.map((item) => (item.id === updatedDraft.id ? updatedDraft : item)));
          toast.success("Facebook Story published automatically.");
        } catch (storyError) {
          console.error("Facebook story publish failed:", storyError);
          const updatedDraft = await storage.saveDraft({
            ...savedDraft,
            facebookStoryStatus: 'failed',
            facebookStoryError: storyError instanceof Error ? storyError.message : 'Facebook Story publish failed.',
          });
          setDrafts((current) => current.map((item) => (item.id === updatedDraft.id ? updatedDraft : item)));
          toast.warning("Draft saved, but Facebook Story publish failed.");
        }
      } else {
        const updatedDraft = await storage.saveDraft({
          ...savedDraft,
          facebookStoryStatus: 'skipped',
          facebookStoryError: 'Meta credentials not configured.',
        });
        setDrafts((current) => current.map((item) => (item.id === updatedDraft.id ? updatedDraft : item)));
      }
      
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

  const handlePublishDraft = async (id: string) => {
    try {
      const published = await storage.publishDraft(id);
      if (!published) {
        toast.error("Draft not found.");
        return;
      }
      setArticles((current) => [published, ...current.filter((item) => item.id !== published.id)]);
      setDrafts((current) => current.filter((draft) => draft.id !== id));
      onArticlesUpdate();
      await refreshMediaLibrary();
      toast.success(`Published "${published.title}"`);
    } catch (error: any) {
      console.error("Publish failed:", error);
      toast.error(error?.message || "Failed to publish draft.");
    }
  };

  const handleDeleteDraft = async (id: string) => {
    await storage.deleteDraft(id);
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    await refreshMediaLibrary();
    toast.info("Draft removed.");
  };

  const handleDelete = async (id: string) => {
    await storage.deleteArticle(id);
    setArticles((current) => current.filter((article) => article.id !== id));
    onArticlesUpdate();
    await refreshMediaLibrary();
    toast.info("Article deleted.");
  };

  const handleRepublishStory = async (article: Article) => {
    const hasMetaConfig = metaConfig.pageId.trim() && metaConfig.pageAccessToken.trim();
    if (!hasMetaConfig) {
      toast.error("Meta credentials are required to publish a story.");
      return;
    }

    setRepublishingArticleId(article.id);
    try {
      const result = await publishFacebookStory({
        title: article.title,
        summary: article.summary,
        category: article.category,
        imageUrl: article.imageUrl,
        portraitImageUrl: article.portraitImageUrl,
        imageSourceUrl: article.imageSourceUrl,
        portraitImageSourceUrl: article.portraitImageSourceUrl,
        storyCtaText: facebookConfig.storyCtaText,
        storyLinkLabel: facebookConfig.storyLinkLabel,
        pageName: facebookConfig.pageName,
        pageId: metaConfig.pageId,
        pageAccessToken: metaConfig.pageAccessToken,
        articleUrl: buildArticleUrl(article.id),
        isBreaking: Boolean(article.isBreaking),
      });

      const postId =
        typeof result?.result === 'object' && result.result
          ? (result.result as { post_id?: string; id?: string }).post_id || (result.result as { post_id?: string; id?: string }).id
          : undefined;

      const updatedArticle: Article = {
        ...article,
        facebookStoryStatus: 'posted',
        facebookStoryPublishedAt: new Date().toISOString(),
        facebookStoryError: undefined,
        facebookStoryPostId: postId,
      };

      const savedArticle = await storage.saveArticle(updatedArticle);
      setArticles((current) =>
        current.map((item) => (item.id === savedArticle.id ? savedArticle : item))
      );
      onArticlesUpdate();
      toast.success(`Republished "${article.title}" to Facebook Story.`);
    } catch (error) {
      console.error("Republish to story failed:", error);

      const failedArticle: Article = {
        ...article,
        facebookStoryStatus: 'failed',
        facebookStoryError: error instanceof Error ? error.message : 'Facebook Story publish failed.',
      };

      try {
        const savedArticle = await storage.saveArticle(failedArticle);
        setArticles((current) =>
          current.map((item) => (item.id === savedArticle.id ? savedArticle : item))
        );
        onArticlesUpdate();
      } catch (persistError) {
        console.error("Failed to persist story publish failure:", persistError);
      }

      toast.error(error instanceof Error ? error.message : "Failed to republish story.");
    } finally {
      setRepublishingArticleId(null);
    }
  };

  const handleResetContent = async () => {
    const confirmed = window.confirm('This will delete all articles and drafts. Continue?');
    if (!confirmed) return;

    try {
      await storage.resetContent();
      setArticles([]);
      setDrafts([]);
      onArticlesUpdate();
      await refreshMediaLibrary();
      toast.success('Articles and drafts cleared.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to clear content.');
    }
  };

  const handleSaveAds = async () => {
    const saved = await storage.saveAds(adConfig);
    setAdConfig(saved);
    toast.success("Ad configuration saved.");
  };

  const handleSaveAI = async () => {
    const saved = await storage.saveAIConfig(aiConfig);
    setAiConfig(saved);
    toast.success("AI configuration saved.");
  };

  const handleSaveOpenAIKey = () => {
    const trimmedKey = openaiKey.trim();
    if (!trimmedKey) {
      toast.error("Please enter an OpenAI API key.");
      return;
    }

    saveOpenAIKey(trimmedKey)
      .then(() => {
        setOpenaiKey('');
        handleCheckStatus();
        toast.success("OpenAI API key saved in the database.");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to save OpenAI key.");
      });
  };

  const handleClearOpenAIKey = () => {
    clearOpenAIKey()
      .then(() => {
        setOpenaiKey('');
        handleCheckStatus();
        toast.info("OpenAI API key cleared from the database.");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to clear OpenAI key.");
      });
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    changeAdminPassword(currentPassword, newPassword)
      .then(async () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await logoutAdmin();
        toast.success("Password updated. Please log in again.");
        window.location.href = '/admin';
      })
      .catch((error) => {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to change password.");
      });
  };

  const handleLogout = () => {
    logoutAdmin()
      .then(() => {
        onLogout();
        toast.info("Logged out.");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to log out.");
      });
  };

  const handleSaveFacebook = async () => {
    const saved = await storage.saveFacebookConfig(facebookConfig);
    setFacebookConfig(saved);
    toast.success("Facebook story settings saved.");
  };

  const handleSaveMeta = async () => {
    const saved = await storage.saveMetaConfig(metaConfig);
    setMetaConfig(saved);
    toast.success("Meta credentials saved in the database.");
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

  const handleTestFacebookPublish = async () => {
    if (!metaConfig.pageId.trim() || !metaConfig.pageAccessToken.trim()) {
      toast.error("Add your Meta Page ID and Page Access Token first.");
      return;
    }

    setIsPublishingTest(true);
    try {
      await testFacebookStoryPublish({
        pageId: metaConfig.pageId,
        pageAccessToken: metaConfig.pageAccessToken,
        pageName: facebookConfig.pageName,
        storyCtaText: facebookConfig.storyCtaText,
        storyLinkLabel: facebookConfig.storyLinkLabel,
      });
      toast.success("Test Facebook Story published.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Test Facebook Story publish failed.");
    } finally {
      setIsPublishingTest(false);
    }
  };

  const refreshMediaLibrary = async () => {
    setIsLoadingMedia(true);
    try {
      const mediaState = await loadMediaLibrary();
      setMediaAssets(mediaState.assets);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to load media library.');
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const handleUploadMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    setIsUploadingMedia(true);
    try {
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        await uploadMediaAsset({ name: file.name, dataUrl });
      }
      await refreshMediaLibrary();
      toast.success(`Uploaded ${files.length} image${files.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload media.');
    } finally {
      setIsUploadingMedia(false);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = '';
      }
    }
  };

  const handleRegenerateMedia = async (assetId: string) => {
    setRegeneratingAssetId(assetId);
    try {
      await regenerateMediaAsset(assetId);
      await refreshMediaLibrary();
      toast.success('Media regenerated.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate media.');
    } finally {
      setRegeneratingAssetId(null);
    }
  };

  const handleCopyMediaUrl = async (url: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${url}`);
    toast.success('Media URL copied.');
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold mb-2">jshubnetwork Dashboard</h1>
          <p className="text-muted-foreground">Manage your content, advertising, and AI connection from /admin.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Provider</p>
            <p className="text-sm font-medium">{aiStatus?.provider || 'Loading status'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {aiStatus?.keySource === 'database'
                ? 'OpenAI key stored in PostgreSQL'
                : aiStatus?.keySource === 'environment'
                  ? 'Using server environment key'
                  : 'No OpenAI key saved'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCheckStatus} disabled={isCheckingStatus} className="gap-2">
            {isCheckingStatus ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Refresh Status
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            Log Out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="space-y-8">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="content" className="gap-2">
            <FileText size={16} />
            Content
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <ClipboardList size={16} />
            Review
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-2">
            <ImageIcon size={16} />
            Media
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
                    Select a category to generate a new article using {aiStatus?.provider || 'the configured AI provider'}.
                  </CardDescription>
                </div>
                <Badge variant={aiStatus?.provider?.includes('Fallback') ? 'secondary' : 'default'} className="gap-1">
                  {aiStatus?.connected ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {aiStatus?.provider || 'Checking'}
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
                          <Badge
                            variant={
                              article.facebookStoryStatus === 'posted'
                                ? 'default'
                                : article.facebookStoryStatus === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            Facebook Story: {article.facebookStoryStatus || 'pending'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(article.publishedAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg">{article.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">{article.summary}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={republishingArticleId === article.id}
                        onClick={() => handleRepublishStory(article)}
                      >
                        {republishingArticleId === article.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Republish to Story
                      </Button>
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
                            <Badge
                              variant={
                                draft.facebookStoryStatus === 'posted'
                                  ? 'default'
                                  : draft.facebookStoryStatus === 'failed'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              Facebook Story: {draft.facebookStoryStatus || 'pending'}
                            </Badge>
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
                        <p><span className="font-semibold">Facebook Story:</span> {draft.facebookStoryStatus || 'pending'}</p>
                        {draft.facebookStoryPublishedAt && (
                          <p><span className="font-semibold">Posted:</span> {new Date(draft.facebookStoryPublishedAt).toLocaleString()}</p>
                        )}
                      </div>
                      {draft.facebookStoryError && draft.facebookStoryStatus === 'failed' && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                          {draft.facebookStoryError}
                        </div>
                      )}

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

        <TabsContent value="media" className="space-y-8">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Media Library</CardTitle>
                  <CardDescription>
                    Upload optimized images, inspect stored assets, and regenerate files from their original source.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={refreshMediaLibrary} disabled={isLoadingMedia} className="gap-2">
                    {isLoadingMedia ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Refresh Library
                  </Button>
                  <Button onClick={() => mediaInputRef.current?.click()} disabled={isUploadingMedia} className="gap-2">
                    {isUploadingMedia ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                    Upload Media
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUploadMedia}
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mediaAssets.map((asset) => (
                  <Card key={asset.id} className="overflow-hidden">
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={asset.optimizedUrl}
                        alt={asset.name}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <CardContent className="space-y-4 p-4">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{asset.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {asset.width} x {asset.height} · {(asset.sizeBytes / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Badge variant="secondary">{asset.kind}</Badge>
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground">{asset.sourceUrl}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => handleCopyMediaUrl(asset.optimizedUrl)}>
                          <Copy size={14} />
                          Copy URL
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => handleRegenerateMedia(asset.id)}
                          disabled={regeneratingAssetId === asset.id}
                        >
                          {regeneratingAssetId === asset.id ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                          Regenerate
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {mediaAssets.length === 0 && (
                <div className="rounded-2xl border border-dashed p-12 text-center">
                  <ImageIcon className="mx-auto mb-4 text-muted-foreground" size={40} />
                  <p className="text-muted-foreground">No media assets yet. Upload an image or generate a story to fill the library.</p>
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
                    <h3 className="font-bold text-lg">AI Status: {aiStatus?.connected ? 'Connected' : 'Disconnected'}</h3>
                    <p className="text-sm text-muted-foreground">
                      {aiStatus?.connected 
                        ? `Using ${aiStatus.provider} ${aiStatus.model} for content generation.` 
                        : "Set an OpenAI API key on the server or use Gemini fallback."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-6">
                <div>
                  <h3 className="text-lg font-bold">OpenAI API Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Save an OpenAI key here to store it in PostgreSQL on Railway. The browser does not keep a copy.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openaiKey">OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      id="openaiKey"
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="pr-10"
                    />
                    <Key className="pointer-events-none absolute right-3 top-2.5 text-muted-foreground" size={16} />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <ShieldCheck size={14} />
                    The key is saved server-side and used by the AI endpoints from there.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSaveOpenAIKey} className="gap-2">
                    <Key size={14} />
                    Save OpenAI Key
                  </Button>
                  <Button variant="outline" onClick={handleClearOpenAIKey}>
                    Clear Saved Key
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-6">
                <div>
                  <h3 className="text-lg font-bold">Admin Password</h3>
                  <p className="text-sm text-muted-foreground">
                    Update the admin login password. The default login is <code>admin / admin123</code> until you change it.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <Button onClick={handleChangePassword} className="w-full md:w-auto">
                  Update Admin Password
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
                <div>
                  <h3 className="text-lg font-bold text-destructive">Clear Content</h3>
                  <p className="text-sm text-muted-foreground">
                    Delete every article and draft from the database. This does not touch admin sessions or settings.
                  </p>
                </div>

                <Button variant="destructive" onClick={handleResetContent} className="w-full md:w-auto">
                  Clear Posts and Drafts
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

                <Button variant="secondary" onClick={handleTestFacebookPublish} disabled={isPublishingTest} className="w-full md:w-auto gap-2">
                  {isPublishingTest ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  Test Facebook Story Publish
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

    </div>
  );
};
