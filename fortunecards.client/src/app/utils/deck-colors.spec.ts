import { getDeckGradientStyle, getDeckShadowStyle, getDeckAccentColor, getCardAccentColor } from './deck-colors';

describe('deck-colors', () => {
  describe('getDeckGradientStyle', () => {
    it('returns the index-0 gradient', () => {
      expect(getDeckGradientStyle(0)).toBe('linear-gradient(135deg, #B2FEFA, #A29BFE)');
    });
    it('wraps around with modulo (16 gradients)', () => {
      expect(getDeckGradientStyle(16)).toBe(getDeckGradientStyle(0));
    });
  });

  describe('getDeckShadowStyle', () => {
    it('returns the index-0 shadow', () => {
      expect(getDeckShadowStyle(0)).toBe('0 6px 20px #B2FEFA33');
    });
  });

  describe('getDeckAccentColor', () => {
    it('returns the index-0 accent', () => {
      expect(getDeckAccentColor(0)).toBe('#B2FEFA');
    });
    it('returns the index-4 accent', () => {
      expect(getDeckAccentColor(4)).toBe('#FF9FF3');
    });
  });

  describe('getCardAccentColor', () => {
    it('cycles through the accent colors with modulo', () => {
      expect(getCardAccentColor(0)).toBe(getCardAccentColor(16));
    });
  });
});
