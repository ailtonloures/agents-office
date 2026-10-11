import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/main/ringBuffer';

describe('RingBuffer', () => {
  it('keeps everything below the limits', () => {
    const buffer = new RingBuffer({ maxLines: 10, maxChars: 1000 });
    buffer.append('a\nb\n');
    buffer.append('c');
    expect(buffer.toString()).toBe('a\nb\nc');
    expect(buffer.lineCount).toBe(3);
  });

  it('drops the oldest lines past maxLines', () => {
    const buffer = new RingBuffer({ maxLines: 3, maxChars: 1000 });
    for (let i = 1; i <= 8; i++) buffer.append(`line${i}\n`);
    expect(buffer.toString()).toBe('line6\nline7\nline8\n');
  });

  it('counts lines across chunks that split a line', () => {
    const buffer = new RingBuffer({ maxLines: 2, maxChars: 1000 });
    buffer.append('one\ntw');
    buffer.append('o\nthree\nfour');
    expect(buffer.toString()).toBe('three\nfour');
  });

  it('caps the size and cuts at a line boundary', () => {
    const buffer = new RingBuffer({ maxLines: 1000, maxChars: 20 });
    for (let i = 0; i < 10; i++) buffer.append(`row-${i}-xxxx\n`);
    const text = buffer.toString();
    expect(text.length).toBeLessThanOrEqual(20);
    expect(text.startsWith('row-')).toBe(true);
    expect(text.endsWith('row-9-xxxx\n')).toBe(true);
  });

  it('survives a single chunk larger than the cap', () => {
    const buffer = new RingBuffer({ maxLines: 1000, maxChars: 10 });
    buffer.append('x'.repeat(50));
    expect(buffer.toString()).toBe('');
    buffer.append('ok\n');
    expect(buffer.toString()).toBe('ok\n');
  });

  it('holds about 5,000 lines by default', () => {
    const buffer = new RingBuffer();
    for (let i = 0; i < 6000; i++) buffer.append(`${i}\n`);
    expect(buffer.lineCount).toBe(5000);
    expect(buffer.toString().startsWith('1000\n')).toBe(true);
  });
});
