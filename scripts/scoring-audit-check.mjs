import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (name) => read("historical/" + name + ".json");
const url = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const authenticityUrl = url(read("src/authenticity.js").replace(/^import .+;/m, "const audit = " + json("authenticity") + ";"));
const scoringUrl = url(read("src/scoring.js")
  .replace(/^import registry .+;/m, "const registry = " + json("scoring-registry") + ";")
  .replace("./authenticity.js", authenticityUrl));
const referenceCatalog = JSON.parse(json("library"));
const curatedForms = referenceCatalog.forms.map((form) => ({
  ...form, indexes: form.indexes.filter((index) => index !== "TSWE"),
  sections: form.sections.filter((section) => section.index !== "TSWE"),
}));
const model = await import(url(read("src/data.js")
  .replace(/^import .+historical\.js";/m, "const referenceCatalog = " + JSON.stringify(referenceCatalog) + "; const curatedForms = " + JSON.stringify(curatedForms) + ";")
  .replace("./scoring.js", scoringUrl)
  .replace(/^import .+source-exclusions\.json";/m, "const sourceExclusions = " + json("source-exclusions") + ";")
  .replace("./authenticity.js", authenticityUrl)));
const { scaleIndex, scoringResourceFor, scoringFor, estimateIndexIq, estimateIq } = await import(scoringUrl);
const { authenticity, excludedSource } = await import(authenticityUrl);

for (const status of ["review", "blocked"]) {
  const held = JSON.parse(json("authenticity"));
  held.forms[curatedForms[0].id].status = status;
  const heldUrl = url(read("src/authenticity.js").replace(/^import .+;/m, "const audit = " + JSON.stringify(held) + ";"));
  const heldScoring = await import(url(read("src/scoring.js")
    .replace(/^import registry .+;/m, "const registry = " + json("scoring-registry") + ";")
    .replace("./authenticity.js", heldUrl)));
  const items = model.questionsFor(curatedForms[0]);
  assert(heldScoring.scoringResourceFor(curatedForms[0], items));
  assert.equal(heldScoring.scoringFor(curatedForms[0], items), null, status);
}

for (const [iq,expected] of [[70,2.275],[85,15.866],[100,50],[115,84.134],[130,97.725]]) {
  assert(Math.abs(model.percentileFromIq(iq)-expected) < .001);
}
assert.equal(model.percentileFromIq(null), null);
assert.equal(model.percentileFromIq(NaN), null);
assert.equal(model.ordinal(99), '99th');
assert.equal(model.ordinal(99.0001), '>99');
assert.equal(model.ordinal(99.999), '>99');
assert.equal(model.ordinal(null), '—');
assert.equal(model.percentileFromIq(estimateIq(1200).iq), model.percentileFromIq(127));
assert.equal(model.percentileFromIq(estimateIq(590).iq), null);
assert.equal(estimateIndexIq("Verbal", 600), 127);
assert.equal(estimateIndexIq("Math", 600), 122);
assert(excludedSource({ name: "SAT Form 7W" }));
assert(excludedSource({ text: "Correct Answers for SAT Form Code 7W" }));
assert(excludedSource({ hash: "19887b8ba2dcdc316361fa436d0d7d1294b5d64a686aebb3f975cd564234a8d2" }));
assert(!excludedSource({ name: "Form 7G027" }));

for (const form of referenceCatalog.practiceForms ?? []) {
  const items = model.questionsFor(form);
  assert.equal(items.length, 145);
  assert.equal(authenticity(form).status, "review");
  const resource = scoringFor(form, items);
  assert(resource);
  assert.equal(resource.answers.length, 145);
  for (const change of [
    {scoringApproval:undefined}, {scoringReady:false}, {status:'blocked'},
    {scoringApproval:{...form.practiceAudit.scoringApproval,assetSha256:'mismatch'}},
    {scoringApproval:{...form.practiceAudit.scoringApproval,scoringVersion:'mismatch'}},
    {key:{checked:144,total:145}}, {scale:{checked:0,total:147}},
  ]) {
    assert.equal(scoringFor({...form,practiceAudit:{...form.practiceAudit,...change}},items),null);
  }
  assert.equal(scoringResourceFor({...form,assetSha256:'mismatch'},items),null);
  const answers = Object.fromEntries(resource.answers.map((answer,i)=>[i,answer]));
  const result = model.summarize(form, {answers});
  assert.equal(result.scored,true);
  assert.equal(result.total,1600);
  assert.equal(result.iq,166);
  assert.equal(model.ordinal(result.percentile),'>99');
  assert.deepEqual(result.sections.map(s=>s.iq),form.indexes.map(index=>index==='Verbal'?159:152));
  for (const index of form.indexes) {
    const partial = model.summarize(form,{answers,partial:true,indexes:[index]});
    assert.equal(partial.total,null);
    assert.equal(partial.sections[0].scaled,800);
    assert.equal(partial.sections[0].iq,index==='Verbal'?159:152);
    const blanks = model.summarize(form,{answers:{},partial:true,indexes:[index]});
    assert.equal(blanks.sections[0].scaled,200);
    assert.equal(blanks.sections[0].iq,index==='Verbal'?72:59);
  }
}

for (const form of [...curatedForms,...referenceCatalog.practiceForms]) {
  const items = model.questionsFor(form);
  const resource = scoringResourceFor(form, items);
  assert(resource, form.id);
  assert.equal(scoringResourceFor({ ...form, assetSha256: "mismatch" }, items), null);
  const audit = authenticity(form);
  const allowed = audit.scoringReady && (audit.status === "verified" || audit.scoringApproval?.status === "approved");
  assert.equal(Boolean(scoringFor(form, items)), allowed);
  const sampleAnswers = Object.fromEntries(resource.answers.flatMap((key, i) => key == null ? [] : [[i, key]]));
  assert.equal(model.summarize(form, {answers:sampleAnswers}).total, allowed ? 1600 : null);
  for (const index of form.indexes) {
    const slots = items.flatMap((item, i) => item.index === index && !item.excluded ? [[item, i]] : []);
    for (const scenario of ["correct", "incorrect", "omitted", "mixed"]) {
      let right = 0;
      let wrongFour = 0;
      let wrongFive = 0;
      let blanks = 0;
      let total = 0;
      slots.forEach(([item], position) => {
        const response = scenario === "mixed" ? ["correct", "incorrect", "omitted"][position % 3] : scenario;
        if (response === "correct") { right++; total++; }
        if (response === "omitted") blanks++;
        if (response === "incorrect") {
          total -= 1 / (item.choices.length - 1);
          if (item.choices.length === 4) wrongFour++; else wrongFive++;
        }
      });
      const raw = Math.round(Math.round(total * 12) / 12);
      const scaled = resource.scale[index][Math.max(resource.scale.floor,raw)-resource.scale.floor];
      assert.deepEqual(scaleIndex(resource,index,right,wrongFour,wrongFive), {raw,scaled}, form.id);
      const blankFour = slots.filter(([item], i) => item.choices.length === 4 &&
        (scenario === "omitted" || scenario === "mixed" && i % 3 === 2)).length;
      const adjusted = Math.round(Math.round((total - blankFour / 3 - (blanks - blankFour) / 4) * 12) / 12);
      assert.equal(scaleIndex(resource,index,right,wrongFour+blankFour,wrongFive+blanks-blankFour).raw,adjusted,form.id);
    }
  }
}
const resources = JSON.parse(json('scoring-registry'));
assert.equal(scaleIndex(resources['042c3604'],'Verbal',65,0,0).scaled,610);
assert.equal(scaleIndex(resources['1ba0fa17'],'Verbal',65,0,0).scaled,610);
assert.equal(scaleIndex(resources['042c3604'],'Math',58,0,0).scaled,770);
assert.equal(scaleIndex(resources['1ba0fa17'],'Math',58,0,0).scaled,760);
assert.equal(scaleIndex(resources['1ba0fa17'],'Math',49,0,0).scaled,670);
assert.equal(scaleIndex(resources['1ba0fa17'],'Verbal',43,0,0).scaled,470);
assert.equal(scaleIndex(resources['1ba0fa17'],'Math',0,0,0).scaled,250);
assert.equal(scaleIndex(resources['042c3604'],'Math',0,0,0).scaled,200);
console.log("37 forms passed source binding, release gating, both scoring policies and IQ-derived percentile tests; both unidentified packets passed approval and partial/composite scoring checks.");
