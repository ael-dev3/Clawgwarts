import Phaser from "phaser";
import {
  prototypeBus,
  toClock,
  type AgentSnapshot,
  type AgentStateLabel,
  type ChainSnapshot,
  type ChainStatus,
  type HouseId,
  type HouseSnapshot,
  type PrototypeSnapshot
} from "./prototypeBus";

const TILE_SIZE = 32;
const WORLD_TILES_X = 56;
const WORLD_TILES_Y = 34;
const PROXIMITY_RADIUS = 132;
const SIM_STEP_MS = 120;
const SNAPSHOT_INTERVAL_MS = 320;
const TRANSPORT_INTERVAL_MS = 900;

const HOUSE_COLORS: Record<HouseId, number> = {
  Creators: 0xff8f5a,
  Builders: 0x42c6ff,
  Degens: 0xffd15a
};

type StationDomain = HouseId | "Shared";

interface PhaseDefinition {
  id: "enrollment" | "workshops" | "collab" | "finals";
  label: string;
  durationMs: number;
}

interface StationDefinition {
  id: string;
  label: string;
  tileX: number;
  tileY: number;
  domain: StationDomain;
  color: number;
  baseReward: number;
  chainChance: number;
  specialties: string[];
}

interface AgentRuntime {
  id: string;
  name: string;
  house: HouseId;
  sprite: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  state: "idle" | "moving" | "working";
  focus: string;
  tileX: number;
  tileY: number;
  route: Phaser.Math.Vector2[];
  activeStation?: StationDefinition;
  nextDecisionAt: number;
  workEndsAt: number;
  momentum: number;
  moveTween?: Phaser.Tweens.Tween;
  pulseTween?: Phaser.Tweens.Tween;
}

interface ChainAction {
  id: string;
  actor: string;
  house: HouseId | null;
  label: string;
  status: ChainStatus;
  nextAt: number;
  expiresAt: number;
  reward: number;
}

const PHASES: PhaseDefinition[] = [
  { id: "enrollment", label: "Enrollment", durationMs: 24000 },
  { id: "workshops", label: "House Workshops", durationMs: 30000 },
  { id: "collab", label: "Cross-House Collaboration", durationMs: 28000 },
  { id: "finals", label: "Final Trials", durationMs: 30000 }
];

const STATIONS: StationDefinition[] = [
  {
    id: "creator-studio",
    label: "Creator Studio",
    tileX: 9,
    tileY: 8,
    domain: "Creators",
    color: 0xff8f5a,
    baseReward: 6,
    chainChance: 0.4,
    specialties: ["storyboarding", "clip sequencing", "channel launch"]
  },
  {
    id: "stream-lab",
    label: "Stream Lab",
    tileX: 14,
    tileY: 10,
    domain: "Creators",
    color: 0xff8f5a,
    baseReward: 5,
    chainChance: 0.35,
    specialties: ["audience growth", "multistream sync", "brand placement"]
  },
  {
    id: "builder-forge",
    label: "Builder Forge",
    tileX: 29,
    tileY: 8,
    domain: "Builders",
    color: 0x42c6ff,
    baseReward: 7,
    chainChance: 0.45,
    specialties: ["protocol wiring", "tooling sprint", "feature release"]
  },
  {
    id: "deployment-hangar",
    label: "Deployment Hangar",
    tileX: 34,
    tileY: 10,
    domain: "Builders",
    color: 0x42c6ff,
    baseReward: 6,
    chainChance: 0.5,
    specialties: ["latency tuning", "runtime validation", "indexer patch"]
  },
  {
    id: "degen-war-room",
    label: "Degen War Room",
    tileX: 47,
    tileY: 8,
    domain: "Degens",
    color: 0xffd15a,
    baseReward: 7,
    chainChance: 0.42,
    specialties: ["narrative scans", "momentum sweeps", "orderbook timing"]
  },
  {
    id: "signal-pit",
    label: "Signal Pit",
    tileX: 42,
    tileY: 10,
    domain: "Degens",
    color: 0xffd15a,
    baseReward: 5,
    chainChance: 0.38,
    specialties: ["sentiment mining", "risk overlays", "pair rotation"]
  },
  {
    id: "commons-library",
    label: "Commons Library",
    tileX: 20,
    tileY: 22,
    domain: "Shared",
    color: 0x8be9b5,
    baseReward: 4,
    chainChance: 0.28,
    specialties: ["strategy review", "knowledge transfer", "mentor sync"]
  },
  {
    id: "forum-hall",
    label: "Forum Hall",
    tileX: 30,
    tileY: 22,
    domain: "Shared",
    color: 0x8be9b5,
    baseReward: 4,
    chainChance: 0.26,
    specialties: ["demo rehearsal", "house briefing", "mission planning"]
  },
  {
    id: "treasury-altar",
    label: "Treasury Altar",
    tileX: 40,
    tileY: 28,
    domain: "Shared",
    color: 0xb9e2ff,
    baseReward: 8,
    chainChance: 0.64,
    specialties: ["$VVV treasury action", "on-chain settlement", "multi-sig drill"]
  }
];

