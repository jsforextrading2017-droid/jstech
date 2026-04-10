import React from 'react';
import { Article } from '../types';
import { Button } from './ui/button';
import { ArrowLeft, Share2, Bookmark, Clock, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Separator } from './ui/separator';
import { AdBanner } from './AdBanner';

interface ArticleDetailProps {
  article: Article;
  onBack: () => void;
}

export const ArticleDetail: React.FC<ArticleDetailProps> = ({ article, onBack }) => {
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

          <AdBanner type="adsense" className="mb-12" />

          <div className="prose prose-lg max-w-none dark:prose-invert font-serif leading-relaxed text-lg md:text-xl">
            <ReactMarkdown>{article.content}</ReactMarkdown>
          </div>

          <AdBanner type="adskeeper" className="my-12" />

          <Separator className="my-16" />
          
          <div className="bg-muted/30 p-8 rounded-2xl text-center">
            <h3 className="text-2xl font-serif font-bold mb-4">Stay Informed</h3>
            <p className="text-muted-foreground mb-6">Get the latest stories from Nova News delivered to your inbox.</p>
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
