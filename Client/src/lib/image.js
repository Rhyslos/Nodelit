// helper imports
import { API_BASE, clientID } from './api';

// configuration constants
const MAX_EDGE = 1600;
const QUALITY = 0.85;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const PASSTHROUGH = ['image/gif'];

// utility functions
export function isSupportedImage(file) {
    return Boolean(file) && ACCEPTED.includes(file.type);
}

export function imageURL(imageID) {
    return `${API_BASE}/api/notation/images/${imageID}`;
}

function scaledSize(width, height) {
    const longest = Math.max(width, height);
    if (longest <= MAX_EDGE) return { width, height };

    const ratio = MAX_EDGE / longest;

    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio))
    };
}

async function readDimensions(file) {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };

    bitmap.close();

    return size;
}

// preparation functions
export async function prepareImage(file) {
    if (!isSupportedImage(file)) {
        throw new Error('Only PNG, JPEG, WebP and GIF images can be added');
    }

    if (PASSTHROUGH.includes(file.type)) {
        if (file.size > MAX_BYTES) {
            throw new Error('Animated images must be under 2MB');
        }

        const size = await readDimensions(file);
        return { blob: file, ...size };
    }

    const bitmap = await createImageBitmap(file);
    const target = scaledSize(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY));

    if (!blob) {
        throw new Error('That image could not be processed');
    }

    if (blob.size > MAX_BYTES) {
        throw new Error('That image is too large even after resizing');
    }

    return { blob, ...target };
}

// upload functions
export async function uploadImage(workspaceID, file) {
    const prepared = await prepareImage(file);

    const query = new URLSearchParams({
        width: String(prepared.width),
        height: String(prepared.height)
    });

    const response = await fetch(`${API_BASE}/api/notation/${workspaceID}/images?${query}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-Client-Id': clientID,
            'Content-Type': prepared.blob.type
        },
        body: prepared.blob
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(payload?.error ?? 'The image could not be uploaded');
    }

    return payload;
}
