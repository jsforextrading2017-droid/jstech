import React from 'react';
import { Article, AdConfig, FacebookConfig } from '../types';
import { Button } from './ui/button';
import { ArrowLeft, Share2, Bookmark, Clock, User, Download, Facebook, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Separator } from './ui/separator';
import { AdBanner } from './AdBanner';

interface ArticleDetailProps {
  article: Article;
  adConfig: AdConfig;
  facebookConfig: FacebookConfig;
  onBack: () => void;
}

export const ArticleDetail: React.FC<ArticleDetailProps> = ({ article, adConfig, facebookConfig, onBack }) => {
  const portraitImage = article.portraitImageUrl || article.imageUrl;

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'story';

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const buildStoryCanvas = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let imageSource = portraitImage;
    let objectUrl: string | null = null;
    if (!portraitImage.startsWith('data:')) {
      const imageResponse = await fetch(portraitImage);
      const imageBlob = await imageResponse.blob();
      objectUrl = URL.createObjectURL(imageBlob);
      imageSource = objectUrl;
    }

    const image = await loadImage(imageSource);

    const targetRatio = canvas.width / canvas.height;
    const sourceRatio = image.width / image.height;
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceRatio > targetRatio) {
      drawWidth = image.height * targetRatio;
      offsetX = (image.width - drawWidth) / 2;
    } else {
      drawHeight = image.width / targetRatio;
      offsetY = (image.height - drawHeight) / 2;
    }

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight, 0, 0, canvas.width, canvas.height);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
    gradient.addColorStop(0.42, 'rgba(0, 0, 0, 0.08)');
    gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.20)');
    gradient.addColorStop(1, 'rgba(3, 7, 18, 0.96)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(72, 76, 160, 8);

    const accent = ctx.createLinearGradient(72, 0, 240, 0);
    accent.addColorStop(0, '#f97316');
    accent.addColorStop(1, '#ef4444');
    ctx.fillStyle = accent;
    ctx.fillRect(72, 76, 160, 8);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(72, 118, 268, 54);

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(article.category.toUpperCase(), 96, 149);

    if (article.isBreaking) {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(72, 194, 190, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText('BREAKING', 98, 228);
    }

    ctx.fillStyle = 'rgba(3, 7, 18, 0.84)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(72, 1388, 936, 392, 34);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px Arial, sans-serif';
    ctx.textAlign = 'center';
    const titleLines = wrapText(ctx, article.title, 830).slice(0, 3);
    const titleStartY = article.isBreaking ? 1512 : 1480;
    titleLines.forEach((line, index) => {
      ctx.fillText(line, 540, titleStartY + index * 54);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.font = '400 28px Arial, sans-serif';
    const summaryLines = wrapText(ctx, article.summary, 820).slice(0, 3);
    const summaryStartY = titleStartY + titleLines.length * 54 + 18;
    summaryLines.forEach((line, index) => {
      ctx.fillText(line, 540, summaryStartY + index * 38);
    });

    ctx.fillStyle = 'rgba(249,115,22,0.24)';
    ctx.strokeStyle = 'rgba(249,115,22,0.4)';
    ctx.beginPath();
    ctx.roundRect(330, 1708, 420, 58, 19);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(facebookConfig.storyCtaText.toUpperCase(), 540, 1745);

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '400 24px Arial, sans-serif';
    ctx.fillText(facebookConfig.pageName, 540, 1812);

    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText(facebookConfig.storyLinkLabel.toUpperCase(), 540, 1850);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create story image'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', 0.95);
    });
  };

  const handleDownloadStoryImage = () => {
    buildStoryCanvas()
      .then((blob) => {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${slugify(article.title)}-story.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.warn('Story image generation failed, falling back to the base portrait.', error);
        const link = document.createElement('a');
        link.href = portraitImage;
        link.download = `${slugify(article.title)}-story.jpg`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  const handleShareToFacebookStory = async () => {
    const shareUrl = window.location.href;

    try {
      const storyBlob = await buildStoryCanvas();
      const file = new File([storyBlob], `${slugify(article.title)}-story.jpg`, { type: storyBlob.type || 'image/jpeg' });

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

          <AdBanner type="adsense" adConfig={adConfig} className="mb-12" />

          <div className="prose prose-lg max-w-none dark:prose-invert font-serif leading-relaxed text-lg md:text-xl">
            <ReactMarkdown>{article.content}</ReactMarkdown>
          </div>

          <AdBanner type="adskeeper" adConfig={adConfig} className="my-12" />

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
