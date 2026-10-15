import Phaser from 'phaser';
import './styles.css';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0b1618',
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene, GameScene]
});
