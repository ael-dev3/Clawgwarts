export type HouseId = "Creators" | "Builders" | "Degens";
export type AgentStateLabel = "Idle" | "Traveling" | "Working";
export type ChainStatus = "Queued" | "Signing" | "Broadcast" | "Confirmed" | "Failed";

export interface HouseSnapshot {
  house: HouseId;
  points: number;
  activeAgents: number;
  influence: number;
}

export interface SemesterSnapshot {
  day: number;
  phase: string;
  progress: number;
  secondsToNextPhase: number;
}

export interface AgentSnapshot {
  name: string;
  house: HouseId;
  state: AgentStateLabel;
  focus: string;
  momentum: number;
}

export interface ChainSnapshot {
  id: string;
  actor: string;
  label: string;
  status: ChainStatus;
  etaSeconds: number;
}

export interface PrototypeSnapshot {
  generatedAt: number;
  houses: HouseSnapshot[];
  semester: SemesterSnapshot;
  agents: AgentSnapshot[];
  chain: ChainSnapshot[];
  proximityLinks: number;
  onlineUsers: number;
}

export interface LogEntry {
  id: number;
  level: "info" | "success" | "warn";
  message: string;
  timestamp: string;
}

export interface TransportStatus {
  mode: string;
  latencyMs: number;
  chainHead: number;
}

type Listener<T> = (payload: T) => void;

class PrototypeBus {
  private readonly target = new EventTarget();

  private emit<T>(eventName: string, payload: T): void {
    this.target.dispatchEvent(new CustomEvent<T>(eventName, { detail: payload }));
  }

  private on<T>(eventName: string, listener: Listener<T>): () => void {
    const wrapped: EventListener = (event) => {
      listener((event as CustomEvent<T>).detail);
    };

    this.target.addEventListener(eventName, wrapped);
    return () => this.target.removeEventListener(eventName, wrapped);
  }

  emitSnapshot(payload: PrototypeSnapshot): void {
    this.emit("snapshot", payload);
  }

  emitLog(payload: LogEntry): void {
    this.emit("log", payload);
  }

  emitTransport(payload: TransportStatus): void {
    this.emit("transport", payload);
  }

  onSnapshot(listener: Listener<PrototypeSnapshot>): () => void {
    return this.on("snapshot", listener);
  }

  onLog(listener: Listener<LogEntry>): () => void {
    return this.on("log", listener);
  }

  onTransport(listener: Listener<TransportStatus>): () => void {
    return this.on("transport", listener);
  }
}

export const prototypeBus = new PrototypeBus();

export function toClock(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
