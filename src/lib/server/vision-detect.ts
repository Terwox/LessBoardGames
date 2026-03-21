import { readFile } from 'fs/promises';
import { getShelfImagePath } from './shelf-persistence';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const VISION_MODEL = process.env.VISION_MODEL || 'qwen3-vl:30b';

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

	const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: VISION_MODEL,
			prompt: DETECTION_PROMPT,
			images: [imageBase64],
			stream: false,
			options: {
				temperature: 0.1,
				num_predict: 4096
			}
		})
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Ollama request failed (${response.status}): ${text}`);
	}

	const data = await response.json();
	const rawText: string = data.response || '';

	return parseDetectionResponse(rawText);
}

function parseDetectionResponse(text: string): DetectedGame[] {
	// Strip markdown code fences if present
	let cleaned = text.trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

	// Try to extract JSON array from the response
	const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
	if (!arrayMatch) {
		console.warn('[vision-detect] No JSON array found in response:', text);
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(arrayMatch[0]);
	} catch {
		console.warn('[vision-detect] Failed to parse JSON:', arrayMatch[0]);
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
