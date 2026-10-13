// Serve the lockfile-pinned reader and worker ourselves, with evaluation disabled.
window.loadPdfReader = () => {
  if (!window.pdfReaderReady) window.pdfReaderReady = import('/vendor/pdfjs/pdf.mjs').then(reader => {
    reader.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    return reader;
  });
  return window.pdfReaderReady;
};
