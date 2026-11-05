export const indexes = ["Verbal", "Math"];

const questions = [
  { index: "Verbal", prompt: "In the sentence below, which word is closest in meaning to concise?", passage: "The editor praised the report for its concise summary of a complicated issue.", choices: ["Detailed", "Brief", "Informal", "Uncertain", "Critical"], key: 1 },
  { index: "Verbal", prompt: "Which word best completes the sentence?", passage: "Though the path looked steep from below, the climb proved surprisingly ____.", choices: ["Manageable", "Distant", "Cautious", "Artificial", "Fragile"], key: 0 },
  { index: "Verbal", prompt: "Which pair has the same relationship as atlas : maps?", choices: ["Clock : minutes", "Garden : rain", "Dictionary : definitions", "Compass : north", "Shelf : wood"], key: 2 },
  { index: "Verbal", prompt: "What does the second sentence imply about the astronomer?", passage: "Clouds covered the sky on the night of the observation. The astronomer set an alarm for dawn, when the forecast called for clear skies.", choices: ["They had completed the observation.", "They expected clouds until noon.", "They had lost their equipment.", "They planned to try again.", "They had changed fields."], key: 3 },
  { index: "Math", prompt: "If 3x + 5 = 26, what is the value of x?", choices: ["5", "6", "7", "8", "9"], key: 2 },
  { index: "Math", prompt: "A rectangle has an area of 48 and a width of 6. What is its perimeter?", choices: ["14", "22", "24", "28"], key: 3 },
  { index: "Math", prompt: "A bag contains 3 red marbles and 5 blue marbles. What is the probability of drawing a red marble?", choices: ["1/5", "3/8", "1/2", "3/5", "5/8"], key: 1 },
  { index: "Math", prompt: "The average of 7, 11, and n is 10. What is n?", choices: ["8", "10", "11", "12"], key: 3 },
];

export const satToIq = [
  [600, 89], [650, 93], [700, 97], [750, 100], [800, 103], [850, 106],
  [900, 109], [950, 112], [1000, 114], [1050, 117], [1100, 120],
  [1150, 123], [1200, 127], [1250, 130], [1300, 134], [1350, 137],
  [1400, 140], [1450, 145], [1500, 150], [1550, 155], [1600, 166],
];

export const scoringProfiles = {
  sample: {
    label: "Sample scoring profile",
    penalties: { 4: 1 / 3, 5: 1 / 4 },
    round: Math.round,
    scaledByRaw: {
      Verbal: { "-1": 200, 0: 250, 1: 380, 2: 510, 3: 650, 4: 800 },
      Math: { "-1": 200, 0: 260, 1: 400, 2: 530, 3: 680, 4: 800 },
    },
    iqByIndex: {
      Verbal: [[200, 75], [400, 100], [600, 124], [800, 150]],
      Math: [[200, 75], [400, 98], [600, 122], [800, 150]],
    },
  },
};

export const seedForms = [
  { id: "93", title: "October 1993 SAT", code: "Form 02", indexes, profileId: "sample" },
  { id: "92", title: "May 1992 SAT", code: "Form 03", indexes, profileId: "sample" },
  { id: "91", title: "October 1991 SAT", code: "Form 01", indexes, profileId: "sample" },
  { id: "90", title: "May 1990 SAT", code: "Form 04", indexes, profileId: "sample" },
  { id: "89", title: "October 1989 SAT", code: "Form 05", indexes, profileId: "sample" },
];

const samples = [
  ["89", "May 12", 510, 530, [1, 2, 2, 1, 2, 0, 1, 1]],
  ["90", "May 19", 550, 580, [1, 0, 2, 1, 2, 3, 0, 1]],
  ["91", "May 26", 540, 570, [1, 0, 3, 2, 2, 3, 0, 2]],
  ["92", "Jun 02", 590, 610, [1, 0, 2, 1, 2, 3, 1, 0]],
  ["93", "Jun 09", 630, 620, [1, 0, 2, 3, 2, 3, 1, 2]],
];

export const storageKey = "sat-archive-prototype-v1";
export const initialState = {
  forms: seedForms,
  attempts: { "93": { answers: { 0: 1, 1: 0, 2: 2 }, cursor: 3 } },
  results: [...samples].reverse().map(([formId, date, verbal, math, answers]) => ({
    id: "sample-" + formId, formId, date, sample: true,
    answers: { ...answers }, scaled: { Verbal: verbal, Math: math },
  })),
};

export function questionsFor(form) {
  return questions.filter((question) => form.indexes.includes(question.index));
}

export function interpolate(value, table) {
  if (value == null || value < table[0][0] || value > table.at(-1)[0]) return null;
  const index = table.findIndex(([input]) => input >= value);
  const [high, highIq] = table[index];
  if (high === value) return highIq;
  const [low, lowIq] = table[index - 1];
  return Math.round(lowIq + (highIq - lowIq) * (value - low) / (high - low));
}

export function percentile(iq) {
  if (iq == null) return null;
  const z = (iq - 100) / (15 * Math.sqrt(2));
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 50 * (1 + Math.sign(z) * erf);
}

export function summarize(form, result) {
  const profile = scoringProfiles[form.profileId];
  const items = questionsFor(form);
  const sections = form.indexes.map((name) => {
    let right = 0;
    let wrong = 0;
    let omitted = 0;
    let raw = 0;
    items.forEach((question, i) => {
      if (question.index !== name) return;
      const answer = result.answers[i];
      if (answer == null) omitted++;
      else if (answer === question.key) {
        right++;
        raw++;
      } else {
        wrong++;
        raw -= profile.penalties[question.choices.length] ?? 0;
      }
    });
    const rounded = profile.round(raw);
    const scaled = result.scaled?.[name] ?? profile.scaledByRaw[name][rounded];
    const iq = interpolate(scaled, profile.iqByIndex[name]);
    return { name, right, wrong, omitted, raw, rounded, scaled, iq, percentile: percentile(iq) };
  });
  const total = sections.length === indexes.length ? sections.reduce((sum, section) => sum + section.scaled, 0) : null;
  const iq = interpolate(total, satToIq);
  return { ...result, form, sections, total, iq, percentile: percentile(iq) };
}

export const ordinal = (value) => {
  if (value == null) return "—";
  const n = Math.min(99, Math.max(1, Math.round(value)));
  const suffix = n > 10 && n < 14 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return value < 1 ? "<1st" : value > 99 ? ">99th" : n + suffix;
};

export function readState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? initialState;
  } catch {
    return initialState;
  }
}
