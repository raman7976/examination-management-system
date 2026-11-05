import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { getUfmPhotoBlob, uploadUfmPhotos, deleteUfmPhoto } from '../../api/api.js';
import { compressImage, MAX_PHOTOS } from '../../utils/imageCompress.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Evidence photos of one unfair-means case.
//  Images need the login token, so they are fetched as blobs and shown via
//  object URLs (revoked on unmount). While the case is open (`editable`)
//  photos can be added (shrunk in the browser first) and removed.
// ─────────────────────────────────────────────────────────────────────────────

const errMsg = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

export default function PhotoGallery({ caseId, photos, editable, onChange }) {
    const [urls, setUrls] = useState({});
    const urlsRef = useRef(urls);
    urlsRef.current = urls;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [enlarged, setEnlarged] = useState(null);
    const inputRef = useRef(null);

    // Fetch any photo we don't have a URL for yet.
    useEffect(() => {
        let cancelled = false;
        for (const p of photos) {
            if (urlsRef.current[p.id]) continue;
            getUfmPhotoBlob(caseId, p.id)
                .then((res) => {
                    if (cancelled) return;
                    const url = URL.createObjectURL(res.data);
                    setUrls((prev) => ({ ...prev, [p.id]: url }));
                })
                .catch(() => { /* the tile shows a placeholder */ });
        }
        return () => { cancelled = true; };
    }, [caseId, photos]);

    useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

    useEffect(() => {
        if (!enlarged) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setEnlarged(null); } };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [enlarged]);

    const remaining = MAX_PHOTOS - photos.length;

    const addFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        if (inputRef.current) inputRef.current.value = '';
        if (files.length === 0) return;
        if (files.length > remaining) {
            setError(`You can add ${remaining} more photo${remaining === 1 ? '' : 's'} (at most ${MAX_PHOTOS} per case).`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const shrunk = [];
            for (const f of files) shrunk.push(await compressImage(f));
            const res = await uploadUfmPhotos(caseId, shrunk);
            onChange(res.data.photos);
        } catch (err) {
            setError(errMsg(err, 'Could not upload the photos.'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (photo) => {
        if (!window.confirm('Remove this photo from the case?')) return;
        setBusy(true);
        setError(null);
        try {
            const res = await deleteUfmPhoto(caseId, photo.id);
            onChange(res.data.photos);
        } catch (err) {
            setError(errMsg(err, 'Could not remove the photo.'));
        } finally {
            setBusy(false);
        }
    };

    const shown = photos.find((p) => p.id === enlarged);

    return (
        <section className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-500">
                    Evidence photos <span className="text-textFaint">({photos.length}/{MAX_PHOTOS})</span>
                </h4>
                {editable && remaining > 0 && (
                    <>
                        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
                            aria-label="Add evidence photos" onChange={(e) => addFiles(e.target.files)} />
                        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-brand-500/40 text-brand-500 hover:bg-brand-500/10 disabled:opacity-50 cursor-pointer">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                            {busy ? 'Working…' : 'Add photos'}
                        </button>
                    </>
                )}
            </div>

            {error && <p className="text-[11px] text-danger mb-2">{error}</p>}

            {photos.length === 0 ? (
                <p className="text-xs text-textFaint">
                    {editable ? 'No photos yet. Add a photo of the seized material (chit, phone…) as evidence.' : 'No photos were attached.'}
                </p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {photos.map((p, i) => (
                        <figure key={p.id} className="relative group rounded-lg border border-border overflow-hidden bg-surface2">
                            <button type="button" onClick={() => setEnlarged(p.id)} className="block w-full aspect-[4/3] cursor-zoom-in"
                                aria-label={`Open photo ${i + 1}`}>
                                {urls[p.id]
                                    ? <img src={urls[p.id]} alt={p.caption || `Evidence photo ${i + 1}`} className="w-full h-full object-cover" />
                                    : <span className="flex w-full h-full items-center justify-center text-[11px] text-textFaint">Loading…</span>}
                            </button>
                            <figcaption className="px-2 py-1 text-[10px] text-textMuted truncate">
                                {p.caption || `Photo ${i + 1}`}
                            </figcaption>
                            {editable && (
                                <button type="button" onClick={() => remove(p)} disabled={busy} aria-label={`Remove photo ${i + 1}`}
                                    className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </figure>
                    ))}
                </div>
            )}

            {shown && (
                <div role="dialog" aria-label="Photo" onClick={() => setEnlarged(null)}
                    className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-6 cursor-zoom-out">
                    <button type="button" aria-label="Close photo" className="absolute top-4 right-4 text-white/80 hover:text-white cursor-pointer">
                        <X className="w-6 h-6" />
                    </button>
                    {urls[shown.id] && <img src={urls[shown.id]} alt={shown.caption || 'Evidence photo'} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />}
                    <p className="mt-3 text-xs text-white/80">
                        {shown.caption ? `${shown.caption} · ` : ''}Uploaded by {shown.uploaded_by_name || '—'}
                    </p>
                </div>
            )}
        </section>
    );
}
