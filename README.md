# SAT Archived

React app for historical SAT practice. Run `npm ci` and `npm run dev` with Node.js 22 or newer. Run `npm run build` and `npm run preview` to check the static production build. The current project version is 1.1.0. Continue developing and previewing source changes without repackaging the desktop executable each time; packaged executables retain their bundled snapshot.

## Windows desktop build

When a new desktop package is explicitly requested, run `pwsh -File desktop/build.ps1` on Windows. The x64 executable is written to `desktop/build/SAT Archived.exe`. It uses the system WebView2 Runtime with its own native Windows title bar and local profile. Fullscreen tests hide workspace navigation, preserve section clocks and answers, and support Escape and an explicit exit button.

The Windows build requires Python 3.10 or newer, PowerShell, Node.js and the .NET Framework compiler. The build downloads its WebView2 SDK when absent and checks the bundled historical resources before packaging. All build inputs are included in this repository; generated executables, dependencies and local hosting metadata are excluded from Git.

## Validation

Run `python scripts/check_authenticity_release.py` and `node scripts/scoring-audit-check.mjs` from the project root. To validate question text, image assets and source-defined omissions as well, install `scripts/requirements.txt` with `python -m pip install -r scripts/requirements.txt`, then run `python scripts/check_transcriptions.py`.

The final source-alignment audit and its per-question evidence are in [docs/audit](docs/audit). It covers all 5,359 playable questions, 5,923 conversion entries and 757 source-page renders. The two unidentified forms have packet-specific user-approved scoring; their historical form codes and dates remain unknown. Original-source research/readback tools are outside this application checkout; the included checks validate the shipped, source-bound resource set.

## Layout reference

The supplied dashboard uses a rounded fixed sidebar about 20% of the viewport, a content gutter about 3% of the viewport, four equally sized summary cards, and a lower panel split of roughly 65/35. The prototype follows those proportions on desktop and stacks the lower panels at narrower widths. The accent is white. Manrope is used for interface text and JetBrains Mono for scores, chart ticks, and counts.

The supplied SAT mark has a transparent background. Its lettering and four circles use the current accent in the sidebar, mobile header and favicon. The desktop host source also follows favicon color changes. Asset provenance and the editing prompt are in `src/assets/sat-mark.md`.

## Scoring and persistence

- Adding/uploading tests is temporarily disabled. Dashboard, library and dock entry points and the upload dialog are disconnected; the import component source is retained for later testing. Existing tests, saved attempts and results remain available.
- The library contains 35 authenticated forms plus Unidentified Form 1 and Unidentified Form 2 with user-approved packet scoring. Both unidentified packets use their accompanying keys and conversion tables; their historical form codes and administration dates remain unknown. Their scoring approvals are bound to the PDF hash and scoring-resource version.
- All library questions and choices use digital text. Original diagrams retain source crops. Original PDF and scoring pages remain available as references.
- Historical worksheet scores, the requested blank-answer adjustment and unofficial IQ estimates are separate calculations. Percentiles derive from estimated IQ using mean 100 and standard deviation 15. Scaled scores and IQ estimates require the verified scoring gate.
- Each section has a 30-minute clock. The second section of an index unlocks after its first is submitted. Saved attempts retain their remaining section time.
- Answers, saved positions, results and appearance settings are local to each profile. Reset progress clears attempts and results while retaining the bundled library and appearance preferences.

`scripts/check_transcriptions.py` checks all 37 question packs. The release and scoring checks validate provenance bindings, resource versions, scoring gates, section/index results, and IQ-derived percentiles. Historical PDF, transcription and scoring files are stored without line-ending conversion so their recorded hashes survive a Git checkout.
