import type { Game } from '$lib/types';
import { parseCollectionXml } from './xml-parser';

export const BGG_BASE = 'https://boardgamegeek.com';
export const BGG_API_BASE = `${BGG_BASE}/xmlapi2`;

// Server-side session cookie store (single-user local app)
let sessionCookies: string[] = [];

export function cookieHeader(): string {
	return sessionCookies.join('; ');
}

export function hasCookies(): boolean {
	return sessionCookies.length > 0;
}

export function isLoggedIn(): boolean {
	return sessionCookies.length > 0;
}

export async function loginToBgg(username: string, password: string): Promise<void> {
	const res = await fetch(`${BGG_BASE}/login/api/v1`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ credentials: { username, password } }),
		redirect: 'manual'
	});

	console.log(`[BGG Login] status=${res.status}`);

	if (!res.ok && res.status !== 302) {
		throw new Error('BGG login failed. Check your username and password.');
	}

	// Extract Set-Cookie headers
	const setCookies = res.headers.getSetCookie?.() ?? [];
	if (setCookies.length === 0) {
		// Fallback: try raw header
		const raw = res.headers.get('set-cookie');
		if (raw) {
			sessionCookies = raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean);
		} else {
			throw new Error('BGG login returned no session cookies.');
		}
	} else {
		sessionCookies = setCookies.map((c) => c.split(';')[0].trim()).filter(Boolean);
	}

	console.log(`[BGG Login] ${sessionCookies.length} cookies stored`);

	if (sessionCookies.length === 0) {
		throw new Error('BGG login returned no session cookies.');
	}
}

export function logout(): void {
	sessionCookies = [];
}

/**
 * Single-shot collection fetch. Returns parsed games on 200, or the raw HTTP status
 * so the caller (client) can handle retries with UI feedback.
 */
export async function fetchCollectionOnce(username: string): Promise<{ status: number; games?: Game[]; error?: string }> {
	const url = `${BGG_API_BASE}/collection?username=${encodeURIComponent(username)}&own=1&stats=1&excludesubtype=boardgameexpansion`;

	const headers: Record<string, string> = {};
	if (sessionCookies.length > 0) {
		headers['Cookie'] = cookieHeader();
	}

	const response = await fetch(url, { headers });
	console.log(`[BGG Collection] status=${response.status}, hasCookies=${sessionCookies.length > 0}`);

	if (response.status === 200) {
		const xml = await response.text();
		console.log(`[BGG Collection] XML length=${xml.length}, first 200 chars: ${xml.substring(0, 200)}`);
		const games = parseCollectionXml(xml);
		console.log(`[BGG Collection] Parsed ${games.length} games`);
		return { status: 200, games };
	}

	if (response.status === 202) {
		return { status: 202 };
	}

	if (response.status === 401) {
		return { status: 401, error: 'BGG returned 401. Try logging in again.' };
	}

	return { status: response.status, error: `BGG API returned status ${response.status}` };
}
