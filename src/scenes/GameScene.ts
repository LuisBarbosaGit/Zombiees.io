import Phaser from 'phaser';
import { LocalSession } from '../game/LocalSession';
import { OnlineSession } from '../game/OnlineSession';
import { movePlayer as moveNetworkPlayer, type OnlinePlayer, type RoomSnapshot } from '@zombies-io/game-core';
import type { Furniture, FurnitureKind, InputFrame } from '../game/types';
import { isStaticBlocked, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../maps/townMap';

type TiledLayer = { name: string; data?: number[] };
type TiledMap = { layers: TiledLayer[] };

const FURNITURE_ASSETS: FurnitureKind[] = [
  'sofa-green','sofa-orange','sofa-gray','chair-green','chair-orange','chair-blue','stool-wood','round-table',
  'crate-large','crate-small','cabinet-01','cabinet-02','cabinet-03','counter-large','counter-wide',
  'appliance-01','appliance-02','appliance-03','appliance-04','sink-or-cooker-01','storage-01','storage-02','storage-03'
];
const FURNITURE_ATLAS_FRAMES: Partial<Record<FurnitureKind, string>> = {
  'blue-large': 'furniture.blue-large',
  'green-large': 'furniture.green-large'
};
const ALL_FURNITURE: FurnitureKind[] = [...FURNITURE_ASSETS, 'blue-large', 'green-large'];
const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  'sofa-green': 'Sofá verde', 'sofa-orange': 'Sofá laranja', 'sofa-gray': 'Sofá cinza',
  'chair-green': 'Cadeira verde', 'chair-orange': 'Cadeira laranja', 'chair-blue': 'Cadeira azul',
  'stool-wood': 'Banqueta', 'round-table': 'Mesa redonda', 'crate-large': 'Caixa grande', 'crate-small': 'Caixa pequena',
  'cabinet-01': 'Armário 1', 'cabinet-02': 'Armário 2', 'cabinet-03': 'Armário 3',
  'counter-large': 'Balcão grande', 'counter-wide': 'Balcão comprido',
  'appliance-01': 'Eletrodoméstico 1', 'appliance-02': 'Eletrodoméstico 2', 'appliance-03': 'Eletrodoméstico 3',
  'appliance-04': 'Eletrodoméstico 4', 'sink-or-cooker-01': 'Pia / fogão',
  'storage-01': 'Móvel 1', 'storage-02': 'Móvel 2', 'storage-03': 'Móvel 3',
  'blue-large': 'Móvel azul', 'green-large': 'Móvel verde'
};
const SANDBOX_LAYOUT_KEY = 'cerco-zero:sandbox-layout:v1';

export class GameScene extends Phaser.Scene {
  private session!: LocalSession;
  private entityGraphics!: Phaser.GameObjects.Graphics;
  private mapLayer!: Phaser.GameObjects.Container;
  private furnitureSprites = new Map<string, Phaser.GameObjects.Image>();
  private zombieSprites = new Map<string, Phaser.GameObjects.Image>();
  private playerSprite!: Phaser.GameObjects.Image;
  private healthPanel!: Phaser.GameObjects.Graphics;
  private healthFill!: Phaser.GameObjects.Graphics;
  private healthLabel!: Phaser.GameObjects.Text;
  private healthValue!: Phaser.GameObjects.Text;
  private touchControls!: Phaser.GameObjects.Container;
  private joystick!: Phaser.GameObjects.Arc;
  private joystickRing!: Phaser.GameObjects.Arc;
  private joystickKnob!: Phaser.GameObjects.Arc;
  private touchButtons: Phaser.GameObjects.Container[] = [];
  private joystickPointerId = -1;
  private joystickVector = { x: 0, y: 0 };
  private touchLayout = false;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'interact' | 'pause', Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private paused = false;
  private overlay?: Phaser.GameObjects.Container;
  private mode: 'survival' | 'sandbox' | 'online' = 'survival';
  private sandboxPanel?: Phaser.GameObjects.DOMElement;
  private sandboxMessage?: HTMLElement;
  private selectedKind: FurnitureKind | null = null;
  private selectedFurnitureId: string | null = null;
  private draggingFurnitureId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private panning = false;
  private lastPanPoint = { x: 0, y: 0 };
  private furnitureSequence = 0;
  private defaultFurniture: Furniture[] = [];
  private onlineSession?: OnlineSession;
  private onlineSnapshot?: RoomSnapshot;
  private onlinePlayerId?: string;
  private onlineSprites = new Map<string, Phaser.GameObjects.Image>();
  private onlineHud?: Phaser.GameObjects.Text;
  private onlineNotice?: Phaser.GameObjects.Text;
  private lastOnlineInput = 0;

