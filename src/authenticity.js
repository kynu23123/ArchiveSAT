import audit from "../historical/authenticity.json";

export const excludedForms = audit.excluded;
export function authenticity(form) {
  if (!form?.library) return null;
  const record = audit.forms[form.id] ?? form.practiceAudit;
  return record?.assetSha256 === form.assetSha256 ? record : null;
}

export function excludedSource({ hash, name = "", text = "" }) {
  return excludedForms.some((entry) => hash === entry.sha256
    || /(?:^|\W)7W(?:\W|$)/i.test(name)
    || /\bform\s*(?:code|number)?\s*[:#-]?\s*7W\b/i.test(text)
    || name.toLowerCase().includes("dea36d1d"));
}
