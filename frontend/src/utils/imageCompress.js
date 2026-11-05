// ─────────────────────────────────────────────────────────────────────────────
//  Shrink a photo in the browser before upload: longest side ≤ 1600 px, JPEG.
//  A 12-megapixel phone photo (~4 MB) becomes ~300 KB, which keeps uploads
//  fast on campus Wi-Fi and the database small. Drawing through an <img>
//  applies the camera's EXIF rotation, so photos come out the right way up.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PHOTOS = 5;

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`"${file.name}" could not be read as an image. Use a JPG or PNG photo.`)); };
        img.src = url;
    });
}

// Scale (w, h) so the longest side is at most maxSide; never enlarge.
export function fitWithin(width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
    const img = await loadImage(file);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';            // transparent PNGs get a white background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', quality));
    const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
    return { blob, name, width, height };
}

// Blob → data URL (for the PDF builder).
export function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
