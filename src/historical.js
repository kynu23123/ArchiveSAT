import catalog from "../historical/library.json";

const assets = import.meta.glob("../historical/*.pdf", { eager: true, query: "?url&no-inline", import: "default" });
const questionPacks = import.meta.glob("../historical/transcriptions/*.json", { eager: true, query: "?url&no-inline", import: "default" });

export const referenceCatalog = catalog;
export const curatedForms = [...catalog.forms, ...(catalog.practiceForms ?? [])].map((form) => ({
  ...form,
  sections: form.sections.filter((section) => section.index !== "TSWE"),
  indexes: form.indexes.filter((index) => index !== "TSWE"),
  paperPages: form.sections.filter((section) => section.index !== "TSWE").flatMap((section) => section.pages),
}));
export const referenceGroups = [...new Set(catalog.sources.map((source) => source.group))];

let lastPdf;
let lastQuestionPack;

export function loadQuestionPack(id) {
  const url = questionPacks["../historical/transcriptions/" + id + ".json"];
  if (!url) return Promise.resolve(null);
  if (lastQuestionPack?.id === id) return lastQuestionPack.promise;
  const promise = fetch(url).then((response) => {
    if (!response.ok) throw Error("The question pack could not be opened.");
    return response.json();
  });
  lastQuestionPack = { id, promise };
  promise.catch(() => { if (lastQuestionPack?.promise === promise) lastQuestionPack = undefined; });
  return promise;
}

export function loadReferencePdf(filename) {
  if (lastPdf?.filename === filename) return lastPdf.promise;
  const url = assets["../historical/" + filename];
  const promise = (async () => {
    if (!url) throw Error("The bundled PDF is unavailable.");
    const response = await fetch(url);
    if (!response.ok) throw Error("The bundled PDF could not be opened.");
    return response.blob();
  })();
  lastPdf = { filename, promise };
  promise.catch(() => { if (lastPdf?.promise === promise) lastPdf = undefined; });
  return promise;
}
