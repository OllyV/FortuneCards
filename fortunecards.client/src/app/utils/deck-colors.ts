const DECK_GRADIENTS = [
  { from: '#B2FEFA', to: '#A29BFE', third: "#aab2ff", shadow: '#B2FEFA33', accent: '#B2FEFA' },
  { from: '#48DBFB', to: '#FF9FF3', third: '#f492f0', shadow: '#48DBFB33', accent: '#48DBFB' },
  { from: '#f0acf7', to: '#acf7f0', third: '#f7f0ac', shadow: '#f0acf733', accent: '#f0acf7' },
  { from: '#ddd6f3', to: '#faaca8', third: "#ED4264", shadow: '#faaca833', accent: '#faaca8' },
  { from: '#FF9FF3', to: '#FECA57', third: "#ff75c3", shadow: '#FF9FF333', accent: '#FF9FF3' },
  { from: '#f7f779', to: '#ffa585', third: "#f9b16e", shadow: '#f7f77933', accent: '#f7f779' },
  { from: '#FECA57', to: '#FF6B6B', third: "#faff89", shadow: '#FECA5733', accent: '#FECA57' },
  { from: '#FEAC5E', to: '#C779D0', third: '#4BC0C8', shadow: '#4BC0C833', accent: '#4BC0C8' },
  { from: '#57ebde', to: '#ff8989', third: "#ff8989", shadow: '#a9ff6833', accent: '#a9ff68' },
  { from: '#a9ff68', to: '#ff8989', third: "#faff89", shadow: '#a9ff6833', accent: '#a9ff68' },
  { from: '#93cbf1', to: '#87f4b5', third: '#95ecb0', shadow: '#93cbf133', accent: '#93cbf1' },
  { from: '#f0f9a7', to: '#30c67c', third: "#43b692", shadow: '#f0f9a733', accent: '#f0f9a7' },
  { from: '#3b8d99', to: '#aa4b6b', third: '#ffa8bd', shadow: '#3b8d9933', accent: '#3b8d99' },
  { from: '#dc2430', to: '#7b4397', third: '#7b4397', shadow: '#dc243033', accent: '#dc2430' },
  { from: '#159957', to: '#155799', third: '#007991', shadow: '#87f4b533', accent: '#87f4b5' },
  { from: '#3b8d99', to: '#360033', third: '#3b8d99', shadow: '#3b8d9933', accent: '#3b8d99' }
] as const;

export function getDeckGradientStyle(colorIndex: number): string {
  const g = DECK_GRADIENTS[colorIndex % DECK_GRADIENTS.length];
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}

export function getDeckShadowStyle(colorIndex: number): string {
  return `0 6px 20px ${DECK_GRADIENTS[colorIndex % DECK_GRADIENTS.length].shadow}`;
}

export function getDeckAccentColor(colorIndex: number): string {
  return DECK_GRADIENTS[colorIndex % DECK_GRADIENTS.length].accent;
}

export function getCardAccentColor(index: number): string {
  return DECK_GRADIENTS[index % DECK_GRADIENTS.length].accent;
}
