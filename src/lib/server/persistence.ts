import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Decision, PendingWrite } from '$lib/types';

const DATA_DIR = path.resolve('data');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');
const PENDING_DIR = path.join(DATA_DIR, 'pending-writes');
const COMPLETED_DIR = path.join(DATA_DIR, 'completed-writes');

export async function ensureDataDirs(): Promise<void> {
	for (const dir of [DATA_DIR, PENDING_DIR, COMPLETED_DIR]) {
		if (!existsSync(dir)) {
			await mkdir(dir, { recursive: true });
		}
	}
}

// --- Decisions ---

export async function loadDecisions(): Promise<Decision[]> {
	await ensureDataDirs();
	if (!existsSync(DECISIONS_FILE)) return [];
	const raw = await readFile(DECISIONS_FILE, 'utf-8');
	return JSON.parse(raw);
}

export async function saveDecision(decision: Decision): Promise<void> {
	await ensureDataDirs();
	const decisions = await loadDecisions();
	const idx = decisions.findIndex((d) => d.bggId === decision.bggId);
	if (idx >= 0) {
		decisions[idx] = decision;
	} else {
		decisions.push(decision);
	}
	// Atomic write: temp file then rename
	const tmp = DECISIONS_FILE + '.tmp';
	await writeFile(tmp, JSON.stringify(decisions, null, '\t'), 'utf-8');
	await rename(tmp, DECISIONS_FILE);
}

export async function deleteDecision(bggId: number): Promise<void> {
	await ensureDataDirs();
	const decisions = await loadDecisions();
	const filtered = decisions.filter((d) => d.bggId !== bggId);
	const tmp = DECISIONS_FILE + '.tmp';
	await writeFile(tmp, JSON.stringify(filtered, null, '\t'), 'utf-8');
	await rename(tmp, DECISIONS_FILE);
}

// --- Write Queue ---

export async function createPendingWrite(write: PendingWrite): Promise<void> {
	await ensureDataDirs();
	const filePath = path.join(PENDING_DIR, `${write.bggId}.json`);
	await writeFile(filePath, JSON.stringify(write, null, '\t'), 'utf-8');
}

export async function getPendingWrites(): Promise<PendingWrite[]> {
	await ensureDataDirs();
	const files = await readdir(PENDING_DIR);
	const writes: PendingWrite[] = [];
	for (const file of files) {
		if (!file.endsWith('.json')) continue;
		const raw = await readFile(path.join(PENDING_DIR, file), 'utf-8');
		writes.push(JSON.parse(raw));
	}
	return writes;
}

export async function markWriteCompleted(bggId: number): Promise<void> {
	const src = path.join(PENDING_DIR, `${bggId}.json`);
	const dst = path.join(COMPLETED_DIR, `${bggId}.json`);
	if (existsSync(src)) {
		await rename(src, dst);
	}
}

export async function updatePendingWrite(write: PendingWrite): Promise<void> {
	const filePath = path.join(PENDING_DIR, `${write.bggId}.json`);
	await writeFile(filePath, JSON.stringify(write, null, '\t'), 'utf-8');
}

export async function deletePendingWrite(bggId: number): Promise<void> {
	const filePath = path.join(PENDING_DIR, `${bggId}.json`);
	if (existsSync(filePath)) {
		await unlink(filePath);
	}
}
