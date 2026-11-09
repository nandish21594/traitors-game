let library, documentId, documentPromise, renderTask, generation = 0;
export async function renderPdf(container, assetId, pageNumber) {
  const token = ++generation;
  container.innerHTML = '<p class="pdf-loading" role="status">Opening offline PDF…</p>';
  try {
    library ||= import('./vendor/pdfjs/pdf.mjs');
    const pdfjs = await library;
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    if (documentId !== assetId) {
      documentId = assetId;
      documentPromise = pdfjs.getDocument({ url: `/media/${assetId}`, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/', isEvalSupported: false }).promise;
    }
    const pdf = await documentPromise;
    if (token !== generation || !container.isConnected) return;
    if (pageNumber > pdf.numPages) throw new Error(`This PDF has ${pdf.numPages} pages. Choose a page from 1 to ${pdf.numPages}.`);
    if (renderTask) { renderTask.cancel(); try { await renderTask.promise; } catch {} }
    const page = await pdf.getPage(pageNumber);
    if (token !== generation || !container.isConnected) return;
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min((container.clientWidth - 16) / original.width, (container.clientHeight - 16) / original.height);
    const viewport = page.getViewport({ scale: scale * Math.min(devicePixelRatio || 1, 2) });
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Presentation PDF page ${pageNumber} of ${pdf.numPages}`);
    canvas.setAttribute('role', 'img');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(original.width * scale)}px`; canvas.style.height = `${Math.floor(original.height * scale)}px`;
    container.replaceChildren(canvas);
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await renderTask.promise;
    if (token === generation) canvas.dataset.rendered = 'true';
  } catch (e) {
    if (token !== generation || !container.isConnected || e.name === 'RenderingCancelledException') return;
    container.textContent = `${e.message || 'This PDF could not be opened.'} Use image slides or your separate PDF/PPT window as a fallback.`;
    documentPromise = null; documentId = null;
  }
}
