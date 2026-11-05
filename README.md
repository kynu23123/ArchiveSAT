# SAT Archive

React frontend prototype for historical SAT practice. Run `npm ci` and `npm run dev` with Node.js 22 or newer. Run `npm run build` and `npm run preview` to check the static production build.

## Layout reference

The supplied dashboard uses a rounded fixed sidebar about 20% of the viewport, a content gutter about 3% of the viewport, four equally sized summary cards, and a lower panel split of roughly 65/35. The prototype follows those proportions on desktop and stacks the lower panels at narrower widths. The accent is white. Manrope is used for interface text and JetBrains Mono for scores, chart ticks, and counts.

The requested shadcn.io examples guide the card composition, stacked area chart, radial score display, compact ripple buttons, interactive dots, conversion beam, dock, and numeric footer. The components are adapted to the screenshot and use React, Recharts, and a Radix dialog.

## Scoring and persistence

- `src/data.js` contains the shared historical combined SAT-to-IQ lookup and separate per-form scoring profiles. The prototype interpolates between rows, rounds to the nearest integer, and leaves scores outside the supplied range blank.
- The sample quiz borrows the worksheet's wrong-answer deductions. Its raw-to-scaled values and section IQ mappings are illustrative. The percentile display uses a normal distribution with mean 100 and standard deviation 15. The displayed ±5 range is demo data.
- Form attachments save their filenames in browser storage. The import flow creates a sample quiz from built-in questions.
- Answers, saved positions, and results are browser-local. Reset progress clears added forms, sample results, and attempts while leaving the starter forms available.
