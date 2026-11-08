import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
const bundledDecoders = import.meta.glob("../node_modules/pdfjs-dist/wasm/*_nowasm_fallback.js", {
  eager: true, query: "?url&no-inline", import: "default",
});

GlobalWorkerOptions.workerSrc = worker;

export function openPdf(file, historical = false) {
  const task = file.arrayBuffer().then((data) => getDocument({
    data, isEvalSupported: false, useWasm: false, useSystemFonts: true,
    wasmUrl: historical ? new URL(".", new URL(Object.values(bundledDecoders)[0], location.href)).href : undefined,
  }));
  return { document: task.then((loader) => loader.promise), close: () => task.then((loader) => loader.destroy()).catch(() => {}) };
}

export function parseNumbers(value) {
  if (!value.trim()) return [];
  const result = new Set();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
    if (!match) throw Error("Use question numbers or ranges like 1–8, 11.");
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!start || end < start || end - start > 200) throw Error("Enter a valid question range.");
    for (let i = start; i <= end; i++) result.add(i);
  }
  return [...result];
}

export function classify(lines, index) {
  const heading = lines.slice(0, 16).join(" ");
  const keyHeading = /\b(answer\s+key|answers\s+and\s+explanations|correct\s+answers)\b/i.test(heading);
  const scoreHeading = /\b(scoring\s+(?:sheet|worksheet|guide|table)|score\s+conversion|raw\s+score\b.*\bscaled\s+score|scoring\s+your\s+(?:test|sat))\b/i.test(heading);
  const section = heading.match(/^\s*(?:section\s+\d+\s*[:–-]?\s*)?(mathematics|mathematical|math|verbal)\b/i);
  const nextIndex = section ? (/^math/i.test(section[1]) ? "Math" : "Verbal") : index;
  const numbers = [...new Set(lines.map((line) => line.match(/^\s*(\d{1,3})[.)]\s+\S/)?.[1]).filter(Boolean))];
  return {
    type: keyHeading || scoreHeading ? "scoring" : numbers.length ? "questions" : "review",
    index: nextIndex,
    numbers: numbers.join(", "),
  };
}

export async function inspectPdf(file, source, scoring = false) {
  const pdf = openPdf(file);
  try {
    const document = await pdf.document;
    if (document.numPages > 180) throw Error("Choose a PDF with 180 pages or fewer.");
    let index = "Verbal";
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const lines = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += (line && item.str && !line.endsWith(" ") ? " " : "") + item.str;
        if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ""; }
      }
      if (line.trim()) lines.push(line.trim());
      const classified = classify(lines, index);
      index = classified.index;
      pages.push({ ...classified, type: scoring ? "scoring" : classified.type, source, number, text: lines.join("\n") });
      page.cleanup();
    }
    return pages;
  } finally {
    await pdf.close();
  }
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sat-archive-papers", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("papers");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function access(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("papers", mode);
      const request = operation(transaction.objectStore("papers"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const savePapers = (id, files) => access("readwrite", (store) => store.put(files, id));
export const readPapers = (id) => access("readonly", (store) => store.get(id));
export const clearPapers = () => access("readwrite", (store) => store.clear());
