import Phaser from "phaser";
import "./style.css";

class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("main");
  }

  create() {
    const { width, height } = this.scale;

    this.player = this.add.rectangle(width / 2, height / 2, 32, 32, 0xff0000);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.keys;
  }

  update(_: number, delta: number) {
    const speed = 220;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    const { width, height } = this.scale;
    const half = 16;

    this.player.x = Phaser.Math.Clamp(
      this.player.x + dx * speed * (delta / 1000),
      half,
      width - half
    );

    this.player.y = Phaser.Math.Clamp(
      this.player.y + dy * speed * (delta / 1000),
      half,
      height - half
    );
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 600,
  backgroundColor: "#121212",
  scene: [MainScene]
};

new Phaser.Game(config);
