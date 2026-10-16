import type { Session } from '@supabase/supabase-js';
import Phaser from 'phaser';
import { getSupabaseClient } from '../auth/supabaseClient';

export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }

  create(): void {
    const backdrop = this.add.graphics();
    this.drawBackdrop(backdrop);
    const menu = document.createElement('section');
    menu.className = 'menu-card';
    menu.innerHTML = `
      <div class="eyebrow"><i></i> INFECÇÃO GLOBAL · BETA ONLINE</div>
      <h1>ZOMBIES<span>.IO</span></h1>
      <p class="lead">Sobreviva à infecção. A cidade não espera por ninguém.</p>
      <label for="player-name">Seu nome</label>
      <input id="player-name" maxlength="16" autocomplete="nickname" value="Sobrevivente" />
      <div class="room-status"><span class="status-dot"></span><span id="room-status">Consultando sala...</span><span class="room-live">SALA PÚBLICA</span></div>
      <button id="start-online" type="button">Jogar online <b>→</b></button>
      <p id="online-error" class="online-error" role="status" aria-live="polite"></p>
      <div class="account-row">
        <span id="account-status">Jogue sem conta. Estatísticas e progresso não serão salvos.</span>
        <button id="account-toggle" class="account-toggle" type="button">Entrar para salvar progresso</button>
      </div>
      <form id="account-panel" class="account-panel" hidden>
        <label for="account-email">E-mail da conta</label>
        <div class="account-form-row">
          <input id="account-email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required />
          <button id="account-submit" type="submit">Enviar link</button>
        </div>
        <p id="account-feedback" role="status" aria-live="polite">Enviaremos um link seguro para entrar ou criar sua conta.</p>
      </form>
      <div class="secondary-actions">
        <button id="start-game" class="local-entry" type="button">Sobrevivência local</button>
        <button id="start-sandbox" class="sandbox-entry" type="button">Editor sandbox <b>✎</b></button>
      </div>
      <div class="menu-columns">
        <section><h2>HUMANOS VS. ZUMBIS</h2><p>Entre na sala pelo nome, escolha sua rota e fuja do contato. Quem for alcançado se junta à horda.</p></section>
        <section><h2>CONTROLES</h2><p><kbd>WASD</kbd> ou setas para mover<br><kbd>Mouse</kbd> orientar · <kbd>Joystick</kbd> no celular</p></section>
      </div>
      <p class="menu-note">Jogar não exige conta. Entre para salvar seu histórico e progresso.</p>`;
    const element = this.add.dom(this.scale.width / 2, this.scale.height / 2, menu);
    const input = menu.querySelector<HTMLInputElement>('#player-name')!;
    const onlineButton = menu.querySelector<HTMLButtonElement>('#start-online')!;
    const accountStatus = menu.querySelector<HTMLElement>('#account-status')!;
    const accountToggle = menu.querySelector<HTMLButtonElement>('#account-toggle')!;
    const accountPanel = menu.querySelector<HTMLFormElement>('#account-panel')!;
    const accountEmail = menu.querySelector<HTMLInputElement>('#account-email')!;
    const accountFeedback = menu.querySelector<HTMLElement>('#account-feedback')!;
    const auth = getSupabaseClient();
    let signedIn = false;

    const renderAccount = (session: Session | null): void => {
      signedIn = Boolean(session?.user && !session.user.is_anonymous);
      if (signedIn) {
        accountStatus.textContent = `Progresso salvo na conta ${session!.user.email ?? ''}.`;
        accountToggle.textContent = 'Sair da conta';
        accountPanel.hidden = true;
      } else {
        accountStatus.textContent = 'Jogue sem conta. Estatísticas e progresso não serão salvos.';
        accountToggle.textContent = 'Entrar para salvar progresso';
      }
    };

    const sendMagicLink = async (event: SubmitEvent): Promise<void> => {
      event.preventDefault();
      if (!auth) return;
      const submit = menu.querySelector<HTMLButtonElement>('#account-submit')!;
      submit.disabled = true;
      accountFeedback.textContent = 'Enviando link...';
      try {
        const { error } = await auth.auth.signInWithOtp({
          email: accountEmail.value.trim(),
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        accountFeedback.textContent = 'Link enviado. Abra seu e-mail para entrar; ao voltar, seu progresso ficará salvo nesta conta.';
      } catch (error) {
        accountFeedback.textContent = error instanceof Error ? error.message : 'Não foi possível enviar o link.';
      } finally {
        submit.disabled = false;
      }
    };

    if (auth) {
      const { data: { subscription } } = auth.auth.onAuthStateChange((_event, session) => {
        renderAccount(session);
        if (session?.user.is_anonymous) queueMicrotask(() => void auth.auth.signOut({ scope: 'local' }));
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => subscription.unsubscribe());
      void auth.auth.getSession().then(({ data: { session } }) => {
        if (session?.user.is_anonymous) {
          renderAccount(null);
          void auth.auth.signOut({ scope: 'local' });
        } else {
          renderAccount(session);
        }
      });
      accountToggle.addEventListener('click', async () => {
        if (signedIn) {
          const { error } = await auth.auth.signOut({ scope: 'local' });
          if (error) accountFeedback.textContent = error.message;
          else accountFeedback.textContent = 'Você saiu da conta. Pode continuar jogando como convidado.';
        } else {
          accountPanel.hidden = !accountPanel.hidden;
          if (!accountPanel.hidden) accountEmail.focus();
        }
      });
      accountPanel.addEventListener('submit', (event) => void sendMagicLink(event));
    } else {
      accountStatus.textContent = 'Jogue sem conta. Login e salvamento não estão configurados neste deploy.';
      accountToggle.disabled = true;
    }

    const startLocal = (): void => { this.scene.start('game', { name: input.value.trim() || 'Sobrevivente', mode: 'survival' }); };
    menu.querySelector<HTMLButtonElement>('#start-game')!.addEventListener('click', startLocal);
    onlineButton.addEventListener('click', () => {
      onlineButton.disabled = true;
      this.scene.start('game', { name: input.value.trim() || 'Sobrevivente', mode: 'online' });
    });
    menu.querySelector<HTMLButtonElement>('#start-sandbox')!.addEventListener('click', () => {
      this.scene.start('game', { name: input.value.trim() || 'Editor', mode: 'sandbox' });
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') startLocal();
    });
    void this.refreshRoom(menu);
    const roomPoll = window.setInterval(() => void this.refreshRoom(menu), 10000);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.clearInterval(roomPoll));
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      element.setPosition(size.width / 2, size.height / 2);
      this.drawBackdrop(backdrop);
    });
  }

  private async refreshRoom(menu: HTMLElement): Promise<void> {
    const status = menu.querySelector<HTMLElement>('#room-status');
    if (!status) return;
    const apiUrl = import.meta.env.VITE_GAME_API_URL || 'http://127.0.0.1:3001/api';
    try {
      const response = await fetch(`${apiUrl}/rooms/main`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error();
      const room = await response.json() as { playerCount: number; capacity: number; status: string };
      status.textContent = `${room.playerCount} / ${room.capacity} jogadores · ${room.status === 'active' ? 'em partida' : 'aguardando'}`;
      menu.querySelector('.room-status')?.classList.add('connected');
    } catch {
      status.textContent = 'Servidor offline · modo local disponível';
      menu.querySelector('.room-status')?.classList.remove('connected');
    }
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
