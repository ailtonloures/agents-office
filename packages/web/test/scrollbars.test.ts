import { describe, expect, it } from 'vitest';
import { SCROLLBAR_CSS } from '../src/ui/scrollbars';

describe('SCROLLBAR_CSS', () => {
  it('has the modern thin scrollbar rules for every element', () => {
    expect(SCROLLBAR_CSS).toMatch(/\*\{[^}]*scrollbar-width:thin/);
    expect(SCROLLBAR_CSS).toMatch(/\*\{[^}]*scrollbar-color:#2a2d44 transparent/);
  });

  it('has the WebKit fallback with 8px size and corner', () => {
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar\{width:8px;height:8px/);
    expect(SCROLLBAR_CSS).toContain('::-webkit-scrollbar-track{background:transparent}');
    expect(SCROLLBAR_CSS).toContain('::-webkit-scrollbar-corner');
  });

  it('uses the palette colors for thumb, hover and active', () => {
    expect(SCROLLBAR_CSS).toMatch(/-thumb\{background:#2a2d44/);
    expect(SCROLLBAR_CSS).toMatch(/-thumb:hover\{background:#3a3f5c/);
    expect(SCROLLBAR_CSS).toMatch(/-thumb:active\{background:#f0c040/);
  });
});
