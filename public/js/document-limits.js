window.DocumentLimits = {
  docx(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    if (view.byteLength < 22)
      throw new Error("This DOCX file is not a valid ZIP document.");
    for (
      let i = Math.max(0, view.byteLength - 22);
      i >= Math.max(0, view.byteLength - 65557);
      i--
    )
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    if (end < 0) throw new Error("This DOCX file is not a valid ZIP document.");
    const entries = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true),
      total = 0;
    if (entries > 2000)
      throw new Error("This DOCX contains too many embedded files.");
    for (let n = 0; n < entries; n++) {
      if (at + 46 > view.byteLength || view.getUint32(at, true) !== 0x02014b50)
        throw new Error("Invalid DOCX directory.");
      const compressed = view.getUint32(at + 20, true),
        size = view.getUint32(at + 24, true);
      total += size;
      if (
        total > 32 * 1024 * 1024 ||
        size > 16 * 1024 * 1024 ||
        (size > 1024 * 1024 && size > Math.max(1, compressed) * 200)
      )
        throw new Error("This DOCX expands beyond the safe extraction limit.");
      at +=
        46 +
        view.getUint16(at + 28, true) +
        view.getUint16(at + 30, true) +
        view.getUint16(at + 32, true);
    }
  },
};
