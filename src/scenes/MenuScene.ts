import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }

  create(): void {
    const backdrop = this.add.graphics();
    this.drawBackdrop(backdrop);
    const menu = document.createElement('section');
    menu.className = 'menu-card';
    menu.innerHTML = `
      <div class="eyebrow">BETA LOCAL · SOBREVIVÊNCIA</div>
      <h1>CERCO <span>ZERO</span></h1>
      <p class="lead">Tranque as entradas. Sobreviva à noite.</p>
      <label for="player-name">Codinome</label>
      <input id="player-name" maxlength="16" autocomplete="nickname" value="Sobrevivente" />
      <button id="start-game" type="button">Iniciar sobrevivência <b>→</b></button>
      <button id="start-sandbox" class="sandbox-entry" type="button">Editar móveis no sandbox <b>✎</b></button>
      <div class="menu-columns">
        <section><h2>OBJETIVO</h2><p>Sobreviva às ondas e evite o contato com os zumbis.</p></section>
        <section><h2>CONTROLES</h2><p><kbd>WASD</kbd> mover<br><kbd>Joystick</kbd> mover no celular<br><kbd>E</kbd> interação futura · <kbd>Esc</kbd> pausar</p></section>
      </div>
      <p class="menu-note">Protótipo para um jogador · arquitetura preparada para sessões online.</p>`;
    const element = this.add.dom(this.scale.width / 2, this.scale.height / 2, menu);
    const input = menu.querySelector<HTMLInputElement>('#player-name')!;
    menu.querySelector<HTMLButtonElement>('#start-game')!.addEventListener('click', () => {
      this.scene.start('game', { name: input.value.trim() || 'Sobrevivente', mode: 'survival' });
    });
    menu.querySelector<HTMLButtonElement>('#start-sandbox')!.addEventListener('click', () => {
      this.scene.start('game', { name: input.value.trim() || 'Editor', mode: 'sandbox' });
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.scene.start('game', { name: input.value.trim() || 'Sobrevivente', mode: 'survival' });
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      element.setPosition(size.width / 2, size.height / 2);
      this.drawBackdrop(backdrop);
    });
  }

  private drawBackdrop(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    graphics.fillGradientStyle(0x0b1618, 0x0b1618, 0x1f342e, 0x1f342e, 1);
    graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    graphics.lineStyle(1, 0x85a88d, 0.09);
    for (let x = -this.scale.height; x < this.scale.width + this.scale.height; x += 48) graphics.lineBetween(x, 0, x + this.scale.height, this.scale.height);
    graphics.fillStyle(0x79a978, 0.08);
    graphics.fillCircle(this.scale.width * 0.15, this.scale.height * 0.18, 240);
    graphics.fillCircle(this.scale.width * 0.83, this.scale.height * 0.77, 310);
  }
}