const HOUSE_ORDER: HouseId[] = ["Creators", "Builders", "Degens"];

const AGENT_ROSTER: Record<HouseId, string[]> = {
  Creators: ["Lyra", "Mosaic", "Scribe"],
  Builders: ["Hex", "Patch", "Circuit"],
  Degens: ["Nova", "Ticker", "Rook"]
};

const AGENT_SPAWNS: Record<HouseId, Array<{ x: number; y: number }>> = {
  Creators: [
    { x: 8, y: 14 },
    { x: 10, y: 15 },
    { x: 12, y: 14 }
  ],
  Builders: [
    { x: 27, y: 14 },
    { x: 29, y: 15 },
    { x: 31, y: 14 }
  ],
  Degens: [
    { x: 45, y: 14 },
    { x: 47, y: 15 },
    { x: 49, y: 14 }
  ]
};

export default class AcademyScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private playerGlow!: Phaser.GameObjects.Arc;
  private connectionLines!: Phaser.GameObjects.Graphics;
  private interactionHint!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys!: Record<"W" | "A" | "S" | "D" | "E" | "SHIFT", Phaser.Input.Keyboard.Key>;
  private readonly playerVelocity = new Phaser.Math.Vector2();
  private readonly rng = new Phaser.Math.RandomDataGenerator([`${Date.now()}`]);
  private readonly stationShapes = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly agents: AgentRuntime[] = [];
  private readonly chainActions: ChainAction[] = [];
  private readonly houseScores: Record<HouseId, { points: number; influence: number }> = {
    Creators: { points: 20, influence: 1 },
    Builders: { points: 20, influence: 1 },
    Degens: { points: 20, influence: 1 }
  };
  private nearbyStation: StationDefinition | null = null;
  private simAccumulator = 0;
  private lastSnapshotAt = 0;
  private lastTransportAt = 0;
  private lastProximityCount = -1;
  private phaseIndex = 0;
  private semesterDay = 1;
  private phaseEndsAt = 0;
  private chainNonce = 0;
  private chainHead = 409812;
  private eventCounter = 0;
  private connectedPeers = 0;
  private onlineUsers = 146;

  constructor() {
    super("AcademyScene");
  }

  create(): void {
    this.drawCampus();
    this.createStations();
    this.createPlayer();
    this.createAgents();
    this.configureCamera();
    this.bindInput();
    this.createOverlay();

    this.phaseEndsAt = this.time.now + PHASES[0].durationMs;

    this.log("info", "Semester stream initialized. Agents are enrolling.");
    this.publishSnapshot(this.time.now);
    this.emitTransport(this.time.now);
  }

  update(_time: number, delta: number): void {
    this.updatePlayer(delta);
    this.syncAgentLabels();
    this.updateNearbyStation();

    if (Phaser.Input.Keyboard.JustDown(this.moveKeys.E) && this.nearbyStation) {
      this.handlePlayerInteraction(this.nearbyStation);
    }

    this.simAccumulator += delta;
    while (this.simAccumulator >= SIM_STEP_MS) {
      this.simulateStep();
      this.simAccumulator -= SIM_STEP_MS;
    }

    const now = this.time.now;
    if (now - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.publishSnapshot(now);
      this.lastSnapshotAt = now;
    }
  }

  private drawCampus(): void {
    const worldWidth = WORLD_TILES_X * TILE_SIZE;
    const worldHeight = WORLD_TILES_Y * TILE_SIZE;

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x0f1724, 0x0f1724, 0x101d31, 0x101d31, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);

    graphics.fillStyle(0x111f2f, 0.8);
    graphics.fillRect(5 * TILE_SIZE, 5 * TILE_SIZE, 12 * TILE_SIZE, 8 * TILE_SIZE);
    graphics.fillRect(24 * TILE_SIZE, 5 * TILE_SIZE, 12 * TILE_SIZE, 8 * TILE_SIZE);
    graphics.fillRect(40 * TILE_SIZE, 5 * TILE_SIZE, 12 * TILE_SIZE, 8 * TILE_SIZE);

    graphics.fillStyle(0x13283a, 0.6);
    graphics.fillRect(17 * TILE_SIZE, 19 * TILE_SIZE, 20 * TILE_SIZE, 11 * TILE_SIZE);
    graphics.fillRect(39 * TILE_SIZE, 23 * TILE_SIZE, 10 * TILE_SIZE, 7 * TILE_SIZE);

    graphics.lineStyle(1, 0x253a52, 0.35);
    for (let tileX = 0; tileX <= WORLD_TILES_X; tileX += 1) {
      const x = tileX * TILE_SIZE;
      graphics.lineBetween(x, 0, x, worldHeight);
    }

    for (let tileY = 0; tileY <= WORLD_TILES_Y; tileY += 1) {
      const y = tileY * TILE_SIZE;
      graphics.lineBetween(0, y, worldWidth, y);
    }

    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "13px",
      color: "#a0bddf"
    };

    this.add.text(6.2 * TILE_SIZE, 5.6 * TILE_SIZE, "CREATORS WING", labelStyle).setAlpha(0.88);
    this.add.text(25.3 * TILE_SIZE, 5.6 * TILE_SIZE, "BUILDERS WING", labelStyle).setAlpha(0.88);
    this.add.text(41.5 * TILE_SIZE, 5.6 * TILE_SIZE, "DEGENS WING", labelStyle).setAlpha(0.88);
    this.add.text(20.2 * TILE_SIZE, 19.6 * TILE_SIZE, "COMMONS", labelStyle).setAlpha(0.88);
    this.add.text(39.5 * TILE_SIZE, 23.4 * TILE_SIZE, "TREASURY", labelStyle).setAlpha(0.88);
  }

  private createStations(): void {
    for (const station of STATIONS) {
      const center = this.tileToWorld(station.tileX, station.tileY);

      const shape = this.add
        .rectangle(center.x, center.y, TILE_SIZE * 2.3, TILE_SIZE * 1.35, station.color, 0.28)
        .setStrokeStyle(2, station.color, 0.65)
        .setDepth(5);

      const label = this.add
        .text(center.x, center.y - 24, station.label, {
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          color: "#d6e4ff",
          align: "center"
        })
        .setOrigin(0.5)
        .setAlpha(0.95)
        .setDepth(6);

      label.setShadow(0, 1, "#040a10", 2, false, true);
      this.stationShapes.set(station.id, shape);
    }
  }

  private createPlayer(): void {
    const spawn = this.tileToWorld(28, 17);

    this.playerGlow = this.add
      .circle(spawn.x, spawn.y, PROXIMITY_RADIUS, 0x87d7ff, 0.04)
      .setStrokeStyle(2, 0x87d7ff, 0.24)
      .setDepth(7);

    this.connectionLines = this.add.graphics().setDepth(8);

    this.player = this.add.circle(spawn.x, spawn.y, 11, 0xeef5ff, 1).setStrokeStyle(2, 0x3167a0, 0.95).setDepth(14);

    this.add
      .text(spawn.x, spawn.y + 14, "You", {
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "11px",
        color: "#eff7ff"
      })
      .setOrigin(0.5, 0)
      .setDepth(15)
      .setDataEnabled()
      .setData("followsPlayer", true);
  }

  private createAgents(): void {
    for (const house of HOUSE_ORDER) {
      const names = AGENT_ROSTER[house];
      const spawns = AGENT_SPAWNS[house];

      names.forEach((name, index) => {
        const spawn = spawns[index];
        const center = this.tileToWorld(spawn.x, spawn.y);
        const sprite = this.add.circle(center.x, center.y, 9, HOUSE_COLORS[house], 0.96).setStrokeStyle(2, 0x08121d, 0.8).setDepth(11);
        const label = this.add
          .text(center.x, center.y + 12, name, {
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            color: "#cad9f4"
          })
          .setOrigin(0.5, 0)
          .setDepth(12);

        this.agents.push({
          id: `${house.toLowerCase()}-${index}`,
          name,
          house,
          sprite,
          label,
          state: "idle",
          focus: "Awaiting assignment",
          tileX: spawn.x,
          tileY: spawn.y,
          route: [],
          nextDecisionAt: this.time.now + this.rng.between(300, 1800),
          workEndsAt: 0,
          momentum: this.rng.between(40, 70)
        });
      });
    }
  }

  private configureCamera(): void {
    const worldWidth = WORLD_TILES_X * TILE_SIZE;
    const worldHeight = WORLD_TILES_Y * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.08);
  }

  private bindInput(): void {
    if (!this.input.keyboard) {
      throw new Error("Keyboard plugin unavailable.");
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.moveKeys = this.input.keyboard.addKeys("W,A,S,D,E,SHIFT") as Record<
      "W" | "A" | "S" | "D" | "E" | "SHIFT",
      Phaser.Input.Keyboard.Key
    >;
  }

  private createOverlay(): void {
    this.interactionHint = this.add
      .text(18, this.scale.height - 26, "Move near a station to trigger actions.", {
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "13px",
        color: "#c7dcff"
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.interactionHint.setY(gameSize.height - 26);
    });
  }

  private simulateStep(): void {
    const now = this.time.now;

    this.updateSemester(now);
    this.updateAgents(now);
    this.updateChainActions(now);
    this.updateProximityLinks();

    if (this.rng.frac() < 0.35) {
      this.onlineUsers = Phaser.Math.Clamp(this.onlineUsers + this.rng.between(-2, 3), 92, 260);
    }

    if (now - this.lastTransportAt >= TRANSPORT_INTERVAL_MS) {
      this.emitTransport(now);
      this.lastTransportAt = now;
    }
  }

  private updatePlayer(delta: number): void {
    const left = this.cursors.left.isDown || this.moveKeys.A.isDown;
    const right = this.cursors.right.isDown || this.moveKeys.D.isDown;
    const up = this.cursors.up.isDown || this.moveKeys.W.isDown;
    const down = this.cursors.down.isDown || this.moveKeys.S.isDown;
    const sprint = this.moveKeys.SHIFT.isDown ? 1.35 : 1;

    let intentX = Number(right) - Number(left);
    let intentY = Number(down) - Number(up);

    if (intentX !== 0 || intentY !== 0) {
      const len = Math.hypot(intentX, intentY);
      intentX /= len;
      intentY /= len;
      const topSpeed = 194 * sprint;
      this.playerVelocity.x = Phaser.Math.Linear(this.playerVelocity.x, intentX * topSpeed, 0.24);
      this.playerVelocity.y = Phaser.Math.Linear(this.playerVelocity.y, intentY * topSpeed, 0.24);
    } else {
      this.playerVelocity.scale(0.82);
      if (this.playerVelocity.lengthSq() < 6) {
        this.playerVelocity.set(0, 0);
      }
    }

    const worldWidth = WORLD_TILES_X * TILE_SIZE;
    const worldHeight = WORLD_TILES_Y * TILE_SIZE;
    const radius = this.player.radius;

    const nextX = Phaser.Math.Clamp(this.player.x + this.playerVelocity.x * (delta / 1000), radius, worldWidth - radius);
    const nextY = Phaser.Math.Clamp(this.player.y + this.playerVelocity.y * (delta / 1000), radius, worldHeight - radius);

    this.player.setPosition(nextX, nextY);
    this.playerGlow.setPosition(nextX, nextY);
    this.player.setScale(1 + Math.min(0.18, this.playerVelocity.length() / 340));

    const playerLabel = this.children.getAll().find((child) => child.getData("followsPlayer")) as Phaser.GameObjects.Text | undefined;
    if (playerLabel) {
      playerLabel.setPosition(nextX, nextY + 14);
    }
  }

  private updateNearbyStation(): void {
    const nearest = STATIONS
      .map((station) => ({
        station,
        distance: Phaser.Math.Distance.Between(this.player.x, this.player.y, this.tileToWorld(station.tileX, station.tileY).x, this.tileToWorld(station.tileX, station.tileY).y)
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    this.nearbyStation = nearest && nearest.distance <= 74 ? nearest.station : null;

    for (const station of STATIONS) {
      const shape = this.stationShapes.get(station.id);
      if (!shape) {
        continue;
      }

      const active = this.nearbyStation?.id === station.id;
      shape.setFillStyle(station.color, active ? 0.58 : 0.28);
      shape.setStrokeStyle(active ? 3 : 2, station.color, active ? 1 : 0.65);
    }

    if (this.nearbyStation) {
      this.interactionHint.setText(`[E] Interact with ${this.nearbyStation.label}`);
    } else {
      this.interactionHint.setText("Move near a station to trigger actions.");
    }
  }

  private handlePlayerInteraction(station: StationDefinition): void {
    const now = this.time.now;

    if (station.domain === "Shared") {
      for (const house of HOUSE_ORDER) {
        this.houseScores[house].points += 2;
      }
      this.enqueueChainAction("You", null, `${station.label}: shared catalyst`, station.baseReward + 2, now);
    } else {
      this.houseScores[station.domain].points += 6;
      this.enqueueChainAction("You", station.domain, `${station.label}: direct command`, station.baseReward + 3, now);
    }

    const shape = this.stationShapes.get(station.id);
    if (shape) {
      this.tweens.add({
        targets: shape,
        alpha: 0.35,
        yoyo: true,
        duration: 90,
        repeat: 2
      });
    }

    this.log("success", `Manual action triggered at ${station.label}.`);
  }

  private updateSemester(now: number): void {
    if (now < this.phaseEndsAt) {
      return;
    }

    this.phaseIndex += 1;
    if (this.phaseIndex >= PHASES.length) {
      this.phaseIndex = 0;
      this.semesterDay += 1;
      this.log("success", `Semester day ${this.semesterDay} unlocked.`);
    }

    const phase = PHASES[this.phaseIndex];
    this.phaseEndsAt = now + phase.durationMs;

    this.log("info", `Phase shift: ${phase.label}. Agent priorities updated.`);

    for (const agent of this.agents) {
      if (agent.state === "idle") {
        agent.nextDecisionAt = Math.min(agent.nextDecisionAt, now + this.rng.between(160, 800));
      }
    }
  }

  private updateAgents(now: number): void {
    for (const agent of this.agents) {
      if (agent.state === "idle" && now >= agent.nextDecisionAt) {
        this.assignTask(agent, now);
        continue;
      }

      if (agent.state === "working" && now >= agent.workEndsAt) {
        this.completeTask(agent, now);
      }
    }
  }

  private assignTask(agent: AgentRuntime, now: number): void {
    const station = this.pickStationForAgent(agent);
    agent.activeStation = station;
    agent.focus = this.sample(station.specialties);
    agent.route = this.buildRoute(agent.tileX, agent.tileY, station.tileX, station.tileY);
    agent.state = "moving";

    if (this.rng.frac() < 0.35) {
      this.log("info", `${agent.name} routed to ${station.label} for ${agent.focus}.`);
    }

    this.advanceAgentMovement(agent, now);
  }

  private advanceAgentMovement(agent: AgentRuntime, now: number): void {
    if (agent.state !== "moving") {
      return;
    }

    const next = agent.route.shift();
    if (!next) {
      this.startTask(agent, now);
      return;
    }

    const target = this.tileToWorld(next.x, next.y);
    const duration = Phaser.Math.Clamp(220 - agent.momentum, 120, 220);

    agent.moveTween?.stop();
    agent.moveTween = this.tweens.add({
      targets: agent.sprite,
      x: target.x,
      y: target.y,
      duration,
      ease: "Sine.Out",
      onComplete: () => {
        agent.tileX = next.x;
        agent.tileY = next.y;
        this.advanceAgentMovement(agent, this.time.now);
      }
    });
  }

  private startTask(agent: AgentRuntime, now: number): void {
    agent.state = "working";
    const taskDuration = this.rng.between(2300, 5200) - Math.floor(agent.momentum * 8);
    agent.workEndsAt = now + Math.max(1450, taskDuration);
    agent.moveTween = undefined;

    agent.pulseTween?.stop();
    agent.pulseTween = this.tweens.add({
      targets: agent.sprite,
      scale: 1.26,
      yoyo: true,
      duration: 290,
      repeat: -1,
      ease: "Sine.InOut"
    });
  }

  private completeTask(agent: AgentRuntime, now: number): void {
    agent.pulseTween?.stop();
    agent.pulseTween = undefined;
    agent.sprite.setScale(1);

    const station = agent.activeStation;
    const phaseBonus = this.phaseIndex + 1;
    const baseReward = station ? station.baseReward : 3;
    const reward = baseReward + this.rng.between(1, 4) + phaseBonus;

    this.houseScores[agent.house].points += reward;
    this.houseScores[agent.house].influence = Number((this.houseScores[agent.house].points / (18 + this.semesterDay * 3)).toFixed(2));
    agent.momentum = Phaser.Math.Clamp(agent.momentum + this.rng.between(2, 8), 25, 100);

    if (station && this.rng.frac() <= station.chainChance) {
      this.enqueueChainAction(agent.name, agent.house, `${station.label}: ${agent.focus}`, Math.ceil(reward / 2), now);
    }

    if (this.rng.frac() < 0.25) {
      this.log("success", `${agent.name} shipped ${agent.focus} (+${reward} ${agent.house}).`);
    }

    agent.state = "idle";
    agent.focus = "Awaiting assignment";
    agent.activeStation = undefined;
    agent.nextDecisionAt = now + this.rng.between(900, 2400);
  }

  private pickStationForAgent(agent: AgentRuntime): StationDefinition {
    const ownStations = STATIONS.filter((station) => station.domain === agent.house);
    const sharedStations = STATIONS.filter((station) => station.domain === "Shared");
    const externalStations = STATIONS.filter((station) => station.domain !== "Shared" && station.domain !== agent.house);

    const phase = PHASES[this.phaseIndex];
    let candidates: StationDefinition[];

    switch (phase.id) {
      case "enrollment":
        candidates = [...sharedStations, ...ownStations];
        break;
      case "workshops":
        candidates = this.rng.frac() < 0.8 ? ownStations : [...ownStations, ...sharedStations];
        break;
      case "collab":
        candidates = [...sharedStations, ...externalStations];
        break;
      case "finals":
        candidates = [...ownStations, ...sharedStations.filter((station) => station.id === "treasury-altar")];
        break;
      default:
        candidates = STATIONS;
        break;
    }

    if (candidates.length === 0) {
      return this.sample(STATIONS);
    }

    return this.sample(candidates);
  }

  private buildRoute(fromX: number, fromY: number, toX: number, toY: number): Phaser.Math.Vector2[] {
    const route: Phaser.Math.Vector2[] = [];
    let currentX = fromX;
    let currentY = fromY;
    const horizontalFirst = this.rng.frac() >= 0.35;

    if (horizontalFirst) {
      while (currentX !== toX) {
        currentX += Math.sign(toX - currentX);
        route.push(new Phaser.Math.Vector2(currentX, currentY));
      }
      while (currentY !== toY) {
        currentY += Math.sign(toY - currentY);
        route.push(new Phaser.Math.Vector2(currentX, currentY));
      }
    } else {
      while (currentY !== toY) {
        currentY += Math.sign(toY - currentY);
        route.push(new Phaser.Math.Vector2(currentX, currentY));
      }
      while (currentX !== toX) {
        currentX += Math.sign(toX - currentX);
        route.push(new Phaser.Math.Vector2(currentX, currentY));
      }
    }

    return route;
  }

  private enqueueChainAction(actor: string, house: HouseId | null, label: string, reward: number, now: number): void {
    this.chainActions.unshift({
      id: `tx-${++this.chainNonce}`,
      actor,
      house,
      label,
      status: "Queued",
      nextAt: now + this.rng.between(650, 1300),
      expiresAt: now + 12000,
      reward
    });

    if (this.chainActions.length > 14) {
      this.chainActions.length = 14;
    }
  }

  private updateChainActions(now: number): void {
    for (const action of this.chainActions) {
      if (now < action.nextAt) {
        continue;
      }

      if (action.status === "Queued") {
        action.status = "Signing";
        action.nextAt = now + this.rng.between(650, 900);
        continue;
      }

      if (action.status === "Signing") {
        action.status = "Broadcast";
        action.nextAt = now + this.rng.between(850, 1200);
        continue;
      }

      if (action.status === "Broadcast") {
        const successRate = action.actor === "You" ? 0.93 : 0.84;
        const success = this.rng.frac() <= successRate;
        action.status = success ? "Confirmed" : "Failed";
        action.nextAt = now + 2600;
        action.expiresAt = now + 4200;

        if (success) {
          this.chainHead += 1;
          if (action.house) {
            this.houseScores[action.house].points += action.reward;
          } else {
            const split = Math.max(1, Math.floor(action.reward / HOUSE_ORDER.length));
            for (const house of HOUSE_ORDER) {
              this.houseScores[house].points += split;
            }
          }
          this.log("success", `${action.label} confirmed on-chain (+${action.reward}).`);
        } else {
          this.log("warn", `${action.label} reverted after mempool conflict.`);
        }
      }
    }

    for (const house of HOUSE_ORDER) {
      this.houseScores[house].influence = Number((this.houseScores[house].points / (18 + this.semesterDay * 3)).toFixed(2));
    }

    const retained = this.chainActions.filter((action) => {
      const terminal = action.status === "Confirmed" || action.status === "Failed";
      return !(terminal && now >= action.expiresAt);
    });

    this.chainActions.length = 0;
    this.chainActions.push(...retained);
  }

  private updateProximityLinks(): void {
    const nearAgents = this.agents.filter(
      (agent) => Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, this.player.x, this.player.y) <= PROXIMITY_RADIUS
    );

    this.connectedPeers = nearAgents.length;

    this.connectionLines.clear();
    if (nearAgents.length > 0) {
      this.connectionLines.lineStyle(1, 0x8ed9ff, 0.55);
      for (const agent of nearAgents) {
        this.connectionLines.lineBetween(this.player.x, this.player.y, agent.sprite.x, agent.sprite.y);
      }
      this.connectionLines.strokePath();
    }

    if (this.connectedPeers !== this.lastProximityCount) {
      if (this.lastProximityCount === 0 && this.connectedPeers > 0) {
        this.log("info", `Proximity channel opened with ${this.connectedPeers} agent(s).`);
      }
      if (this.lastProximityCount > 0 && this.connectedPeers === 0) {
        this.log("warn", "Proximity channel idle. Move closer to active agents.");
      }
      this.lastProximityCount = this.connectedPeers;
    }
  }

  private syncAgentLabels(): void {
    for (const agent of this.agents) {
      agent.label.setPosition(agent.sprite.x, agent.sprite.y + 12);
      agent.label.setColor(agent.state === "working" ? "#fff6c7" : "#cad9f4");
    }
  }

  private publishSnapshot(now: number): void {
    const phase = PHASES[this.phaseIndex];
    const phaseRemainingMs = Math.max(0, this.phaseEndsAt - now);
    const progress = Phaser.Math.Clamp(1 - phaseRemainingMs / phase.durationMs, 0, 1);

    const houses: HouseSnapshot[] = HOUSE_ORDER.map((house) => ({
      house,
      points: this.houseScores[house].points,
      activeAgents: this.agents.filter((agent) => agent.house === house && agent.state !== "idle").length,
      influence: this.houseScores[house].influence
    }));

    const agents: AgentSnapshot[] = [...this.agents]
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, 9)
      .map((agent) => ({
        name: agent.name,
        house: agent.house,
        state: this.agentStateLabel(agent.state),
        focus: agent.focus,
        momentum: agent.momentum
      }));

    const chain: ChainSnapshot[] = this.chainActions.slice(0, 7).map((action) => ({
      id: action.id,
      actor: action.actor,
      label: action.label,
      status: action.status,
      etaSeconds: Math.max(0, Math.ceil((action.nextAt - now) / 1000))
    }));

    const snapshot: PrototypeSnapshot = {
      generatedAt: now,
      houses,
      semester: {
        day: this.semesterDay,
        phase: phase.label,
        progress,
        secondsToNextPhase: Math.max(0, Math.ceil(phaseRemainingMs / 1000))
      },
      agents,
      chain,
      proximityLinks: this.connectedPeers,
      onlineUsers: this.onlineUsers
    };

    prototypeBus.emitSnapshot(snapshot);
  }

  private emitTransport(now: number): void {
    const latencyBase = this.connectedPeers > 0 ? 42 : 59;
    prototypeBus.emitTransport({
      mode: this.connectedPeers > 0 ? "Proximity mesh active" : "Proximity mesh standby",
      latencyMs: latencyBase + this.rng.between(0, 21),
      chainHead: this.chainHead + Math.floor(now / 1000) % 3
    });
  }

  private tileToWorld(tileX: number, tileY: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
  }

  private sample<T>(items: T[]): T {
    return items[this.rng.between(0, items.length - 1)];
  }

  private agentStateLabel(state: AgentRuntime["state"]): AgentStateLabel {
    if (state === "moving") {
      return "Traveling";
    }
    if (state === "working") {
      return "Working";
    }
    return "Idle";
  }

  private log(level: "info" | "success" | "warn", message: string): void {
    this.eventCounter += 1;
    prototypeBus.emitLog({
      id: this.eventCounter,
      level,
      message,
      timestamp: toClock(Date.now())
    });
  }
}
