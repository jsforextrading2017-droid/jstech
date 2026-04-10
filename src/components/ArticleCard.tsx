import React from 'react';
import { Article } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { motion } from 'motion/react';

interface ArticleCardProps {
  article: Article;
  onClick: (article: Article) => void;
  variant?: 'large' | 'medium' | 'small';
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick, variant = 'medium' }) => {
  const isLarge = variant === 'large';
  const isSmall = variant === 'small';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`cursor-pointer group ${isLarge ? 'col-span-12 md:col-span-8' : isSmall ? 'col-span-12 md:col-span-3' : 'col-span-12 md:col-span-4'}`}
      onClick={() => onClick(article)}
    >
      <Card className="h-full overflow-hidden border-none shadow-none bg-transparent">
        <div className={`relative overflow-hidden rounded-lg ${isLarge ? 'aspect-[21/9]' : 'aspect-video'}`}>
          <img
            src={article.imageUrl}
            alt={article.title}
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          {article.isBreaking && (
            <Badge className="absolute top-4 left-4 bg-red-600 hover:bg-red-700 text-white border-none">
              BREAKING
            </Badge>
          )}
          <Badge variant="secondary" className="absolute bottom-4 left-4 backdrop-blur-md bg-white/80">
            {article.category}
          </Badge>
        </div>
        <CardHeader className="px-0 pt-4">
          <CardTitle className={`font-serif leading-tight group-hover:text-primary/80 transition-colors ${isLarge ? 'text-3xl md:text-5xl' : 'text-xl'}`}>
            {article.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <p className="text-muted-foreground line-clamp-2 text-sm md:text-base">
            {article.summary}
          </p>
          <div className="mt-4 flex items-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{article.author}</span>
            <span className="mx-2">•</span>
            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
