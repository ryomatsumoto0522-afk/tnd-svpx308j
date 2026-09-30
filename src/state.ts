import fs from "node:fs";
import path from "node:path";
import type { DigestDay } from "./types.ts";

export interface State {
  /** 前回の正常終了時刻（ISO） */
  lastRun: string | null;
  /** 掲載済み URL → 掲載日（YYYY-MM-DD） */
  seen: Record<string, string>;
}

export function loadState(dataDir: string): State {
  const file = path.join(dataDir, "state.json");
  if (!fs.existsSync(file)) return { lastRun: null, seen: {} };
  return JSON.parse(fs.readFileSync(file, "utf8")) as State;
}

export function saveState(dataDir: string, state: State): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

/** 保持期間を過ぎた掲載済み URL を捨てる */
export function pruneSeen(seen: Record<string, string>, today: string, retentionDays: number): Record<string, string> {
  const limit = new Date(today).getTime() - retentionDays * 86_400_000;
  return Object.fromEntries(Object.entries(seen).filter(([, d]) => new Date(d).getTime() >= limit));
}

export function saveDay(dataDir: string, day: DigestDay): void {
  const dir = path.join(dataDir, "days");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${day.date}.json`), JSON.stringify(day, null, 2) + "\n");
}

export function loadAllDays(dataDir: string): DigestDay[] {
  const dir = path.join(dataDir, "days");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as DigestDay);
}
