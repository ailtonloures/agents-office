import type Phaser from 'phaser';
import { SKIN_KEYS } from '../skin';
import { DARK_PANEL, drawPanel } from '../ui/panel';
import type { BuildingLayout } from './roomLayout';
import { ensureRugTexture } from './rugs';

const TILE = 16;
export const DECOR_DEPTH = { rug: 1.5, lobbyText: 1.6, plaque: 5 } as const;
const PLAQUE_HEIGHT = 12;
const FADE_MS = 500;

interface Plaque {
  box: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.BitmapText;
  signature: string;
}

/**
 * Everything the scene paints on top of the tilemap that depends on the layout: the rugs, the
 * project plaque above each door and the lobby title. New pieces fade or pop in, so the office
 * visibly "builds" itself as projects appear.
 */
export class RoomDecor {
  private readonly rugs = new Map<string, Phaser.GameObjects.Image>();
  private readonly plaques = new Map<string, Plaque>();
  private lobbyTitle: Phaser.GameObjects.BitmapText | undefined;

  constructor(private readonly scene: Phaser.Scene) {}

  sync(layout: BuildingLayout, animate: boolean): void {
    this.syncRugs(layout, animate);
    this.syncPlaques(layout, animate);
    this.syncLobbyTitle(layout);
  }

  private syncRugs(layout: BuildingLayout, animate: boolean): void {
    const wanted = new Set<string>();
    for (const zone of layout.zones) {
      const { x, y, w, h } = zone.rect;
      const accent = layout.rooms.find((room) => room.id === zone.roomId)?.accent ?? 0;
      const key = `${zone.kind}:${zone.roomId ?? '-'}:${x},${y},${w},${h}`;
      wanted.add(key);
      const texture = ensureRugTexture(this.scene.textures, zone.kind, w * TILE, h * TILE, accent);
      const existing = this.rugs.get(key);
      if (existing) {
        if (existing.texture.key !== texture) existing.setTexture(texture);
        continue;
      }
      const image = this.scene.add
        .image(x * TILE, y * TILE, texture)
        .setOrigin(0)
        .setDepth(DECOR_DEPTH.rug);
      if (animate) {
        image.setAlpha(0);
        this.scene.tweens.add({ targets: image, alpha: 1, duration: FADE_MS, delay: 350 });
      }
      this.rugs.set(key, image);
    }
    for (const [key, image] of this.rugs) {
      if (wanted.has(key)) continue;
      image.destroy();
      this.rugs.delete(key);
    }
  }

  private syncPlaques(layout: BuildingLayout, animate: boolean): void {
    const alive = new Set(layout.rooms.map((room) => room.id));
    for (const [id, plaque] of this.plaques) {
      if (alive.has(id)) continue;
      plaque.box.destroy();
      plaque.text.destroy();
      this.plaques.delete(id);
    }
    for (const sign of layout.signs) {
      const room = layout.rooms.find((r) => r.id === sign.roomId);
      const accent = room?.accent ?? 0xffffff;
      let plaque = this.plaques.get(sign.roomId);
      const isNew = !plaque;
      if (!plaque) {
        plaque = {
          box: this.scene.add.graphics().setDepth(DECOR_DEPTH.plaque),
          text: this.scene.add
            .bitmapText(0, 0, SKIN_KEYS.font, '')
            .setOrigin(0.5, 0)
            .setDepth(DECOR_DEPTH.plaque + 0.1),
          signature: '',
        };
        this.plaques.set(sign.roomId, plaque);
      }
      const signature = `${sign.text}|${accent}`;
      const cx = sign.tile.x * TILE + TILE / 2;
      const top = sign.tile.y * TILE + 4;
      if (plaque.signature !== signature) {
        plaque.signature = signature;
        plaque.text.setText(sign.text.toUpperCase());
        const w = plaque.text.width + 16;
        const g = plaque.box;
        g.clear();
        drawPanel(g, 0, 0, w, PLAQUE_HEIGHT, DARK_PANEL, 1);
        g.fillStyle(accent, 1).fillRect(4, 3, 3, PLAQUE_HEIGHT - 6);
        g.fillStyle(accent, 0.55).fillRect(2, PLAQUE_HEIGHT - 2, w - 4, 1);
        plaque.text.setTint(0xffffff);
        g.setData('width', w);
      }
      const w = plaque.box.getData('width') as number;
      plaque.box.setPosition(cx - w / 2, top);
      plaque.text.setPosition(cx + 4, top);
      if (isNew && animate) {
        for (const object of [plaque.box, plaque.text]) {
          object.setAlpha(0);
          this.scene.tweens.add({ targets: object, alpha: 1, duration: 400, delay: 500 });
        }
      }
    }
  }

  private syncLobbyTitle(layout: BuildingLayout): void {
    const zone = layout.zones.find((z) => z.kind === 'lobby');
    if (!zone) return;
    if (!this.lobbyTitle) {
      this.lobbyTitle = this.scene.add
        .bitmapText(0, 0, SKIN_KEYS.font, 'AGENTS OFFICE')
        .setOrigin(0.5, 0)
        .setTint(0xf2d58a)
        .setDepth(DECOR_DEPTH.lobbyText);
    }
    this.lobbyTitle.setPosition(
      (zone.rect.x + zone.rect.w / 2) * TILE,
      (zone.rect.y + zone.rect.h - 1) * TILE - 2,
    );
  }

  destroy(): void {
    for (const image of this.rugs.values()) image.destroy();
    for (const plaque of this.plaques.values()) {
      plaque.box.destroy();
      plaque.text.destroy();
    }
    this.lobbyTitle?.destroy();
    this.rugs.clear();
    this.plaques.clear();
  }
}
