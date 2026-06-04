import { getDeckGradientStyle, getDeckShadowStyle, getDeckAccentColor, getCardAccentColor } from './deck-colors';

describe('deck-colors', () => {
  describe('getDeckGradientStyle', () => {
    it('returns coral-sunny gradient for index 0', () => {
      expect(getDeckGradientStyle(0)).toBe('linear-gradient(135deg, #FF6B6B, #FECA57)');
    });
    it('wraps around with modulo for index 5', () => {
      expect(getDeckGradientStyle(5)).toBe(getDeckGradientStyle(0));
    });
  });

  describe('getDeckAccentColor', () => {
    it('returns coral for index 0', () => {
      expect(getDeckAccentColor(0)).toBe('#FF6B6B');
    });
    it('returns coral for index 4', () => {
      expect(getDeckAccentColor(4)).toBe('#FECA57');
    });
  });

  describe('getCardAccentColor', () => {
    it('cycles through 5 accent colors', () => {
      const a = getCardAccentColor(0);
      const b = getCardAccentColor(5);
      expect(a).toBe(b);
    });
  });
});
