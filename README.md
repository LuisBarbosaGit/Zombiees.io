# Cerco Zero — beta local

Protótipo local de sobrevivência 2D em câmera superior. Evite o contato com os zumbis e sobreviva às ondas.

## Executar

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite. Para verificar o projeto:

```bash
npm test
npm run build
```

## Controles

- `WASD` ou setas: mover
- Mouse: orientar o personagem para o cursor; o movimento continua no teclado
- Mobile: joystick para mover; botões `A` e `B` reservados para ações futuras
- `E`: interação com objetos (futura)
- `Esc`: pausar

## Sandbox de móveis

Na tela inicial, escolha **Editar móveis no sandbox**. Clique em um móvel e arraste para reposicionar; escolha um item na paleta superior e clique no chão para adicioná-lo. Com um móvel selecionado, use **Remover selecionado** ou `Delete` para tirá-lo do mapa. A posição é ajustada em passos pequenos, e peças não podem ser colocadas sobre paredes, árvores ou outros móveis. Use a roda do mouse para aproximar/afastar, arraste com o botão direito para mover a câmera e os atalhos no painel para enquadrar cada parte do mapa. O editor usa somente os sprites de móveis existentes.

As alterações são salvas automaticamente neste navegador (`localStorage`) e também pelo botão **Salvar**; o modo sobrevivência carrega a mesma disposição. **Restaurar padrão** recupera os móveis que estavam no mapa ao abrir o editor.

## Mapa e assets

`src/maps/townMap.ts` contém a grade de colisão de 35 × 57 tiles extraída do HTML fornecido. Os assets originais ficam em `public/assets/original/`: `tilesheet.png` é preservado sem edição e `tilesheet.atlas.json` descreve seus recortes. Gere novamente o atlas com `npm run assets:atlas`.

O mapa em uso é `public/assets/maps/braains-classic-clean.tmj`: inclui chão, paredes e árvores, sem móveis posicionados. Os móveis originais, extraídos em PNG sem redesenho, ficam em `public/assets/furniture/`; regenere-os com `npm run assets:furniture`.

## Arquitetura e multiplayer

`Simulation` contém regras, IA, ondas e colisão sem depender do Phaser. Zumbis causam dano ao encostar no jogador. As ações de pegar e soltar objetos serão implementadas depois. `LocalSession` é o adaptador atual: uma sessão WebSocket autoritativa futura poderá enviar `InputFrame` ao servidor e receber `WorldState`, preservando cenas e regras.

O projeto não inclui login, chat, loja ou rede no beta atual.
