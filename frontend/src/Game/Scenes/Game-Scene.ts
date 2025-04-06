import { SCENE_KEYS } from "./SceneKeys";
import { Player } from "../game-objects/Players/player";
import { OtherPlayer } from "../game-objects/Players/other-player";
import { ASSET_KEYS, PLAYER_ANIMATION_KEYS } from "../common/assets";
import { KeyboardComponent } from "../components/input/keyboard-component";
import { Room } from "../game-objects/Rooms/room";

import { Client, Room as ColyseusRoom } from "colyseus.js";

export class GameScene extends Phaser.Scene {
  #player!: Player;
  #controls!: KeyboardComponent;
  #roomGroup!: Phaser.GameObjects.Group;
  #client!: Client;
  #gameRoom: ColyseusRoom | null = null;
  #otherPlayers: Map<string, OtherPlayer> = new Map();
  #lastSentX: number = 0;
  #lastSentY: number = 0;
  #lastSentAnimation: string | undefined;

  constructor() {
    super({
      key: SCENE_KEYS.GAME_SCENE,
    });
  }

  preload() {
    console.log("game loaded");
    this.load.image("botany", "assets/world/botanic.png");
    this.load.image("room", "assets/world/truck.png");
    this.load.tilemapTiledJSON("map", "tiled/mail-tile.json");
  }

  async create() {
    if (!this.input.keyboard) {
      console.error("Keyboard input not available");
      return;
    }

    this.#client = new Client("ws://localhost:2567");

    try {
      this.#gameRoom = await this.#client.joinOrCreate("my_room");
      console.log("Connected to room:", this.#gameRoom.sessionId);
      this.setupRoomHandlers();
      this.initializeGameObjects();
    } catch (error) {
      console.error("Failed to connect to Colyseus server:", error);
      this.initializeGameObjects(); // Initialize game even without multiplayer
    }
  }

  setupRoomHandlers() {
    if (!this.#gameRoom) return;

    // Handle room state changes
    this.#gameRoom.onStateChange((state) => {
      console.log("Room state updated:", state);

      if (state.players) {
        // Process all players in the current state
        state.players.forEach((player: any, sessionId: string) => {
          // Skip our own player
          if (sessionId === this.#gameRoom?.sessionId) return;

          if (!this.#otherPlayers.has(sessionId)) {
            // Create a new OtherPlayer instance for this player
            const otherPlayer = new OtherPlayer({
              scene: this,
              position: { x: player.x || 100, y: player.y || 100 },
              texture: ASSET_KEYS.PLAYER,
              frame: 0,
              sessionId: sessionId
            });

            this.#otherPlayers.set(sessionId, otherPlayer);

            // Set up physics for the new player
            this.physics.add.collider(otherPlayer, this.#roomGroup);
            this.physics.add.collider(this.#player, otherPlayer);
            otherPlayer.setCollideWorldBounds(true);
            otherPlayer.setDepth(10);
          } else {
            // Update existing player
            const otherPlayer = this.#otherPlayers.get(sessionId);
            if (otherPlayer) {
              otherPlayer.updateFromServer(
                player.x || otherPlayer.x,
                player.y || otherPlayer.y,
                player.animation
              );
            }
          }
        });

        // Remove players that are no longer in the state
        this.#otherPlayers.forEach((player, sessionId) => {
          if (!state.players.has(sessionId)) {
            player.destroy();
            this.#otherPlayers.delete(sessionId);
          }
        });
      }
    });

    // Handle player joined events
    this.#gameRoom.onMessage("playerJoined", (message) => {
      console.log("Player joined:", message);
    });

