import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPdfFile } from './pdf';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PDF downloads', () => {
  it('requests the PDF with the portal token and saves it using the server filename', async () => {
    const anchor = {
      href: '',
      download: '',
      style: {},
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:medicycle-pdf');
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="transfer-report.pdf"',
      }),
      blob: async () => new Blob(['%PDF-test'], { type: 'application/pdf' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', { setTimeout });

    await downloadPdfFile('/api/transfers/export/pdf', 'fallback.pdf', 'demo-token');

    expect(fetchMock).toHaveBeenCalledWith('/api/transfers/export/pdf', {
      headers: { Authorization: 'Bearer demo-token' },
    });
    expect(anchor.download).toBe('transfer-report.pdf');
    expect(anchor.href).toBe('blob:medicycle-pdf');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(setTimeout).toHaveBeenCalledOnce();
  });

  it('reports non-PDF server responses instead of downloading them as a PDF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      blob: async () => new Blob(['not a PDF']),
    }));

    await expect(downloadPdfFile('/api/transfers/export/pdf', 'fallback.pdf', null))
      .rejects.toThrow('The server response was not a PDF.');
  });

  it('downloads inventory PDF with correct headers and validates %PDF- signature', async () => {
    const anchor = {
      href: '',
      download: '',
      style: {},
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:inventory-pdf');
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="medicycle_inventory_20261018.pdf"',
      }),
      blob: async () => new Blob(['%PDF-1.4\nInventory Report Data'], { type: 'application/pdf' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', { setTimeout });

    await downloadPdfFile('/api/inventory/export/pdf?facility_id=FAC-001', 'fallback_inv.pdf', 'test-token');

    expect(fetchMock).toHaveBeenCalledWith('/api/inventory/export/pdf?facility_id=FAC-001', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(anchor.download).toBe('medicycle_inventory_20261018.pdf');
    expect(anchor.href).toBe('blob:inventory-pdf');
    expect(anchor.click).toHaveBeenCalledOnce();
  });
});