  constructor() { super('game'); }

  init(data: { name?: string; mode?: 'survival' | 'sandbox' | 'online' }): void {
    this.mode = data.mode === 'sandbox' || data.mode === 'online' ? data.mode : 'survival';
    this.session = new LocalSession(data.name ?? 'Sobrevivente');
    this.onlineSession = this.mode === 'online' ? new OnlineSession() : undefined;
    this.onlineSnapshot = undefined;
    this.onlinePlayerId = undefined;
    this.lastOnlineInput = 0;
    this.defaultFurniture = this.session.state.furniture.map((item) => ({ ...item }));
    if (this.mode === 'online') this.session.state.furniture = [];
    else this.loadFurnitureLayout();
  }

  preload(): void {
    this.load.atlas('classic-tiles', 'assets/original/tilesheet-complete.png', 'assets/original/tilesheet.atlas.json');
    this.load.image('classic-human', 'assets/original/human.png');
    this.load.image('classic-zombie', 'assets/original/zombie.png');
    for (const asset of FURNITURE_ASSETS) this.load.image(`furniture-${asset}`, `assets/furniture/${asset}.png`);
    this.load.json('classic-map', 'assets/maps/braains-classic-clean.tmj');
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.mapLayer = this.add.container(0, 0).setDepth(0);
    this.entityGraphics = this.add.graphics().setDepth(3);
    this.drawOriginalMap();
    this.createEntitySprites();
    this.playerSprite.setVisible(this.mode !== 'sandbox');
    this.healthPanel = this.add.graphics().setScrollFactor(0).setDepth(10).setVisible(this.mode === 'survival');
    this.healthFill = this.add.graphics().setScrollFactor(0).setDepth(11).setVisible(this.mode === 'survival');
    this.healthLabel = this.add.text(0, 0, 'VIDA', { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#d9e6d6', fontStyle: 'bold', letterSpacing: 1 }).setScrollFactor(0).setDepth(11).setVisible(this.mode === 'survival');
    this.healthValue = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(11).setVisible(this.mode === 'survival');
    this.onlineHud = this.add.text(18, 18, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#f1f4e8', fontStyle: 'bold', backgroundColor: '#07110fd9', padding: { x: 14, y: 10 } }).setScrollFactor(0).setDepth(12).setVisible(this.mode === 'online');
    this.onlineNotice = this.add.text(this.scale.width / 2, this.scale.height / 2, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#fff5de', align: 'center', backgroundColor: '#07110fea', padding: { x: 24, y: 18 }, wordWrap: { width: Math.min(500, this.scale.width - 40) } }).setOrigin(0.5).setScrollFactor(0).setDepth(20).setVisible(false);
    this.createTouchControls();
    if (this.mode === 'sandbox') {
      this.touchControls.setVisible(false);
      this.createSandboxPanel();
      this.setupSandboxInput();
    }
    this.keys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      pause: Phaser.Input.Keyboard.KeyCodes.ESC
    }) as typeof this.keys;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());
    if (this.mode === 'online') this.connectOnline();
    if (this.mode === 'sandbox') this.fitSandboxMap();
    else this.cameras.main.setZoom(1);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layoutHudAndTouchControls());
    this.layoutHudAndTouchControls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onlineSession?.close());
  }

  update(_time: number, delta: number): void {
    if (this.mode === 'sandbox') {
      this.updateSandboxPointer();
      this.renderEntities();
      return;
    }
    if (this.paused || this.session.state.defeated) return;
    const player = this.session.state.player;
    this.cameras.main.centerOn(player.x, player.y);
    const keyboardX = Number(this.keys.right.isDown || this.cursors.right.isDown) - Number(this.keys.left.isDown || this.cursors.left.isDown);
    const keyboardY = Number(this.keys.down.isDown || this.cursors.down.isDown) - Number(this.keys.up.isDown || this.cursors.up.isDown);
    const moveX = this.joystickVector.x || keyboardX;
    const moveY = this.joystickVector.y || keyboardY;
    const pointer = this.input.activePointer;
    // Resolve against the current camera each frame, so mouse aim stays screen-relative
    // while the camera follows the keyboard-controlled player.
    const pointerWorld = this.touchLayout ? null : this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.mode === 'online') {
      if (!this.onlineSnapshot || !this.onlinePlayerId) return;
      const onlinePlayer = this.onlineSnapshot.players.find((candidate) => candidate.id === this.onlinePlayerId);
      if (!onlinePlayer) return;
      const faceX = pointerWorld ? pointerWorld.x - player.x : moveX;
      const faceY = pointerWorld ? pointerWorld.y - player.y : moveY;
      const predicted: OnlinePlayer = {
        id: this.onlinePlayerId, name: player.name, team: onlinePlayer.team,
        x: player.x, y: player.y, facing: { x: player.facing.x, y: player.facing.y }
      };
      moveNetworkPlayer(predicted, { moveX, moveY, faceX, faceY, sequence: 0 }, delta / 1000, (x, y) => this.networkPositionBlocked(x, y));
      player.x = predicted.x;
      player.y = predicted.y;
      player.facing = predicted.facing;
      if (_time - this.lastOnlineInput >= 1000 / 30) {
        this.onlineSession?.send({ moveX, moveY, faceX, faceY });
        this.lastOnlineInput = _time;
      }
      this.renderEntities();
      this.renderHud();
      return;
    }
    const input: InputFrame = {
      moveX,
      moveY,
      interact: Phaser.Input.Keyboard.JustDown(this.keys.interact),
      aim: pointerWorld ? { x: pointerWorld.x, y: pointerWorld.y } : null
    };
    this.session.submit(input, delta / 1000);
    this.renderEntities();
    this.renderHud();
    if (this.session.state.defeated) this.showEndScreen();
  }

  private connectOnline(): void {
    this.onlineNotice?.setText('Conectando à sala pública...').setVisible(true);
    this.onlineSession?.connect(
      this.session.state.player.name,
      (status, message) => {
        if (status === 'joined') {
          this.onlineNotice?.setVisible(false);
          return;
        }
        if (status === 'connecting') this.onlineNotice?.setText('Conectando à sala pública...').setVisible(true);
        if (status === 'error' || status === 'disconnected') {
          const text = `${message ?? 'A conexão foi encerrada.'}\n\nClique aqui para voltar ao menu`;
          this.onlineNotice?.setText(text).setVisible(true).setInteractive({ useHandCursor: true });
          this.onlineNotice?.removeAllListeners('pointerup');
          this.onlineNotice?.on('pointerup', () => this.scene.start('menu'));
        }
      },
      (snapshot) => {
        this.onlineSnapshot = snapshot;
        if (snapshot.ownPlayerId) this.onlinePlayerId = snapshot.ownPlayerId;
        const own = snapshot.players.find((candidate) => candidate.id === this.onlinePlayerId);
        if (own) {
          this.session.state.player.x = own.x;
          this.session.state.player.y = own.y;
          this.session.state.player.facing = { ...own.facing };
        }
        this.cameras.main.centerOn(this.session.state.player.x, this.session.state.player.y);
      },
      (winner) => {
        this.onlineNotice?.disableInteractive().setText(`${winner === 'human' ? 'OS HUMANOS SOBREVIVERAM' : 'A HORDA INFECTOU A CIDADE'}\n\nNova rodada em instantes...`).setVisible(true);
        window.setTimeout(() => this.onlineNotice?.setVisible(false), 4300);
      }
    );
  }

  private networkPositionBlocked(x: number, y: number): boolean {
    const radius = 14;
    const offsets = [[0, 0], [-radius, 0], [radius, 0], [0, -radius], [0, radius]];
    return offsets.some(([dx, dy]) => isStaticBlocked(
      Math.floor((x + dx!) / TILE_SIZE), Math.floor((y + dy!) / TILE_SIZE)
    ));
  }

  private drawOriginalMap(): void {
    const map = this.cache.json.get('classic-map') as TiledMap;
    // Source draw order: base floor, rugs/overlays, walls, then tree canopies.
    for (const layerName of ['floor', 'floor2', 'walls', 'trees']) {
      const layer = map.layers.find((candidate) => candidate.name === layerName);
      if (!layer?.data) continue;
      layer.data.forEach((rawGid, index) => {
        const gid = rawGid & 0x1fffffff;
        if (gid === 0) return;
        const column = index % MAP_WIDTH;
        const row = Math.floor(index / MAP_WIDTH);
        this.mapLayer.add(this.add.image(
          column * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          'classic-tiles',
          `tile-${gid - 1}`
        ));
      });
    }
    // Slight warm lift to match the brighter, more saturated original screenshot.
    this.mapLayer.add(this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0xfff2d7, 0.045).setOrigin(0.5));
  }

  private createEntitySprites(): void {
    this.playerSprite = this.add.image(0, 0, 'classic-human').setDepth(2);
    for (const item of this.session.state.furniture) {
      const atlasFrame = FURNITURE_ATLAS_FRAMES[item.kind];
      const sprite = atlasFrame
        ? this.add.image(0, 0, 'classic-tiles', atlasFrame)
        : this.add.image(0, 0, `furniture-${item.kind}`);
      this.furnitureSprites.set(item.id, sprite.setDepth(2));
    }
  }

  private renderEntities(): void {
    const { player, zombies, furniture } = this.session.state;
    const graphics = this.entityGraphics;
    graphics.clear();
    for (const item of furniture) {
      const sprite = this.furnitureSprites.get(item.id)!;
      sprite.setPosition(item.x + item.width / 2, item.y + item.height / 2);
      if (this.mode !== 'sandbox') {
        graphics.fillStyle(0x171b17).fillRect(item.x, item.y - 6, item.width, 3);
        graphics.fillStyle(0xe9bd69).fillRect(item.x, item.y - 6, item.width * (item.health / item.maxHealth), 3);
      }
      if (this.mode === 'sandbox' && item.id === this.selectedFurnitureId) {
        graphics.lineStyle(3, 0xf3d77b, 0.95).strokeRect(item.x - 3, item.y - 3, item.width + 6, item.height + 6);
      }
    }
    for (const [id, sprite] of this.furnitureSprites) if (!furniture.some((item) => item.id === id)) sprite.destroy();
    if (this.mode === 'online') {
      const visibleIds = new Set<string>();
      const players = this.onlineSnapshot?.players ?? [];
      const local = players.find((candidate) => candidate.id === this.onlinePlayerId);
      if (local) this.playerSprite.setTexture(local.team === 'zombie' ? 'classic-zombie' : 'classic-human');
      for (const remote of players) {
        if (remote.id === this.onlinePlayerId) continue;
        visibleIds.add(remote.id);
        const texture = remote.team === 'zombie' ? 'classic-zombie' : 'classic-human';
        let sprite = this.onlineSprites.get(remote.id);
        if (!sprite) {
          sprite = this.add.image(0, 0, texture).setDepth(2);
          this.onlineSprites.set(remote.id, sprite);
        } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
        sprite.setPosition(remote.x, remote.y).setRotation(Math.atan2(remote.facing.y, remote.facing.x) + Math.PI / 2);
      }
      for (const [id, sprite] of this.onlineSprites) if (!visibleIds.has(id)) { sprite.destroy(); this.onlineSprites.delete(id); }
    } else for (const zombie of zombies) {
      let sprite = this.zombieSprites.get(zombie.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, 'classic-zombie').setDepth(2);
        this.zombieSprites.set(zombie.id, sprite);
      }
      sprite.setPosition(zombie.x, zombie.y).setRotation(Phaser.Math.Angle.Between(zombie.x, zombie.y, player.x, player.y) + Math.PI / 2);
    }
    if (this.mode !== 'online') for (const [id, sprite] of this.zombieSprites) if (!zombies.some((zombie) => zombie.id === id)) { sprite.destroy(); this.zombieSprites.delete(id); }
    this.playerSprite.setPosition(player.x, player.y).setRotation(Math.atan2(player.facing.y, player.facing.x) + Math.PI / 2);
  }

  private renderHud(): void {
    if (this.mode === 'online') {
      const snapshot = this.onlineSnapshot;
      const current = snapshot?.players.find((candidate) => candidate.id === this.onlinePlayerId);
      const humans = snapshot?.players.filter((candidate) => candidate.team === 'human').length ?? 0;
      const zombies = snapshot?.players.filter((candidate) => candidate.team === 'zombie').length ?? 0;
      const remaining = snapshot?.roundRemainingMs ? `${Math.ceil(snapshot.roundRemainingMs / 60000)}:${String(Math.ceil((snapshot.roundRemainingMs % 60000) / 1000) % 60).padStart(2, '0')}` : 'aguardando';
      this.onlineHud?.setPosition(this.touchLayout ? 12 : 18, this.touchLayout ? 12 : 18)
        .setText(`${current?.team === 'zombie' ? 'ZUMBI' : 'HUMANO'}  ·  ${humans} vs ${zombies}  ·  ${snapshot?.players.length ?? 0}/32  ·  ${remaining}`);
      return;
    }
    const { player } = this.session.state;
    const x = this.touchLayout ? 12 : 18;
    const y = this.touchLayout ? 12 : 18;
    const width = this.touchLayout ? 184 : 224;
    const height = 58;
    this.healthPanel.clear();
    this.healthPanel.fillStyle(0x07110f, 0.88).fillRoundedRect(x, y, width, height, 13);
    this.healthPanel.lineStyle(1, 0xe7f0da, 0.18).strokeRoundedRect(x, y, width, height, 13);
    this.healthLabel.setPosition(x + 14, y + 9);
    this.healthValue.setPosition(x + width - 14, y + 8).setText(`${Math.ceil(player.health)} / ${player.maxHealth}`);
    const barX = x + 14;
    const barY = y + 34;
    const barWidth = width - 28;
    const barHeight = 11;
    const ratio = Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1);
    const fillColor = ratio > 0.55 ? 0x68c77b : ratio > 0.25 ? 0xe6b653 : 0xe15e52;
    this.healthFill.clear();
    this.healthFill.fillStyle(0x26352f, 1).fillRoundedRect(barX, barY, barWidth, barHeight, 6);
    if (ratio > 0) this.healthFill.fillStyle(fillColor, 1).fillRoundedRect(barX, barY, barWidth * ratio, barHeight, 6);
  }

  private createTouchControls(): void {
    this.touchControls = this.add.container(0, 0).setScrollFactor(0).setDepth(12);
    const base = this.add.circle(0, 0, 66, 0x07110f, 0.3).setStrokeStyle(2, 0xe6f0d8, 0.38);
    const ring = this.add.circle(0, 0, 42, 0x294337, 0.28).setStrokeStyle(2, 0xbcd5b7, 0.36);
    this.joystickRing = ring;
    this.joystickKnob = this.add.circle(0, 0, 25, 0xdcebd8, 0.62).setStrokeStyle(2, 0xffffff, 0.56);
    this.joystick = base;
    base.setInteractive(new Phaser.Geom.Circle(0, 0, 68), Phaser.Geom.Circle.Contains);
    base.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.joystickPointerId = pointer.id;
      this.updateJoystick(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joystickPointerId) this.updateJoystick(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joystickPointerId) this.resetJoystick();
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joystickPointerId) this.resetJoystick();
    });
    this.touchControls.add([base, ring, this.joystickKnob]);
    this.touchButtons = [this.makeTouchButton('A'), this.makeTouchButton('B')];
    this.touchControls.add(this.touchButtons);
  }

  private makeTouchButton(label: string): Phaser.GameObjects.Container {
    const button = this.add.container(0, 0);
    const circle = this.add.circle(0, 0, 31, 0x101b18, 0.62).setStrokeStyle(2, 0xe6f0d8, 0.5);
    const text = this.add.text(0, 0, label, { fontFamily: 'Arial, sans-serif', fontSize: '19px', color: '#edf5e7', fontStyle: 'bold' }).setOrigin(0.5);
    button.add([circle, text]);
    circle.setInteractive(new Phaser.Geom.Circle(0, 0, 33), Phaser.Geom.Circle.Contains);
    circle.on('pointerdown', () => button.setAlpha(0.68));
    circle.on('pointerup', () => button.setAlpha(1));
    circle.on('pointerout', () => button.setAlpha(1));
    return button;
  }

  private layoutHudAndTouchControls(): void {
    this.touchLayout = this.scale.width <= 760 || window.matchMedia('(pointer: coarse)').matches;
    this.touchControls.setVisible(this.touchLayout);
    this.touchControls.setPosition(0, 0);
    const joystickX = Math.min(92, this.scale.width * 0.27);
    const joystickY = this.scale.height - 100;
    this.joystick.setPosition(joystickX, joystickY);
    this.joystickRing.setPosition(joystickX, joystickY);
    this.joystickKnob.setPosition(joystickX, joystickY);
    if (this.scale.width < 380) {
      this.touchButtons[0]?.setPosition(this.scale.width - 48, this.scale.height - 158);
      this.touchButtons[1]?.setPosition(this.scale.width - 48, this.scale.height - 78);
    } else {
      this.touchButtons[0]?.setPosition(this.scale.width - 76, this.scale.height - 102);
      this.touchButtons[1]?.setPosition(this.scale.width - 158, this.scale.height - 75);
    }
    if (!this.touchLayout) this.resetJoystick();
    this.renderHud();
  }

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.joystick.x;
    const dy = pointer.y - this.joystick.y;
    const length = Math.hypot(dx, dy);
    const radius = 42;
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.joystickKnob.setPosition(this.joystick.x + x, this.joystick.y + y);
    const magnitude = Math.min(length / radius, 1);
    this.joystickVector = magnitude < 0.12 ? { x: 0, y: 0 } : { x: x / radius, y: y / radius };
  }

  private resetJoystick(): void {
    this.joystickPointerId = -1;
    this.joystickVector = { x: 0, y: 0 };
    this.joystickKnob?.setPosition(this.joystick?.x ?? 0, this.joystick?.y ?? 0);
  }

  private togglePause(): void {
    if (this.session.state.defeated) return;
    this.paused = !this.paused;
    if (this.paused && this.mode === 'online') {
      this.onlineSession?.send({ moveX: 0, moveY: 0, faceX: 0, faceY: 0 });
    }
    if (this.paused) {
      const shade = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x07100f, 0.78).setScrollFactor(0);
      const text = this.add.text(this.scale.width / 2, this.scale.height / 2, 'PAUSADO\n\nPressione ESC para continuar', { align: 'center', fontFamily: 'Arial, sans-serif', fontSize: '26px', color: '#f1f6df' }).setOrigin(0.5).setScrollFactor(0);
      this.overlay = this.add.container(0, 0, [shade, text]).setDepth(20);
    } else {
      this.overlay?.destroy();
      this.overlay = undefined;
    }
  }

  private showEndScreen(): void {
    if (this.overlay) return;
    const shade = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x180909, 0.82).setScrollFactor(0);
    const title = this.add.text(this.scale.width / 2, this.scale.height / 2 - 42, `CERCO ROMPIDO\nVocê alcançou a onda ${this.session.state.wave.number}`, { align: 'center', fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#ffe8d0' }).setOrigin(0.5).setScrollFactor(0);
    const retry = this.add.text(this.scale.width / 2, this.scale.height / 2 + 52, 'RECOMEÇAR', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#0f1d1a', backgroundColor: '#d6b46b', padding: { x: 20, y: 12 } }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    retry.on('pointerup', () => this.scene.restart({ name: this.session.state.player.name, mode: 'survival' }));
    this.overlay = this.add.container(0, 0, [shade, title, retry]).setDepth(30);
  }

  private loadFurnitureLayout(): void {
    try {
      const saved = localStorage.getItem(SANDBOX_LAYOUT_KEY);
      if (!saved) return;
      const entries: unknown = JSON.parse(saved);
      if (!Array.isArray(entries)) return;
      const defaults = this.session.state.furniture;
      const parsed = entries.flatMap((entry, index): Furniture[] => {
        if (!entry || typeof entry !== 'object') return [];
        const value = entry as Partial<Furniture>;
        if (!value.kind || !ALL_FURNITURE.includes(value.kind) ||
            !Number.isFinite(value.x) || !Number.isFinite(value.y)) return [];
        const template = defaults.find((item) => item.kind === value.kind);
        const width = Number.isFinite(value.width) && value.width! > 0 && value.width! <= 512 ? value.width! : template?.width;
        const height = Number.isFinite(value.height) && value.height! > 0 && value.height! <= 512 ? value.height! : template?.height;
        if (!width || !height) return [];
        return [{
          id: typeof value.id === 'string' ? value.id : `f-${index + 1}`,
          kind: value.kind, x: value.x!, y: value.y!, width, height,
          health: 100, maxHealth: 100, mass: template?.mass ?? 1.5
        }];
      });
      if (parsed.length || entries.length === 0) this.session.state.furniture = parsed;
    } catch {
      // Ignore invalid or unavailable local storage and keep the standard layout.
    }
  }

  private saveFurnitureLayout(): void {
    const layout = this.session.state.furniture.map(({ id, kind, x, y, width, height }) => ({ id, kind, x, y, width, height }));
    try {
      localStorage.setItem(SANDBOX_LAYOUT_KEY, JSON.stringify(layout));
      if (this.sandboxMessage) this.sandboxMessage.textContent = 'Disposição salva neste dispositivo';
    } catch {
      if (this.sandboxMessage) this.sandboxMessage.textContent = 'Não foi possível salvar neste navegador';
    }
  }

  private createSandboxPanel(): void {
    const panel = document.createElement('section');
    panel.className = 'sandbox-panel';
    panel.innerHTML = `
      <div class="sandbox-topline"><strong>EDITOR DO MAPA</strong><span id="sandbox-status">Clique numa peça para mover; escolha um item para adicionar</span></div>
      <div class="sandbox-actions">
        <button type="button" data-action="delete">Remover selecionado</button>
        <button type="button" data-action="save">Salvar</button>
        <button type="button" data-action="fit">Ver mapa todo</button>
        <button type="button" data-action="upper">Parte de cima</button>
        <button type="button" data-action="lower">Parte de baixo</button>
        <button type="button" data-action="reset">Restaurar padrão</button>
        <button type="button" data-action="exit">Voltar ao início</button>
      </div>
      <div class="sandbox-help">Arraste os móveis para mover · selecione uma peça e clique no chão para duplicar · roda do mouse aproxima · botão direito arrasta o mapa · Delete remove</div>
      <div class="sandbox-palette" aria-label="Móveis disponíveis"></div>`;
    this.sandboxPanel = this.add.dom(this.scale.width / 2, 8, panel).setOrigin(0.5, 0).setScrollFactor(0).setDepth(30);
    this.sandboxMessage = panel.querySelector<HTMLElement>('#sandbox-status')!;
    const palette = panel.querySelector<HTMLElement>('.sandbox-palette')!;
    for (const kind of ALL_FURNITURE) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sandbox-item';
      button.dataset.kind = kind;
      button.textContent = FURNITURE_LABELS[kind];
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.selectedKind = kind;
        this.selectedFurnitureId = null;
        this.setSandboxStatus(`Selecionado: ${FURNITURE_LABELS[kind]} · clique no mapa para colocar`);
        panel.querySelectorAll('.sandbox-item').forEach((button) => button.classList.toggle('active', button === event.currentTarget));
      });
      palette.append(button);
    }
    panel.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      switch (button.dataset.action) {
        case 'delete': this.removeSelectedFurniture(); break;
        case 'save': this.saveFurnitureLayout(); break;
        case 'fit': this.fitSandboxMap(); break;
        case 'upper': this.focusMapSection(0.23); break;
        case 'lower': this.focusMapSection(0.77); break;
        case 'reset': this.restoreDefaultFurniture(); break;
        case 'exit': this.scene.start('menu'); break;
      }
    }));
  }

  private setupSandboxInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.panning = true;
        this.lastPanPoint = { x: pointer.x, y: pointer.y };
        return;
      }
      if (pointer.leftButtonDown()) this.beginSandboxEdit(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) this.panning = false;
      if (pointer.leftButtonReleased() && this.draggingFurnitureId) {
        this.draggingFurnitureId = null;
        this.saveFurnitureLayout();
      }
    });
    this.input.on('pointerupoutside', () => {
      this.panning = false;
      if (this.draggingFurnitureId) {
        this.draggingFurnitureId = null;
        this.saveFurnitureLayout();
      }
    });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const camera = this.cameras.main;
      const before = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (dy < 0 ? 1.12 : 1 / 1.12), 0.12, 1.25));
      const after = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
    });
    this.input.keyboard?.on('keydown-DELETE', () => this.removeSelectedFurniture());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.removeSelectedFurniture());
  }

  private beginSandboxEdit(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const item = [...this.session.state.furniture].reverse().find((candidate) =>
      world.x >= candidate.x && world.x <= candidate.x + candidate.width &&
      world.y >= candidate.y && world.y <= candidate.y + candidate.height
    );
    if (item) {
      this.selectedFurnitureId = item.id;
      this.selectedKind = null;
      this.sandboxPanel?.node.querySelectorAll('.sandbox-item').forEach((button) => button.classList.remove('active'));
      this.draggingFurnitureId = item.id;
      this.dragOffset = { x: world.x - item.x, y: world.y - item.y };
      this.setSandboxStatus(`${FURNITURE_LABELS[item.kind]} selecionado · arraste para mover`);
      return;
    }
    if (!this.selectedKind) {
      this.selectedFurnitureId = null;
      this.setSandboxStatus('Escolha um móvel na faixa acima para adicionar');
      return;
    }
    const size = this.getFurnitureSize(this.selectedKind);
    if (!size) return;
    const x = this.snapPosition(world.x - size.width / 2);
    const y = this.snapPosition(world.y - size.height / 2);
    let id = `sandbox-${++this.furnitureSequence}`;
    while (this.session.state.furniture.some((item) => item.id === id)) id = `sandbox-${++this.furnitureSequence}`;
    const next: Furniture = {
      id, kind: this.selectedKind, x, y,
      width: size.width, height: size.height, health: 100, maxHealth: 100, mass: 1.5
    };
    if (!this.isFurniturePositionValid(next)) {
      this.setSandboxStatus('Esse espaço está bloqueado; tente outro ponto');
      return;
    }
    this.session.state.furniture.push(next);
    const atlasFrame = FURNITURE_ATLAS_FRAMES[next.kind];
    const sprite = atlasFrame ? this.add.image(0, 0, 'classic-tiles', atlasFrame) : this.add.image(0, 0, `furniture-${next.kind}`);
    this.furnitureSprites.set(next.id, sprite.setDepth(2));
    this.selectedFurnitureId = next.id;
    this.selectedKind = null;
    this.sandboxPanel?.node.querySelectorAll('.sandbox-item').forEach((button) => button.classList.remove('active'));
    this.setSandboxStatus(`${FURNITURE_LABELS[next.kind]} colocado`);
    this.saveFurnitureLayout();
  }

  private updateSandboxPointer(): void {
    const pointer = this.input.activePointer;
    if (this.panning && pointer.isDown) {
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPanPoint.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPanPoint.y) / camera.zoom;
      this.lastPanPoint = { x: pointer.x, y: pointer.y };
    }
    if (!this.draggingFurnitureId || !pointer.isDown) return;
    const item = this.session.state.furniture.find((candidate) => candidate.id === this.draggingFurnitureId);
    if (!item) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = this.snapPosition(world.x - this.dragOffset.x);
    const y = this.snapPosition(world.y - this.dragOffset.y);
    if (this.isFurniturePositionValid({ ...item, x, y }, item.id)) {
      item.x = x;
      item.y = y;
    }
  }

  private getFurnitureSize(kind: FurnitureKind): { width: number; height: number } | null {
    const atlasFrame = FURNITURE_ATLAS_FRAMES[kind];
    const frame = atlasFrame ? this.textures.getFrame('classic-tiles', atlasFrame) : this.textures.getFrame(`furniture-${kind}`);
    return frame ? { width: frame.cutWidth, height: frame.cutHeight } : null;
  }

  private isFurniturePositionValid(candidate: Furniture, ignoredId?: string): boolean {
    const left = Math.floor(candidate.x / TILE_SIZE);
    const top = Math.floor(candidate.y / TILE_SIZE);
    const right = Math.floor((candidate.x + candidate.width - 1) / TILE_SIZE);
    const bottom = Math.floor((candidate.y + candidate.height - 1) / TILE_SIZE);
    if (left < 0 || top < 0 || right >= MAP_WIDTH || bottom >= MAP_HEIGHT) return false;
    for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
      if (isStaticBlocked(column, row)) return false;
    }
    return !this.session.state.furniture.some((item) => item.id !== ignoredId &&
      candidate.x < item.x + item.width && candidate.x + candidate.width > item.x &&
      candidate.y < item.y + item.height && candidate.y + candidate.height > item.y);
  }

  private snapPosition(value: number): number { return Math.round(value / 8) * 8; }

  private removeSelectedFurniture(): void {
    if (!this.selectedFurnitureId) {
      this.setSandboxStatus('Selecione um móvel no mapa para removê-lo');
      return;
    }
    const index = this.session.state.furniture.findIndex((item) => item.id === this.selectedFurnitureId);
    if (index < 0) return;
    this.session.state.furniture.splice(index, 1);
    this.furnitureSprites.get(this.selectedFurnitureId)?.destroy();
    this.furnitureSprites.delete(this.selectedFurnitureId);
    this.selectedFurnitureId = null;
    this.saveFurnitureLayout();
  }

  private restoreDefaultFurniture(): void {
    this.session.state.furniture = this.defaultFurniture.map((item) => ({ ...item }));
    for (const sprite of this.furnitureSprites.values()) sprite.destroy();
    this.furnitureSprites.clear();
    for (const item of this.session.state.furniture) {
      const atlasFrame = FURNITURE_ATLAS_FRAMES[item.kind];
      const sprite = atlasFrame
        ? this.add.image(0, 0, 'classic-tiles', atlasFrame)
        : this.add.image(0, 0, `furniture-${item.kind}`);
      this.furnitureSprites.set(item.id, sprite.setDepth(2));
    }
    this.selectedFurnitureId = null;
    this.selectedKind = null;
    this.saveFurnitureLayout();
    this.setSandboxStatus('Disposição padrão restaurada');
  }

  private setSandboxStatus(message: string): void {
    if (this.sandboxMessage) this.sandboxMessage.textContent = message;
  }

  private fitSandboxMap(): void {
    const zoom = Math.min((this.scale.width - 24) / WORLD_WIDTH, (this.scale.height - 140) / WORLD_HEIGHT);
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.12, 0.8));
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }

  private focusMapSection(ratio: number): void {
    this.cameras.main.setZoom(Math.max(this.cameras.main.zoom, 0.28));
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT * ratio);
  }
}
