import "./style.css";
import {
  prototypeBus,
  type AgentSnapshot,
  type ChainSnapshot,
  type HouseSnapshot,
  type LogEntry,
  type PrototypeSnapshot
} from "./game/prototypeBus";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element as T;
}

const runtimeStatus = byId<HTMLElement>("runtime-status");
const transportStatus = byId<HTMLElement>("transport-status");
const phaseChip = byId<HTMLElement>("phase-chip");
const semesterDay = byId<HTMLElement>("semester-day");
const phaseProgress = byId<HTMLElement>("phase-progress");
const nextPhase = byId<HTMLElement>("next-phase");
const proximityLinks = byId<HTMLElement>("proximity-links");
const onlineUsers = byId<HTMLElement>("online-users");
const houseScores = byId<HTMLUListElement>("house-scores");
const activeAgents = byId<HTMLUListElement>("active-agents");
const chainQueue = byId<HTMLUListElement>("chain-queue");
const eventFeed = byId<HTMLUListElement>("event-feed");

function renderHouseScores(houses: HouseSnapshot[]): void {
  houseScores.innerHTML = houses
    .map((house) => {
      return `<li>
        <span class="key">${house.house}</span>
        <span class="value">${house.points} pts</span>
        <span class="meta">${house.activeAgents} active / influence ${house.influence.toFixed(2)}</span>
      </li>`;
    })
    .join("");
}

function renderAgents(agents: AgentSnapshot[]): void {
  activeAgents.innerHTML = agents
    .map((agent) => {
      return `<li>
        <span class="key">${agent.name} <em>${agent.house}</em></span>
        <span class="value">${agent.state}</span>
        <span class="meta">${agent.focus} • momentum ${agent.momentum}</span>
      </li>`;
    })
    .join("");
}

function renderChain(chain: ChainSnapshot[]): void {
  if (chain.length === 0) {
    chainQueue.innerHTML = `<li><span class="key">No pending actions</span><span class="meta">Queue is empty</span></li>`;
    return;
  }

  chainQueue.innerHTML = chain
    .map((action) => {
      return `<li>
        <span class="key">${action.actor} • ${action.status}</span>
        <span class="value">${action.id}</span>
        <span class="meta">${action.label} • eta ${action.etaSeconds}s</span>
      </li>`;
    })
    .join("");
}

function addFeedEntry(entry: LogEntry): void {
  const li = document.createElement("li");
  li.className = `level-${entry.level}`;
  li.innerHTML = `<span class="time">${entry.timestamp}</span><span class="msg">${entry.message}</span>`;
  eventFeed.prepend(li);

  while (eventFeed.children.length > 20) {
    const last = eventFeed.lastElementChild;
    if (!last) {
      break;
    }
    eventFeed.removeChild(last);
  }
}

function renderSnapshot(snapshot: PrototypeSnapshot): void {
  renderHouseScores(snapshot.houses);
  renderAgents(snapshot.agents);
  renderChain(snapshot.chain);

  semesterDay.textContent = `${snapshot.semester.day}`;
  phaseChip.textContent = `${snapshot.semester.phase}`;
  phaseProgress.textContent = `${Math.round(snapshot.semester.progress * 100)}%`;
  nextPhase.textContent = `${snapshot.semester.secondsToNextPhase}s`;
  proximityLinks.textContent = `${snapshot.proximityLinks}`;
  onlineUsers.textContent = `${snapshot.onlineUsers}`;
}

prototypeBus.onSnapshot(renderSnapshot);
prototypeBus.onLog(addFeedEntry);
prototypeBus.onTransport((status) => {
  transportStatus.textContent = `${status.mode} • ${status.latencyMs}ms • block ${status.chainHead}`;
});

async function bootstrap(): Promise<void> {
  runtimeStatus.textContent = "Loading Phaser runtime...";

  try {
    const [{ default: Phaser }, { default: AcademyScene }] = await Promise.all([import("phaser"), import("./game/AcademyScene")]);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: "app",
      backgroundColor: "#0f1522",
      render: {
        antialias: true,
        roundPixels: true,
        powerPreference: "high-performance"
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
      },
      scene: [new AcademyScene()]
    };

    new Phaser.Game(config);
    runtimeStatus.textContent = "Runtime live";
  } catch (error) {
    runtimeStatus.textContent = "Boot failed";
    addFeedEntry({
      id: -1,
      level: "warn",
      message: `Boot error: ${(error as Error).message}`,
      timestamp: new Date().toLocaleTimeString()
    });
    throw error;
  }
}

bootstrap();
