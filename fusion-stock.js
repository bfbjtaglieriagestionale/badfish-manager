/* Reads only the saved CAM setup. Never infers stock from a toolpath or model. */
(() => {
  "use strict";
  const MAX_FILE = 200 * 1024 * 1024,
    MAX_DOC = 16 * 1024 * 1024;
  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  function readCamDocuments(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length > MAX_FILE)
      throw Error("File Fusion troppo grande (massimo 200 MB).");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const check = (at, n) => {
      if (at < 0 || at + n > bytes.length)
        throw Error("Archivio Fusion incompleto.");
    };
    const u16 = (at) => {
      check(at, 2);
      return view.getUint16(at, true);
    };
    const u32 = (at) => {
      check(at, 4);
      return view.getUint32(at, true);
    };
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) {
      if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length)
        break;
    }
    if (end < Math.max(0, bytes.length - 65557))
      throw Error("Il file non è un archivio Fusion valido.");
    if (
      u16(end + 4) !== 0 ||
      u16(end + 6) !== 0 ||
      u16(end + 8) !== u16(end + 10)
    )
      throw Error("Archivi suddivisi non supportati.");
    const count = u16(end + 10),
      directory = u32(end + 16);
    if (count === 65535 || directory === 0xffffffff)
      throw Error(
        "Archivio ZIP64 non supportato. Esporta un singolo progetto .f3d.",
      );
    const docs = [];
    let at = directory;
    for (let i = 0; i < count; i++) {
      check(at, 46);
      if (u32(at) !== 0x02014b50)
        throw Error("Indice archivio Fusion non valido.");
      const flags = u16(at + 8),
        method = u16(at + 10),
        crc = u32(at + 16),
        packed = u32(at + 20),
        size = u32(at + 24);
      const nameLength = u16(at + 28),
        extra = u16(at + 30),
        comment = u16(at + 32),
        offset = u32(at + 42);
      check(at + 46, nameLength + extra + comment);
      const name = new TextDecoder().decode(
        bytes.subarray(at + 46, at + 46 + nameLength),
      );
      at += 46 + nameLength + extra + comment;
      if (!/\/Iron\.Document\/[^/]+\.irondoc$/i.test(name)) continue;
      if (flags & 1) throw Error("Archivio Fusion protetto.");
      if (size > MAX_DOC || docs.length >= 32)
        throw Error("Dati CAM troppo grandi. Esporta il singolo progetto.");
      check(offset, 30);
      if (u32(offset) !== 0x04034b50 || u16(offset + 8) !== method)
        throw Error("Intestazione Fusion non valida.");
      const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
      check(start, packed);
      const compressed = bytes.subarray(start, start + packed);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8)
        data = fflate.inflateSync(compressed, new Uint8Array(size));
      else if (method === 93 || method === 20)
        data = fzstd.decompress(compressed, new Uint8Array(size));
      else throw Error("Compressione Fusion non supportata: " + method + ".");
      if (data.length !== size || crc32(data) !== crc)
        throw Error("Dati CAM danneggiati: esporta nuovamente il file Fusion.");
      docs.push({
        name,
        xml: new TextDecoder("utf-8", { fatal: true }).decode(data),
      });
    }
    if (!docs.length)
      throw Error(
        "Nessun setup CAM nel file. Salva il progetto Fusion con il setup di lavorazione.",
      );
    return docs;
  }
  function parseSetups(xml, documentName) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (
      doc.getElementsByTagName("parsererror").length ||
      /<!DOCTYPE/i.test(xml)
    )
      throw Error("Dati CAM XML non validi.");
    return [...doc.getElementsByTagNameNS("*", "object")]
      .filter((el) => el.getAttribute("strategy") === "setup")
      .map((el) => {
        const params = new Map(
          [...el.getElementsByTagNameNS("*", "Parameter")].map((p) => [
            p.getAttribute("name"),
            p.getAttribute("value"),
          ]),
        );
        const mode = params.get("job_stockMode");
        const setup = {
          id: documentName + "#" + el.getAttribute("id"),
          name: el.getAttribute("displayName") || "Setup",
          mode,
          documentName,
        };
        if (mode !== "fixedbox")
          return {
            ...setup,
            error:
              "Questo setup non usa un blocco a dimensioni fisse. Imposta il grezzo in Fusion come “Box a dimensione fissa” ed esporta di nuovo il progetto.",
          };
        const dimensions = ["X", "Y", "Z"].map((axis) =>
          Number(params.get("job_stockFixed" + axis)),
        );
        if (dimensions.some((v) => !Number.isFinite(v) || v <= 0 || v > 100000))
          return {
            ...setup,
            error: "Dimensioni del grezzo assenti o non valide nel setup.",
          };
        return {
          ...setup,
          dimensions,
          units: "mm",
          method: "Fusion CAM / fixedbox",
          sourceType: "fusion-stock",
          volumeCm3: dimensions.reduce((a, b) => a * b, 1) / 1000,
        };
      });
  }
  function read(input) {
    const setups = readCamDocuments(input).flatMap((d) =>
      parseSetups(d.xml, d.name),
    );
    if (!setups.length) throw Error("Il progetto non contiene setup CAM.");
    return setups;
  }
  window.BadfishFusionStock = Object.freeze({ read });
})();
