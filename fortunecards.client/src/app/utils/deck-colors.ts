const DECK_GRADIENTS = [
  { from: '#FF6B6B', to: '#FECA57', shadow: '#FF6B6B33', accent: '#FF6B6B' },
  { from: '#48DBFB', to: '#FF9FF3', shadow: '#48DBFB33', accent: '#48DBFB' },
  { from: '#A29BFE', to: '#48DBFB', shadow: '#A29BFE33', accent: '#A29BFE' },
  { from: '#FF9FF3', to: '#FECA57', shadow: '#FF9FF333', accent: '#FF9FF3' },
  { from: '#FECA57', to: '#FF6B6B', shadow: '#FECA5733', accent: '#FECA57' },
] as const;

const CARD_ACCENTS = ['#FF6B6B', '#FECA57', '#48DBFB', '#FF9FF3', '#A29BFE'] as const;

export function getDeckGradientStyle(colorIndex: number): string {
  const g = DECK_GRADIENTS[colorIndex % 5];
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}

export function getDeckShadowStyle(colorIndex: number): string {
  return `0 6px 20px ${DECK_GRADIENTS[colorIndex % 5].shadow}`;
}

export function getDeckAccentColor(colorIndex: number): string {
  return DECK_GRADIENTS[colorIndex % 5].accent;
}

export function getCardAccentColor(index: number): string {
  return CARD_ACCENTS[index % CARD_ACCENTS.length];
}
