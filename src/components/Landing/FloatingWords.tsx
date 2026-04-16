import { useEffect, useState } from 'react';

const words = [
  // East Asian
  { text: '日本語', lang: 'Japanese' },
  { text: '한국어', lang: 'Korean' },
  { text: '中文', lang: 'Chinese' },
  { text: 'ไทย', lang: 'Thai' },
  { text: '漢字', lang: 'Kanji' },
  { text: '학습', lang: 'Korean' },
  { text: '語彙', lang: 'Japanese' },
  { text: '文字', lang: 'Chinese' },
  // Middle Eastern
  { text: 'العربية', lang: 'Arabic' },
  { text: 'עברית', lang: 'Hebrew' },
  { text: 'فارسی', lang: 'Persian' },
  // European
  { text: 'français', lang: 'French' },
  { text: 'español', lang: 'Spanish' },
  { text: 'Deutsch', lang: 'German' },
  { text: 'português', lang: 'Portuguese' },
  { text: 'italiano', lang: 'Italian' },
  { text: 'русский', lang: 'Russian' },
  { text: 'ελληνικά', lang: 'Greek' },
  { text: 'Türkçe', lang: 'Turkish' },
  { text: 'polski', lang: 'Polish' },
  { text: 'svenska', lang: 'Swedish' },
  { text: 'norsk', lang: 'Norwegian' },
  // South Asian
  { text: 'हिंदी', lang: 'Hindi' },
  { text: 'বাংলা', lang: 'Bengali' },
  { text: 'தமிழ்', lang: 'Tamil' },
  { text: 'తెలుగు', lang: 'Telugu' },
  // Others
  { text: 'Bahasa', lang: 'Indonesian' },
  { text: 'Tiếng Việt', lang: 'Vietnamese' },
  // Table-related words in various languages
  { text: 'données', lang: 'French' },
  { text: '表格', lang: 'Chinese' },
  { text: 'tabla', lang: 'Spanish' },
  { text: 'Tabelle', lang: 'German' },
  { text: '단어', lang: 'Korean' },
];

interface FloatingWord {
  id: number;
  text: string;
  x: number;
  y: number;
  delay: number;
  duration: number;
  opacity: number;
  size: number;
  twinkleDelay: number;
  twinkleDuration: number;
}

type Zone =
  | 'left-top'
  | 'left-mid'
  | 'left-bottom'
  | 'right-top'
  | 'right-mid'
  | 'right-bottom'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

// Words are placed strictly around the outer edges to avoid covering the hero content
function getEdgePosition(zone: Zone): { x: number; y: number } {
  const rand = () => Math.random();
  switch (zone) {
    case 'left-top':      return { x: 1 + rand() * 10, y: 5 + rand() * 25 };
    case 'left-mid':      return { x: 1 + rand() * 10, y: 35 + rand() * 25 };
    case 'left-bottom':   return { x: 1 + rand() * 10, y: 65 + rand() * 20 };
    case 'right-top':     return { x: 88 + rand() * 10, y: 5 + rand() * 25 };
    case 'right-mid':     return { x: 88 + rand() * 10, y: 35 + rand() * 25 };
    case 'right-bottom':  return { x: 88 + rand() * 10, y: 65 + rand() * 20 };
    case 'bottom-left':   return { x: 5 + rand() * 25, y: 88 + rand() * 10 };
    case 'bottom-center': return { x: 35 + rand() * 30, y: 90 + rand() * 8 };
    case 'bottom-right':  return { x: 70 + rand() * 25, y: 88 + rand() * 10 };
  }
}

export default function FloatingWords() {
  const [floatingWords, setFloatingWords] = useState<FloatingWord[]>([]);

  useEffect(() => {
    const wordInstances: FloatingWord[] = [];
    let id = 0;
    const zones: Zone[] = [
      'left-top', 'left-mid', 'left-bottom',
      'right-top', 'right-mid', 'right-bottom',
      'bottom-left', 'bottom-center', 'bottom-right',
    ];

    // First layer
    words.forEach((word, index) => {
      const zone = zones[index % zones.length];
      const pos = getEdgePosition(zone);
      wordInstances.push({
        id: id++,
        text: word.text,
        x: pos.x,
        y: pos.y,
        delay: Math.random() * 6,
        duration: 18 + Math.random() * 12,
        opacity: 0.2 + Math.random() * 0.3,
        size: 14 + Math.random() * 14,
        twinkleDelay: Math.random() * 4,
        twinkleDuration: 3 + Math.random() * 3,
      });
    });

    // Second layer for more density
    words.slice(0, 18).forEach((word, index) => {
      const zone = zones[(index + 4) % zones.length];
      const pos = getEdgePosition(zone);
      wordInstances.push({
        id: id++,
        text: word.text,
        x: pos.x,
        y: pos.y,
        delay: Math.random() * 6 + 2,
        duration: 15 + Math.random() * 10,
        opacity: 0.15 + Math.random() * 0.2,
        size: 12 + Math.random() * 10,
        twinkleDelay: Math.random() * 4 + 1,
        twinkleDuration: 2.5 + Math.random() * 2.5,
      });
    });

    setFloatingWords(wordInstances);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {floatingWords.map((word) => (
        <span
          key={word.id}
          className="absolute font-medium select-none floating-word"
          style={{
            left: `${word.x}%`,
            top: `${word.y}%`,
            fontSize: `${word.size}px`,
            opacity: word.opacity,
            animation: `float ${word.duration}s ease-in-out infinite, twinkle ${word.twinkleDuration}s ease-in-out infinite`,
            animationDelay: `${word.delay}s, ${word.twinkleDelay}s`,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}
