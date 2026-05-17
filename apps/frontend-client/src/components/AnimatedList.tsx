'use client';

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  MouseEventHandler,
  UIEvent,
} from 'react';

/* ── Animated item: fades + scales in when scrolled into view ── */
interface AnimatedItemProps {
  children: ReactNode;
  index: number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

function AnimatedItem({ children, index, onMouseEnter, onClick }: AnimatedItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className="mb-4 cursor-pointer transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.7)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}
    >
      {children}
    </div>
  );
}

/* ── AnimatedList ── */
interface AnimatedListProps<T = string> {
  items?: T[];
  renderItem?: (item: T, isSelected: boolean) => ReactNode;
  onItemSelect?: (item: T, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
}

function AnimatedList<T = string>({
  items = [],
  renderItem,
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  itemClassName = '',
  displayScrollbar = true,
  initialSelectedIndex = -1,
}: AnimatedListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topOpacity, setTopOpacity] = useState(0);
  const [bottomOpacity, setBottomOpacity] = useState(1);

  const handleMouseEnter = useCallback((index: number) => setSelectedIndex(index), []);

  const handleClick = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index);
      onItemSelect?.(item, index);
    },
    [onItemSelect]
  );

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
    setTopOpacity(Math.min(scrollTop / 50, 1));
    const bottomDist = scrollHeight - (scrollTop + clientHeight);
    setBottomOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDist / 50, 1));
  };

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex(prev => Math.min(prev + 1, (items as T[]).length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        onItemSelect?.((items as T[])[selectedIndex], selectedIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const el = container.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (el) {
      const margin = 50;
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < container.scrollTop + margin) {
        container.scrollTo({ top: top - margin, behavior: 'smooth' });
      } else if (bottom > container.scrollTop + container.clientHeight - margin) {
        container.scrollTo({ top: bottom - container.clientHeight + margin, behavior: 'smooth' });
      }
    }
    setKeyboardNav(false);
  }, [selectedIndex, keyboardNav]);

  return (
    <div className={`relative w-full ${className}`}>
      <div
        ref={listRef}
        className={`overflow-y-auto p-4 ${
          displayScrollbar
            ? '[&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-track]:bg-[#120F17] [&::-webkit-scrollbar-thumb]:bg-[#333] [&::-webkit-scrollbar-thumb]:rounded-[4px]'
            : 'scrollbar-hide'
        }`}
        style={{ scrollbarWidth: displayScrollbar ? 'thin' : 'none', scrollbarColor: '#333 #120F17' }}
        onScroll={handleScroll}
      >
        {(items as T[]).map((item, index) => (
          <AnimatedItem
            key={index}
            index={index}
            onMouseEnter={() => handleMouseEnter(index)}
            onClick={() => handleClick(item, index)}
          >
            {renderItem ? (
              renderItem(item, selectedIndex === index)
            ) : (
              <div
                className={`p-4 rounded-lg border border-[#7b8866]/20 transition-colors ${
                  selectedIndex === index ? 'bg-[#1e1b24] border-[#7b8866]/50' : 'bg-[#16131d]'
                } ${itemClassName}`}
              >
                <p className="text-white">{String(item)}</p>
              </div>
            )}
          </AnimatedItem>
        ))}
      </div>

      {showGradients && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-[50px] bg-gradient-to-b from-[#120F17] to-transparent pointer-events-none transition-opacity duration-300"
            style={{ opacity: topOpacity }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-[80px] pointer-events-none transition-opacity duration-300"
            style={{ opacity: bottomOpacity }}
          />
        </>
      )}
    </div>
  );
}

export default AnimatedList;
