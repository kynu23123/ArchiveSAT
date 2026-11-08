export const sectionDuration = 30 * 60 * 1000;

export function testSections(items) {
  const sections = [];
  items.forEach((item, cursor) => {
    const number = item.section ?? item.index;
    const last = sections.at(-1);
    if (last?.number === number) last.end = cursor + 1;
    else sections.push({ number, index: item.index, start: cursor, end: cursor + 1 });
  });
  return sections;
}

export function sectionAt(sections, cursor) {
  return sections.findIndex(({ start, end }) => cursor >= start && cursor < end);
}

export function canOpen(sections, completed, slot) {
  return Boolean(sections[slot]) && !completed.includes(slot) && sections.every(
    ({ index }, i) => i >= slot || index !== sections[slot].index || completed.includes(i),
  );
}

export function completedIndexes(sections, completed) {
  return [...new Set(sections.map(({ index }) => index))].filter((index) =>
    sections.every((section, i) => section.index !== index || completed.includes(i)));
}

export function pauseAttempt(attempt, sections, now) {
  if (attempt.endsAt == null) return attempt;
  const slot = sectionAt(sections, attempt.cursor);
  return { ...attempt, endsAt: null, clocks: { ...attempt.clocks, [slot]: Math.max(0, attempt.endsAt - now) } };
}

export function activateSection(attempt, sections, slot, now) {
  const paused = pauseAttempt(attempt, sections, now);
  const previous = sectionAt(sections, paused.cursor);
  const positions = previous < 0 ? paused.positions : { ...paused.positions, [previous]: paused.cursor };
  return {
    ...paused, positions,
    cursor: positions?.[slot] ?? sections[slot].start,
    endsAt: now + (paused.clocks?.[slot] ?? sectionDuration),
  };
}

export function resumeAttempt(attempt, sections, now) {
  if (attempt.endsAt != null) return attempt;
  const slot = sectionAt(sections, attempt.cursor);
  const completed = attempt.completed ?? [];
  const open = canOpen(sections, completed, slot) ? slot : sections.findIndex((_, i) => canOpen(sections, completed, i));
  return activateSection({ ...attempt, completed }, sections, open, now);
}

export function closeSection(attempt, sections, now) {
  const slot = sectionAt(sections, attempt.cursor);
  const completed = [...attempt.completed, slot];
  const next = sections.findIndex((_, i) => i > slot && canOpen(sections, completed, i));
  const open = next < 0 ? sections.findIndex((_, i) => canOpen(sections, completed, i)) : next;
  const closed = { ...attempt, completed, endsAt: null };
  return open < 0 ? closed : activateSection(closed, sections, open, now);
}
