import React from 'react';
import { uploadMediaAsset, openFacebookStoryComposer, checkAdminSession, loginAdmin } from '../lib/newsApi';
import { storage } from '../lib/storage';
import { FacebookConfig, MetaConfig } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2, Upload, Facebook, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface StoryTestPageProps {
  onBackToAdmin: () => void;
}

const defaultFacebookConfig: FacebookConfig = {
  pageName: 'jshubnetwork',
  storyCtaText: 'Swipe to read',
  storyLinkLabel: 'Swipe up to read',
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const StoryTestPage: React.FC<StoryTestPageProps> = ({ onBackToAdmin }) => {
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [username, setUsername] = React.useState('admin');
  const [password, setPassword] = React.useState('admin123');
  const [facebookConfig, setFacebookConfig] = React.useState<FacebookConfig>(defaultFacebookConfig);
  const [metaConfig, setMetaConfig] = React.useState<MetaConfig>({
    appId: '',
    appSecret: '',
    pageId: '',
    pageAccessToken: '',
  });
  const [title, setTitle] = React.useState('Story Test');
  const [summary, setSummary] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [articleUrl, setArticleUrl] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const loadPage = async () => {
      try {
        const [session, publicState, adminState] = await Promise.all([
          checkAdminSession(),
          storage.loadPublicState(),
          storage.loadAdminState(),
        ]);
        setIsAuthenticated(session.authenticated);
        setFacebookConfig(publicState.facebookConfig || defaultFacebookConfig);
        setMetaConfig(adminState.metaConfig);
        if (!session.authenticated) {
          localStorage.removeItem('nova_admin_session_token');
        }
      } catch (error) {
        console.error(error);
        toast.error('Could not load the story test page.');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    loadPage();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('Enter your admin username and password first.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const result = await loginAdmin(username.trim(), password);
      if (result.token) {
        localStorage.setItem('nova_admin_session_token', result.token);
      }
      setIsAuthenticated(true);
      toast.success('Logged in.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to log in.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await uploadMediaAsset({ name: file.name, dataUrl });
      const nextUrl = result.asset?.optimizedUrl || result.asset?.sourceUrl || '';
      if (!nextUrl) {
        throw new Error('No usable image URL was returned.');
      }
      setImageUrl(nextUrl);
      toast.success('Photo uploaded.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !imageUrl.trim() || !articleUrl.trim()) {
      toast.error('Add a title, a photo, and a link first.');
      return;
    }

    if (!metaConfig.pageId.trim() || !metaConfig.pageAccessToken.trim()) {
      toast.error('Save your Meta Page ID and Page Access Token in Admin first.');
      return;
    }

    setIsPublishing(true);
    try {
      const result = await openFacebookStoryComposer({
        title: title.trim(),
        summary: summary.trim(),
        category: 'Facts',
        imageUrl: imageUrl.trim(),
        portraitImageUrl: imageUrl.trim(),
        storyCtaText: facebookConfig.storyCtaText,
        storyLinkLabel: facebookConfig.storyLinkLabel,
        pageName: facebookConfig.pageName,
        pageId: metaConfig.pageId,
        pageAccessToken: metaConfig.pageAccessToken,
        articleUrl: articleUrl.trim(),
        isBreaking: false,
      });

      if (result.published) {
        toast.success('Facebook story published with the link sticker.');
      } else {
        toast.warning(result.message || 'The story did not publish.');
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish story.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="container mx-auto px-4 py-32 text-center">
        <p className="text-muted-foreground">Loading story test page...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-md rounded-[2rem] border bg-card p-8 shadow-sm">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-serif font-black">Story Test Login</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your admin login to open the story test page.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="storyTestUsername">Username</Label>
              <Input
                id="storyTestUsername"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storyTestPassword">Password</Label>
              <Input
                id="storyTestPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full gap-2" onClick={handleLogin} disabled={isLoggingIn}>
              {isLoggingIn ? <Loader2 className="animate-spin" size={16} /> : <Facebook size={16} />}
              {isLoggingIn ? 'Signing in...' : 'Log In'}
            </Button>
            <Button variant="ghost" className="w-full gap-2" onClick={onBackToAdmin}>
              <ArrowLeft size={16} />
              Back to Admin
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold mb-2">Story Test Page</h1>
          <p className="text-muted-foreground">
            Upload one photo, paste one link, and publish using the Facebook composer.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBackToAdmin} className="gap-2">
            <ArrowLeft size={16} />
            Back to Admin
          </Button>
        </div>
      </div>

      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Quick Story Publish</CardTitle>
          <CardDescription>
            This uses the saved Meta settings and the strict link-sticker composer flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />

          <div className="space-y-2">
            <Label htmlFor="storyTestTitle">Title</Label>
            <Input
              id="storyTestTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Story headline"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storyTestSummary">Summary</Label>
            <textarea
              id="storyTestSummary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional summary text"
              className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storyTestImage">Photo</Label>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                {isUploading ? 'Uploading...' : 'Upload Photo'}
              </Button>
              {imageUrl && (
                <Button type="button" variant="ghost" onClick={() => setImageUrl('')}>
                  Clear Photo
                </Button>
              )}
            </div>
            {imageUrl && (
              <div className="overflow-hidden rounded-2xl border bg-muted/20">
                <img src={imageUrl} alt="Story preview" className="h-64 w-full object-cover" referrerPolicy="no-referrer" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="storyTestLink">Article Link</Label>
            <Input
              id="storyTestLink"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://your-site.com/article"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handlePublish} disabled={isPublishing} className="gap-2">
              {isPublishing ? <Loader2 className="animate-spin" size={14} /> : <Facebook size={14} />}
              {isPublishing ? 'Publishing...' : 'Post Story'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