    // Handle player left events
    this.#gameRoom.onMessage("playerLeft", (message) => {
      console.log("Player left:", message);
      if (message.sessionId && this.#otherPlayers.has(message.sessionId)) {
        const otherPlayer = this.#otherPlayers.get(message.sessionId);
        if (otherPlayer) {
          otherPlayer.destroy();
          this.#otherPlayers.delete(message.sessionId);
        }
      }
    });

    // Handle position updates
    this.#gameRoom.onMessage("updatePosition", (message) => {
      if (message.sessionId && message.sessionId !== this.#gameRoom?.sessionId) {
        const otherPlayer = this.#otherPlayers.get(message.sessionId);
        if (otherPlayer) {
          otherPlayer.updateFromServer(message.x, message.y, message.animation);
        } else {
          // Create player if they don't exist yet
          const newPlayer = new OtherPlayer({
            scene: this,
            position: { x: message.x, y: message.y },
            texture: ASSET_KEYS.PLAYER,
            frame: 0,
            sessionId: message.sessionId
          });

          this.#otherPlayers.set(message.sessionId, newPlayer);

          // Set up physics
          this.physics.add.collider(newPlayer, this.#roomGroup);
          this.physics.add.collider(this.#player, newPlayer);
          newPlayer.setCollideWorldBounds(true);
          newPlayer.setDepth(10);

          if (message.animation) {
            newPlayer.playAnimation(message.animation);
          }
        }
      }
    });

    // Handle disconnection
    this.#gameRoom.onLeave((code) => {
      console.log("Left room:", code);
      this.#gameRoom = null;
    });
  }

  initializeGameObjects() {
    this.#controls = new KeyboardComponent(this.input.keyboard!);
    this.physics.world.setBounds(0,0,2000,2000);
    this.cameras.main.setBounds(0,0,2000,2000);

    // Create player
    this.#player = new Player({
      controls: this.#controls,
      scene: this,
      position: { x: 250, y: 100 },
      texture: ASSET_KEYS.PLAYER,
      frame: 0,
    });

    this.cameras.main.startFollow(this.#player, true, 0.05, 0.05)

    // Create tilemap
    const map = this.make.tilemap({ key: 'map' });
    const botanyTileSet = map.addTilesetImage('botany', 'botany');
    const roomTileSet = map.addTilesetImage('truck', 'room');

    // Create layers
    const background = map.createLayer('background', botanyTileSet!);
    const rocks = map.createLayer('rocks', botanyTileSet!);
    const trees = map.createLayer('trees', botanyTileSet!);
    const decorations = map.createLayer('decorations', roomTileSet!);
    const collision = map.createLayer('collision-map', botanyTileSet!);

    if (!collision) {
      console.error("Collision layer not found");
      return;
    }

    this.#player.setDepth(10);

    // Create rooms
    this.#roomGroup = this.physics.add.group([
      new Room({
        scene: this,
        position: { x: this.scale.width / 2, y: this.scale.height / 2 },
        texture: ASSET_KEYS.ROOM,
      }),
    ]);

    this.cameras.main.startFollow(this.#player, true, 0.05, 0.05);
    this.setAnimations();
    this.#registerColliders();

    // Set up collision with the map
    collision.setCollision([28]);
    this.physics.add.collider(this.#player, collision);

    // Set up collision for other players with the map
    this.#otherPlayers.forEach(player => {
      this.physics.add.collider(player, collision);
    });
  }

  #registerColliders() {
    this.#player.setCollideWorldBounds(true);

    // Set up room colliders
    this.#roomGroup.getChildren().forEach((room) => {
      const modifiedRoom = room as Phaser.Physics.Arcade.Image;
      modifiedRoom.setImmovable(true);
      modifiedRoom.setCollideWorldBounds(true);
    });

    // Room collision that redirects to a new page
    this.physics.add.collider(this.#player, this.#roomGroup, (player: any, room: any) => {
      window.location.href = "room/test";
    });

    // Notify server about room collision
    this.physics.add.collider(
      this.#player,
      this.#roomGroup,
      (player: any, room: any) => {
        console.log("hit");

        if (this.#gameRoom) {
          this.#gameRoom.send("roomCollision", {
            roomId: room.getData("id") || "unknown",
            playerPosition: { x: player.x, y: player.y },
          });
        }
      }
    );

    // Set up colliders for other players
    this.#otherPlayers.forEach((otherPlayer) => {
      otherPlayer.setCollideWorldBounds(true);
      this.physics.add.collider(otherPlayer, this.#roomGroup);
      this.physics.add.collider(this.#player, otherPlayer);
    });
  }

  setAnimations() {
    let rep = 1;

    // Idle animations
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.IDLE_DOWN,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 0,
        end: 0,
      }),
      frameRate: 8,
      repeat: 1,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.IDLE_LEFT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 3,
        end: 3,
      }),
      frameRate: 8,
      repeat: 1,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.IDLE_UP,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 6,
        end: 6,
      }),
      frameRate: 8,
      repeat: 1,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.IDLE_RIGHT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 9,
        end: 9,
      }),
      frameRate: 8,
      repeat: 1,
    });

    // Walking animations
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.WALK_DOWN,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 1,
        end: 2,
      }),
      frameRate: 8,
      repeat: rep,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.WALK_LEFT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 4,
        end: 5,
      }),
      frameRate: 8,
      repeat: rep,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.WALK_UP,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 7,
        end: 8,
      }),
      frameRate: 8,
      repeat: rep,
    });
    this.anims.create({
      key: PLAYER_ANIMATION_KEYS.WALK_RIGHT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PLAYER, {
        start: 10,
        end: 11,
      }),
      frameRate: 8,
      repeat: rep,
    });
  }

  update() {
    // Ensure physics are applied to any new other players
    if (this.#otherPlayers.size > 0) {
      this.#otherPlayers.forEach((otherPlayer) => {
        if (!otherPlayer.body) {
          this.physics.add.existing(otherPlayer);
          otherPlayer.setCollideWorldBounds(true);
          this.physics.add.collider(otherPlayer, this.#roomGroup);
          this.physics.add.collider(this.#player, otherPlayer);
        }
      });
    }

    // Send position updates to the server
    if (this.#gameRoom && this.#player) {
      const currentAnim = this.#player.anims.currentAnim?.key;
      const moved =
        this.#player.x !== this.#lastSentX ||
        this.#player.y !== this.#lastSentY ||
        currentAnim !== this.#lastSentAnimation;

      if (moved) {
        this.#gameRoom.send("updatePosition", {
          x: this.#player.x,
          y: this.#player.y,
          animation: currentAnim,
        });

        this.#lastSentX = this.#player.x;
        this.#lastSentY = this.#player.y;
        this.#lastSentAnimation = currentAnim;
      }
    }
  }

  shutdown() {
    if (this.#gameRoom) {
      this.#gameRoom.leave();
      this.#gameRoom = null;
    }
  }
}
