import registry from "../historical/scoring-registry.json";
import { authenticity } from "./authenticity.js";

const letters = "ABCDE";

export function scoringResourceFor(form, items) {
  const resource = registry[form.id];
  if (!form.library || !resource || form.assetSha256 !== resource.assetSha256
    || resource.rule !== "rights-minus-wrongs-over-distractors-round-nearest"
    || !form.citations.some((citation) => citation.sourceId === resource.sourceId
      && citation.formCode === resource.formCode && citation.questionTextFingerprint === resource.questionTextFingerprint)) return null;
  if (!form.sections.every(({ number, count }) => resource.key[number]?.length === count)) return null;
  const answers = items.map(({ section, number }) => resource.key[section]?.[number - 1]);
  if (answers.some((key, i) => items[i].excluded ? key !== "-" : !key || !letters.slice(0, items[i].choices.length).includes(key))) return null;
  if (!form.indexes.every((name) => resource.scale[name]?.length ===
    items.filter((item) => item.index === name && !item.excluded).length - resource.scale.floor + 1)) return null;
  return { ...resource, answers: answers.map((key) => key === "-" ? null : letters.indexOf(key)) };
}

export function scoringFor(form, items) {
  const audit = authenticity(form);
  const approval = audit?.scoringApproval;
  const approvedPacket = audit?.status === "review" && approval?.status === "approved"
    && approval.assetSha256 === form.assetSha256 && approval.scoringVersion === audit.scoringVersion;
  if (!audit?.scoringReady || !(audit.status === "verified" || approvedPacket)) return null;
  if ([audit.key, audit.scale].some((count) => !count?.total || count.checked !== count.total)) return null;
  const resource = scoringResourceFor(form, items);
  return resource?.version === audit.scoringVersion ? resource : null;
}

export function scaleIndex(resource, name, rights, wrongFour, wrongFive) {
  // Twelfths keep the half-point rounding exact after both modules are combined.
  const raw = Math.floor((12 * rights - 4 * wrongFour - 3 * wrongFive + 6) / 12);
  const scaled = resource.scale[name]?.[Math.max(resource.scale.floor, raw) - resource.scale.floor] ?? null;
  return { raw, scaled };
}

// User-supplied historical combined-score table, in 50-point steps from 600 to 1600.
const historicalIq = [89, 93, 97, 100, 103, 106, 109, 112, 114, 117, 120, 123, 127, 130, 134, 137, 140, 145, 150, 155, 166];

// User-supplied subtest norms, from 200 through 800 in 10-point steps.
const indexIq = {
  Verbal: [72, 75, 77, 79, 81, 83, 85, 87, 89, 91, 92, 93, 95, 96, 97, 99, 100, 101, 102, 103,
    105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 116, 117, 118, 119, 120, 121, 122, 123, 124, 126,
    127, 129, 130, 132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 144, 146, 148, 150, 152, 154, 156, 159],
  Math: [59, 63, 66, 69, 72, 75, 78, 81, 83, 85, 87, 89, 91, 92, 94, 95, 97, 98, 99, 100,
    101, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
    122, 123, 125, 126, 128, 129, 131, 132, 133, 134, 135, 136, 137, 138, 139, 141, 143, 145, 147, 149, 152],
};

export function estimateIndexIq(name, scaled) {
  return scaled == null ? null : indexIq[name]?.[(scaled - 200) / 10] ?? null;
}

export function estimateIq(total) {
  if (total == null || total > 1600) return { iq: null };
  if (total < 600) return { iq: null, iqCeiling: historicalIq[0] };
  const step = (total - 600) / 50;
  const low = Math.floor(step);
  const high = Math.ceil(step);
  return { iq: Math.round(historicalIq[low] + (step - low) * (historicalIq[high] - historicalIq[low])) };
}
