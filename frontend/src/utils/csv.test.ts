import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCsv, downloadCsv } from './csv';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CSV export formatting', () => {
  it('quotes values, escapes embedded quotes and preserves spreadsheet Unicode', () => {
    expect(buildCsv(['Facility', 'Medicine'], [['Apollo, Central', 'Drug "A"']])).toBe(
      '\uFEFF"Facility","Medicine"\r\n"Apollo, Central","Drug ""A"""',
    );
  });

  it('exports headers when there are no matching rows', () => {
    expect(buildCsv(['Request ID', 'Status'], [])).toBe('\uFEFF"Request ID","Status"');
  });

  it('creates and clicks a downloadable CSV link with the requested filename', async () => {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:medicycle-export');
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', { setTimeout });

    downloadCsv('inventory.csv', ['Medicine'], [['Paracetamol']]);

    expect(anchor.download).toBe('inventory.csv');
    expect(anchor.href).toBe('blob:medicycle-export');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(setTimeout).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('"Medicine"\r\n"Paracetamol"');
  });
});
