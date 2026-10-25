export async function downloadPdfFile(url: string, filename: string, token: string | null): Promise<void> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail || `PDF download failed (${response.status})`);
  }

  if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
    throw new Error('The server response was not a PDF. Please try again.');
  }

  const blob = await response.blob();
  if (blob.size < 5 || new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') {
    throw new Error('The server returned an invalid or empty PDF file.');
  }

  const disposition = response.headers.get('content-disposition');
  const serverFilename = disposition?.match(/filename\*?=(?:UTF-8''|["']?)([^;"']+)/i)?.[1];
  const safeFilename = serverFilename ? decodeURIComponent(serverFilename.replace(/["']/g, '')) : filename;
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = safeFilename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
