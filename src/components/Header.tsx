import React from 'react';
import { Newspaper, Menu, X } from 'lucide-react';

interface HeaderProps {
  selectedCategory: string | null;
  onCategorySelect: (category: string | null) => void;
}

export const Header: React.FC<HeaderProps> = ({ selectedCategory, onCategorySelect }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const categories = ['Tech', 'Travel', 'Animal', 'Facts', 'Cars', 'Building Homes'];

  return (
    <header className="sticky top-0 z-50 glass-nav">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <button
          className="flex items-center gap-2 cursor-pointer text-left"
          onClick={() => onCategorySelect(null)}
        >
          <div className="bg-primary text-primary-foreground p-1.5 rounded">
            <Newspaper size={24} />
          </div>
          <span className="text-2xl font-serif font-black tracking-tighter uppercase">jshubnetwork</span>
        </button>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest">
          {categories.map((cat) => (
            <button 
              key={cat} 
              onClick={() => onCategorySelect(cat)}
              className={`hover:text-primary/60 transition-colors ${selectedCategory === cat ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
            >
              {cat}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-b p-4 flex flex-col gap-4 animate-in slide-in-from-top duration-300">
          {categories.map((cat) => (
            <button 
              key={cat} 
              className={`text-left py-2 font-medium uppercase tracking-widest text-sm ${selectedCategory === cat ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => {
                onCategorySelect(cat);
                setIsMenuOpen(false);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
