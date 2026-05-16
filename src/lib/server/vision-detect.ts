import { readFile } from 'fs/promises';
import { getShelfImagePath } from './shelf-persistence';

// Backend selection: 'ollama' (local Qwen3-VL) or 'openrouter' (cloud, supports Claude/Qwen3-VL)
const VISION_BACKEND = process.env.VISION_BACKEND || 'ollama';

// Ollama config
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-vl:30b';

// OpenRouter config (supports qwen3-vl, claude, etc.)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL =
	process.env.OPENROUTER_MODEL || 'qwen/qwen3-vl-235b-a22b-thinking';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

interface DetectedGame {
	name: string;
	box: { x: number; y: number; w: number; h: number };
}

const DETECTION_PROMPT = `You are analyzing a photo of a board game shelf. Identify every board game box visible in this image.

For each game, return:
- "name": the game's title as it appears on the box spine or front
- "box": bounding box as percentages of image width and height, where {x, y} is the top-left corner and {w, h} is the size. All values 0-100.

Group a base game with any expansions sitting directly next to it as a single entry.

Return ONLY a JSON array, no other text. Example:
[{"name": "Cascadia", "box": {"x": 10, "y": 20, "w": 15, "h": 40}}]`;

export async function detectGamesInPhoto(photoId: string): Promise<DetectedGame[]> {
	const imgPath = getShelfImagePath(photoId);
	const imgBuffer = await readFile(imgPath);
	const imageBase64 = imgBuffer.toString('base64');

	if (VISION_BACKEND === 'openrouter') {
		return detectViaOpenRouter(imageBase64);
	}
	return detectViaOllama(imageBase64);
}

// --- Ollama backend (local) ---
async function detectViaOllama(imageBase64: string): Promise<DetectedGame[]> {
	// Use chat API with /no_think to suppress Qwen3's thinking mode
	const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: OLLAMA_MODEL,
			messages: [
				{
					role: 'user',
					content: `/no_think ${DETECTION_PROMPT}`,
					images: [imageBase64]
				}
			],
			stream: false,
			options: {
				temperature: 0.1,
				num_predict: 8192
			}
		})
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Ollama request failed (${response.status}): ${text}`);
	}

	const data = await response.json();
	// Chat API returns message.content; fallback to generate-style response
	const rawText: string = data.message?.content || data.response || '';

	if (!rawText.trim()) {
		console.warn(
			'[vision-detect] Ollama returned empty response (thinking mode may have consumed all tokens).',
			'Thinking content length:',
			(data.thinking || data.message?.thinking || '').length
		);
		throw new Error(
			'Ollama vision model returned empty response. ' +
				'Qwen3-VL thinking mode may need to be disabled. ' +
				'Try setting VISION_BACKEND=openrouter or using a non-thinking model.'
		);
	}

	return parseDetectionResponse(rawText);
}

// --- OpenRouter backend (cloud) ---
async function detectViaOpenRouter(imageBase64: string): Promise<DetectedGame[]> {
	if (!OPENROUTER_API_KEY) {
		throw new Error(
			'OPENROUTER_API_KEY is required for openrouter backend. ' +
				'Set it in .env or environment variables.'
		);
	}

	const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://github.com/Terwox/LessBoardGames',
			'X-Title': 'LessBoardGames Shelf Detection'
		},
		body: JSON.stringify({
			model: OPENROUTER_MODEL,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: DETECTION_PROMPT },
						{
							type: 'image_url',
							image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
						}
					]
				}
			],
			temperature: 0.1,
			max_tokens: 8192
		})
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
	}

	const data = await response.json();
	const rawText: string = data.choices?.[0]?.message?.content || '';

	if (!rawText.trim()) {
		throw new Error('OpenRouter returned empty response');
	}

	return parseDetectionResponse(rawText);
}

function parseDetectionResponse(text: string): DetectedGame[] {
	// Strip thinking tags if present (Qwen3 sometimes wraps in <think>...</think>)
	let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

	// Strip markdown code fences if present
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

	// Try to extract JSON array from the response
	const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
	if (!arrayMatch) {
		console.warn('[vision-detect] No JSON array found in response:', text.slice(0, 200));
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(arrayMatch[0]);
	} catch {
		console.warn('[vision-detect] Failed to parse JSON:', arrayMatch[0].slice(0, 200));
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	return parsed
		.filter((item: any) => item && typeof item.name === 'string' && item.box)
		.map((item: any) => ({
			name: item.name.trim(),
			box: {
				x: clamp(Number(item.box.x) || 0, 0, 100),
				y: clamp(Number(item.box.y) || 0, 0, 100),
				w: clamp(Number(item.box.w) || 10, 1, 100),
				h: clamp(Number(item.box.h) || 10, 1, 100)
			}
		}));
}

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}
