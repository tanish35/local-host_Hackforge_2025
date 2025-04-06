import { PLAYER_ANIMATION_KEYS } from "@/Game/common/assets";
import { DIRECTIONS, Position } from "@/Game/common/types";
import { isPhysicsArcadeBody } from "@/Game/common/utils";

export type OtherPlayerConfig = {
  scene: Phaser.Scene;
  position: Position;
  texture: string;
  frame?: string | number;
  sessionId: string;
};

export class OtherPlayer extends Phaser.Physics.Arcade.Sprite {
  #direction: DIRECTIONS;
  readonly sessionId: string;

  constructor(config: OtherPlayerConfig) {
    const {
      scene,
      position: { x, y },
      texture,
      frame,
      sessionId
    } = config;

    super(scene, x, y, texture, frame || 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.sessionId = sessionId;
    this.#direction = DIRECTIONS.DOWN;
    this.play({ key: PLAYER_ANIMATION_KEYS.IDLE_DOWN }, true);

    // Set specific properties for networked players
    if (isPhysicsArcadeBody(this.body)) {
      this.body.setImmovable(false);
      this.body.pushable = false; // Don't let local player push this player
    }
  }

  playAnimation(animationKey: string) {
    this.play({ key: animationKey, repeat: -1 }, true);

    // Update direction based on animation
    if (animationKey.includes('UP')) {
      this.#direction = DIRECTIONS.UP;
    } else if (animationKey.includes('DOWN')) {
      this.#direction = DIRECTIONS.DOWN;
    } else if (animationKey.includes('LEFT')) {
      this.#direction = DIRECTIONS.LEFT;
    } else if (animationKey.includes('RIGHT')) {
      this.#direction = DIRECTIONS.RIGHT;
    }
  }

  updateFromServer(x: number, y: number, animationKey?: string) {
    // Update position
    this.setPosition(x, y);

    // Update animation if provided
    if (animationKey) {
      this.playAnimation(animationKey);
    } else {
      // Default to idle animation based on current direction
      switch (this.#direction) {
        case DIRECTIONS.UP:
          this.playAnimation(PLAYER_ANIMATION_KEYS.IDLE_UP);
          break;
        case DIRECTIONS.DOWN:
          this.playAnimation(PLAYER_ANIMATION_KEYS.IDLE_DOWN);
          break;
        case DIRECTIONS.LEFT:
          this.playAnimation(PLAYER_ANIMATION_KEYS.IDLE_LEFT);
          break;
        case DIRECTIONS.RIGHT:
          this.playAnimation(PLAYER_ANIMATION_KEYS.IDLE_RIGHT);
          break;
      }
    }
  }
}
