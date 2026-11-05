import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import PhotoGallery from './PhotoGallery.jsx';
import { getUfmPhotoBlob } from '../../api/api.js';
import { server } from '../../../test/setup/mswServer.js';

// jsdom's Blob has no .stream(), which msw needs for binary responses, so the
// photo download itself is stubbed.
vi.mock('../../api/api.js', async (orig) => ({
    ...(await orig()),
    getUfmPhotoBlob: vi.fn(async () => ({ data: new Blob(['png']) })),
}));

vi.mock('../../utils/imageCompress.js', async (orig) => ({
    ...(await orig()),
    compressImage: vi.fn(async (file) => ({ blob: file, name: file.name, width: 10, height: 10 })),
}));

const PHOTOS = [
    { id: 1, caption: 'Chit, front', uploaded_by_name: 'Exam Admin' },
    { id: 2, caption: null, uploaded_by_name: 'Exam Admin' },
];

beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
});

describe('<PhotoGallery>', () => {
    it('loads each photo through the API and enlarges it on click', async () => {
        render(<PhotoGallery caseId={9} photos={PHOTOS} editable={false} onChange={vi.fn()} />);
        expect(getUfmPhotoBlob).toHaveBeenCalledWith(9, 1);
        expect(screen.getByText('Evidence photos')).toBeInTheDocument();
        expect(await screen.findByAltText('Chit, front')).toHaveAttribute('src', 'blob:photo');
        expect(screen.getByText('Photo 2')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add photos/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Remove photo/ })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
        expect(screen.getByRole('dialog', { name: 'Photo' })).toHaveTextContent('Uploaded by Exam Admin');
    });

    it('adds and removes photos while the case is open', async () => {
        const onChange = vi.fn();
        let uploadedCount = 0;
        server.use(
            http.post('/api/unfair-means/9/photos', async ({ request }) => {
                uploadedCount = (await request.formData()).getAll('photos').length;
                return HttpResponse.json({ success: true, photos: [...PHOTOS, { id: 3 }] }, { status: 201 });
            }),
            http.delete('/api/unfair-means/9/photos/2', () => HttpResponse.json({ success: true, photos: [PHOTOS[0]] })),
        );
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<PhotoGallery caseId={9} photos={PHOTOS} editable onChange={onChange} />);

        await userEvent.upload(screen.getByLabelText('Add evidence photos'), new File(['x'], 'phone.jpg', { type: 'image/jpeg' }));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith([...PHOTOS, { id: 3 }]));
        expect(uploadedCount).toBe(1);

        await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([PHOTOS[0]]));
    });

    it('refuses more photos than the case can still hold', async () => {
        const four = [1, 2, 3, 4].map((id) => ({ id, caption: null }));
        render(<PhotoGallery caseId={9} photos={four} editable onChange={vi.fn()} />);
        const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })];
        await userEvent.upload(screen.getByLabelText('Add evidence photos'), files);
        expect(screen.getByText(/You can add 1 more photo \(at most 5 per case\)/)).toBeInTheDocument();
    });
});
