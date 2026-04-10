import React from 'react';
import { Article } from '../types';
import { storage } from '../lib/storage';
import { Button } from './ui/button';
import { ArrowLeft, Share2, Bookmark, Clock, User, Download, Facebook, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Separator } from './ui/separator';
import { AdBanner } from './AdBanner';

interface ArticleDetailProps {
  article: Article;
  onBack: () => void;
}

export const ArticleDetail: React.FC<ArticleDetailProps> = ({ article, onBack }) => {
  const portraitImage = article.portraitImageUrl || article.imageUrl;
  const facebookConfig = storage.getFacebookConfig();

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'story';

  const handleDownloadStoryImage = () => {
    const link = document.createElement('a');
    link.href = portraitImage;
    link.download = `${slugify(article.title)}-story.jpg`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareToFacebookStory = async () => {
    const shareUrl = window.location.href;

    try {
      const imageResponse = await fetch(portraitImage);
      const imageBlob = await imageResponse.blob();
      const file = new File([imageBlob], `${slugify(article.title)}-story.jpg`, { type: imageBlob.type || 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: article.title,
          text: article.summary,
          files: [file],
        });
        return;
      }
    } catch (error) {
      console.warn('Native share with image failed, falling back to Facebook share link.', error);
    }

    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleCopyFacebookStoryPack = async () => {
    const storyPack = [
      `${article.title}`,
      '',
      `${article.summary}`,
      '',
      `${facebookConfig.storyCtaText}: ${window.location.href}`,
      '',
      `Page: ${facebookConfig.pageName}`,
      `Story link label: ${facebookConfig.storyLinkLabel}`,
      `Story image: ${portraitImage}`,
    ].join('\n');

    await navigator.clipboard.writeText(storyPack);
  };

  return (
    <article className="animate-in fade-in duration-500">
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={onBack} className="mb-8 gap-2 uppercase tracking-widest text-xs font-bold">
          <ArrowLeft size={16} />
          Back to News
        </Button>

        <div className="max-w-4xl mx-auto">
          <div className="space-y-6 mb-12">
            <div className="flex items-center gap-3">
              <span className="bg-primary text-primary-foreground px-3 py-1 text-xs font-bold uppercase tracking-widest">
                {article.category}
              </span>
              {article.isBreaking && (
                <span className="bg-red-600 text-white px-3 py-1 text-xs font-bold uppercase tracking-widest">
                  Breaking News
                </span>
              )}
            </div>
            
            <h1 className="text-4xl md:text-7xl font-serif font-black leading-none tracking-tighter">
              {article.title}
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground font-medium leading-relaxed italic border-l-4 border-primary pl-6 py-2">
              {article.summary}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-b py-6">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider">{article.author}</p>
                    <p className="text-xs text-muted-foreground">Editorial Staff</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={16} />
                  <span className="text-sm font-medium">{new Date(article.publishedAt).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="rounded-full">
                  <Share2 size={18} />
                </Button>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Bookmark size={18} />
                </Button>
              </div>
            </div>
          </div>

          <div className="aspect-[21/9] w-full overflow-hidden rounded-2xl mb-12 shadow-2xl">
            <img 
              src={article.imageUrl} 
              alt={article.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] mb-12">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Story Format</div>
                  <h3 className="mt-1 text-2xl font-serif font-black">9:16 social image</h3>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={handleDownloadStoryImage}>
                  <Download size={14} />
                  Download
                </Button>
              </div>
              <div className="relative aspect-[9/16] overflow-hidden rounded-2xl">
                <img
                  src={portraitImage}
                  alt={`${article.title} story preview`}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-white/70">{article.category}</div>
                  <h3 className="text-2xl font-serif font-black leading-tight">{article.title}</h3>
                  <p className="mt-3 text-sm text-white/85 line-clamp-4">{article.summary}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col justify-between gap-6">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Facebook Story</div>
                <h3 className="mt-2 text-2xl font-serif font-black">Share the story image</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  This opens the native share sheet when supported, which is the best way to send a 9:16 image to Facebook Story from the web.
                  If your browser does not support that flow, it falls back to a Facebook share link.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Button className="gap-2" onClick={handleShareToFacebookStory}>
                  <Facebook size={16} />
                  Share to Facebook Story
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleCopyFacebookStoryPack}>
                  <Copy size={16} />
                  Copy Story Pack
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  <Share2 size={16} />
                  Copy Article Link
                </Button>
              </div>
            </div>
          </div>

          <AdBanner type="adsense" className="mb-12" />

          <div className="prose prose-lg max-w-none dark:prose-invert font-serif leading-relaxed text-lg md:text-xl">
            <ReactMarkdown>{article.content}</ReactMarkdown>
          </div>

          <AdBanner type="adskeeper" className="my-12" />

          <Separator className="my-16" />
          
          <div className="bg-muted/30 p-8 rounded-2xl text-center">
            <h3 className="text-2xl font-serif font-bold mb-4">Stay Informed</h3>
            <p className="text-muted-foreground mb-6">Get the latest stories from jshubnetwork delivered to your inbox.</p>
            <div className="flex max-w-md mx-auto gap-2">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="flex-1 bg-white border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button>Subscribe</Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
