import { curatedForms, referenceCatalog } from "./historical.js";
import { estimateIndexIq, estimateIq, scaleIndex, scoringFor } from "./scoring.js";
import sourceExclusions from "../historical/source-exclusions.json";
import { excludedSource } from "./authenticity.js";

export const indexes = ["Verbal", "Math"];
export const seedForms = curatedForms;
export const storageKey = "sat-archive-prototype-v1";
export const initialState = { practiceVersion: 2, forms: seedForms, attempts: {}, results: [] };

const answerLetters = ["A", "B", "C", "D", "E"];

export function questionsFor(form) {
  if (!form.library) return form.questions ?? [];
  return form.sections.flatMap((section) => Array.from({ length: section.count }, (_, i) => {
    const number = i + 1;
    const [first, last] = section.fourChoice ?? [];
    const choices = number >= first && number <= last ? answerLetters.slice(0, 4) : answerLetters;
    return {
      section: section.number, index: section.index, number, page: section.pages[0], pages: section.pages,
      excluded: sourceExclusions[form.id]?.[section.number]?.includes(number) ?? false,
      prompt: "Section " + section.number + " · Question " + number,
      choices: choices.map((letter) => "Answer " + letter), key: null,
    };
  }));
}

export function playableCursor(items, cursor) {
  const item = items[cursor];
  if (!item?.excluded) return cursor;
  const next = items.findIndex((question, i) => i > cursor && question.section === item.section && !question.excluded);
  return next < 0 ? items.findLastIndex((question) => question.section === item.section && !question.excluded) : next;
}

export function percentileFromIq(iq) {
  if (!Number.isFinite(iq)) return null;
  const z = (iq - 100) / (15 * Math.sqrt(2));
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 50 * (1 + Math.sign(z) * erf);
}

export function summarize(form, result) {
  const items = questionsFor(form);
  // Saved attempts retain raw answers so they can be graded against the current verified resource.
  const scoring = scoringFor(form, items);
  const completed = result.indexes ?? form.indexes;
  const keys = scoring?.answers ?? items.map(({ key }) => key);
  const sections = completed.map((name) => {
    const counts = { right: 0, wrong: 0, omitted: 0, ungraded: 0 };
    let wrongFour = 0;
    let blankFour = 0;
    items.forEach((question, i) => {
      if (question.index !== name || question.excluded) return;
      const answer = result.answers[i];
      if (answer == null) counts.omitted++;
      if (keys[i] == null) {
        if (answer != null) counts.ungraded++;
      } else if (answer === keys[i]) counts.right++;
      else {
        counts.wrong++;
        if (question.choices.length === 4) {
          wrongFour++;
          if (answer == null) blankFour++;
        }
      }
    });
    const scores = scoring ? scaleIndex(scoring, name, counts.right, wrongFour, counts.wrong - wrongFour) : { raw: null, scaled: null };
    const original = scoring ? scaleIndex(scoring, name, counts.right, wrongFour - blankFour,
      counts.wrong - wrongFour - (counts.omitted - blankFour)) : null;
    const iq = estimateIndexIq(name, scores.scaled);
    return { name, ...counts, ...scores, original, iq, percentile: percentileFromIq(iq) };
  });
  const partial = result.partial ?? (completed.length < form.indexes.length);
  const total = !partial && sections.length === 2 && sections.every(({ scaled }) => scaled != null)
    ? sections.reduce((sum, { scaled }) => sum + scaled, 0) : null;
  const estimate = estimateIq(total);
  const title = form.title + (partial ? " (" + completed.join(" + ") + " only)" : "");
  return { ...result, form, title, partial, sections, keys, scoringVersion: scoring?.version,
    scored: Boolean(scoring), total, ...estimate, percentile: percentileFromIq(estimate.iq) };
}

export const ordinal = (value) => {
  if (value == null) return "—";
  const n = Math.min(99, Math.max(1, Math.round(value)));
  const suffix = n > 10 && n < 14 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return value < 1 ? "<1st" : value > 99 ? ">99" : n + suffix;
};

function migrateAttempt(formId, attempt) {
  const original = referenceCatalog.forms.find((form) => form.id === formId);
  if (!original?.indexes.includes("TSWE")) return attempt;
  let offset = 0;
  const retained = original.sections.flatMap((section) => {
    const positions = Array.from({ length: section.count }, (_, i) => offset + i);
    offset += section.count;
    return section.index === "TSWE" ? [] : positions;
  });
  const answers = Object.fromEntries(retained.flatMap((position, i) =>
    attempt.answers[position] == null ? [] : [[i, attempt.answers[position]]]));
  if (attempt.cursor == null) return { ...attempt, answers };
  const cursor = retained.findIndex((position) => position >= attempt.cursor);
  return { ...attempt, answers, cursor: cursor < 0 ? retained.length - 1 : cursor };
}

export function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return initialState;
    const localForms = (saved.forms ?? []).filter((form) => !form.library && form.questions?.length
      && !excludedSource({hash:form.sourceHash,name:[form.title,...(form.files ?? [])].join(" ")})
      && !(form.files?.includes("Sample SAT paper.pdf") && form.files?.includes("Sample scoring sheet.pdf")));
    const forms = [...localForms, ...seedForms];
    const ids = new Set(forms.map((form) => form.id));
    const current = saved.practiceVersion === initialState.practiceVersion;
    const attempts = Object.fromEntries(Object.entries(saved.attempts ?? {}).filter(([id]) => ids.has(id))
      .map(([id, attempt]) => [id, current ? attempt : migrateAttempt(id, attempt)]));
    const results = (saved.results ?? []).filter((result) => ids.has(result.formId) && !result.sample)
      .map((result) => current ? result : migrateAttempt(result.formId, result));
    return { ...initialState, forms, attempts, results };
  } catch {
    return initialState;
  }
}
