export interface RingBufferLimits {
  maxLines: number;
  maxChars: number;
}

export const DEFAULT_BUFFER_LIMITS: RingBufferLimits = {
  maxLines: 5000,
  maxChars: 2 * 1024 * 1024,
};

/**
 * Keeps the tail of a terminal stream: at most `maxLines` lines and `maxChars` characters, so a
 * view can be rebuilt after a reload. Trimming happens at line boundaries.
 */
export class RingBuffer {
  private text = '';
  private newlines = 0;

  constructor(private readonly limits: RingBufferLimits = DEFAULT_BUFFER_LIMITS) {}

  append(chunk: string): void {
    if (chunk === '') return;
    this.text += chunk;
    for (let i = chunk.indexOf('\n'); i >= 0; i = chunk.indexOf('\n', i + 1)) this.newlines++;
    if (this.text.length > this.limits.maxChars)
      this.dropChars(this.text.length - this.limits.maxChars);
    if (this.lineCount > this.limits.maxLines)
      this.dropLines(this.lineCount - this.limits.maxLines);
  }

  private dropLines(count: number): void {
    let index = -1;
    for (let i = 0; i < count; i++) index = this.text.indexOf('\n', index + 1);
    this.text = this.text.slice(index + 1);
    this.newlines -= count;
  }

  private dropChars(count: number): void {
    // Cut at the next line boundary so a line is never kept half way.
    const boundary = this.text.indexOf('\n', count - 1);
    const cut = boundary < 0 ? this.text.length : boundary + 1;
    const dropped = this.text.slice(0, cut);
    this.text = this.text.slice(cut);
    for (let i = dropped.indexOf('\n'); i >= 0; i = dropped.indexOf('\n', i + 1)) this.newlines--;
  }

  toString(): string {
    return this.text;
  }

  get lineCount(): number {
    return this.newlines + (this.text !== '' && !this.text.endsWith('\n') ? 1 : 0);
  }
}
