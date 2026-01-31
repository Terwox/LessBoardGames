import crypto from 'crypto';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { ensureDataDirs } from './persistence';

const CREDENTIALS_FILE = path.resolve('data', 'credentials.enc');
const ALGORITHM = 'aes-256-gcm';
const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

interface EncryptedData {
	salt: string;
	iv: string;
	tag: string;
	ciphertext: string;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
	return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

function encrypt(plaintext: string, passphrase: string): EncryptedData {
	const salt = crypto.randomBytes(SALT_LENGTH);
	const key = deriveKey(passphrase, salt);
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return {
		salt: salt.toString('hex'),
		iv: iv.toString('hex'),
		tag: tag.toString('hex'),
		ciphertext: encrypted.toString('hex')
	};
}

function decrypt(data: EncryptedData, passphrase: string): string {
	const salt = Buffer.from(data.salt, 'hex');
	const iv = Buffer.from(data.iv, 'hex');
	const tag = Buffer.from(data.tag, 'hex');
	const ciphertext = Buffer.from(data.ciphertext, 'hex');
	const key = deriveKey(passphrase, salt);
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString('utf8');
}

export async function saveCredentials(
	username: string,
	password: string
): Promise<void> {
	await ensureDataDirs();
	const data = encrypt(JSON.stringify({ username, password }), password);
	await writeFile(CREDENTIALS_FILE, JSON.stringify(data, null, '\t'), 'utf-8');
}

export async function loadCredentials(
	password: string
): Promise<{ username: string; password: string } | null> {
	if (!existsSync(CREDENTIALS_FILE)) return null;
	const raw = await readFile(CREDENTIALS_FILE, 'utf-8');
	const data: EncryptedData = JSON.parse(raw);
	try {
		const decrypted = decrypt(data, password);
		return JSON.parse(decrypted);
	} catch {
		return null;
	}
}

export async function clearCredentials(): Promise<void> {
	if (existsSync(CREDENTIALS_FILE)) {
		await unlink(CREDENTIALS_FILE);
	}
}

export async function hasStoredCredentials(): Promise<boolean> {
	return existsSync(CREDENTIALS_FILE);
}
