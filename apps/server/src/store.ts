import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldRecord } from '@novapouch/game-core';

export interface StoredWorld extends WorldRecord {
  /** 참여 기기 토큰의 해시. "내 세계"와 접근 권한에 쓴다 */
  memberKeys: string[];
}

export interface Report {
  at: number;
  roomCode: string;
  contributionId: string;
  text: string;
  targetKey: string | null;
  reporterKey: string;
  reason: string;
  detail: string;
}

export interface GameEventLog {
  at: number;
  roomCode: string;
  gameNo: number;
  type: string;
  playerKey: string | null;
  data?: Record<string, unknown>;
}

export const deviceKey = (token: string) => createHash('sha256').update(`novapouch:${token}`).digest('hex').slice(0, 32);

/**
 * 내부 테스트용 파일 저장소. 세계·차단은 JSON, 신고·이벤트는 JSON Lines로 남긴다.
 * 운영 규모가 커지면 같은 메서드를 PostgreSQL 구현으로 바꾼다.
 */
export class FileStore {
  private worlds: StoredWorld[];
  private blocks: Record<string, string[]>;

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    this.worlds = this.readJson('worlds.json', []);
    this.blocks = this.readJson('blocks.json', {});
  }

  saveWorld(world: StoredWorld) {
    this.worlds.push(world);
    this.writeJson('worlds.json', this.worlds);
  }

  getWorld(id: string): StoredWorld | undefined {
    return this.worlds.find((w) => w.id === id);
  }

  worldsOf(key: string): StoredWorld[] {
    return this.worlds.filter((w) => w.memberKeys.includes(key)).sort((a, b) => b.createdAt - a.createdAt);
  }

  allWorlds(): StoredWorld[] {
    return this.worlds;
  }

  /** 같은 사물 토큰으로 만들어진 세계의 다음 번호 */
  nextSerial(objectId: string): number {
    return this.worlds.filter((w) => w.objectId === objectId).length + 1;
  }

  addReport(report: Report) {
    appendFileSync(join(this.dir, 'reports.jsonl'), `${JSON.stringify(report)}\n`);
  }

  reports(): Report[] {
    return this.readLines('reports.jsonl');
  }

  addBlock(blocker: string, blocked: string) {
    const list = new Set(this.blocks[blocker] ?? []);
    list.add(blocked);
    this.blocks[blocker] = [...list];
    this.writeJson('blocks.json', this.blocks);
  }

  blockedBy(blocker: string): Set<string> {
    return new Set(this.blocks[blocker] ?? []);
  }

  logEvent(e: GameEventLog) {
    appendFileSync(join(this.dir, 'events.jsonl'), `${JSON.stringify(e)}\n`);
  }

  events(): GameEventLog[] {
    return this.readLines('events.jsonl');
  }

  private readJson<T>(name: string, fallback: T): T {
    const p = join(this.dir, name);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
  }

  private writeJson(name: string, data: unknown) {
    const p = join(this.dir, name);
    writeFileSync(`${p}.tmp`, JSON.stringify(data));
    renameSync(`${p}.tmp`, p);
  }

  private readLines<T>(name: string): T[] {
    const p = join(this.dir, name);
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  }
}
