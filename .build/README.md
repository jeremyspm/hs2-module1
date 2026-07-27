# Content validator

`index.html` is a single self-contained file, so the only safety net for a content
edit is this script. **Run it after any change to `DATA`, `LINKS` or `ROUTES`.**

```bash
cd hs2-module1
python -c "import re;s=open('index.html',encoding='utf-8').read();open('.build/check.js','w',encoding='utf-8').write(re.search(r'<script>\n(.*)\n</script>',s,re.S).group(1))"
node .build/validate.js
```

It stubs the browser, evaluates everything above the `BOOT` marker, and checks:

1. **Route joins** — `link[k].to === link[k+1].from` for every named route. A broken
   join renders a chain whose beads lie, so this is the one that matters most.
2. **Topic integrity** — no duplicate ids, nothing missing, no orphan `LINKS`/`ROUTES` keys.
3. **Recall items** — every question has marking points, marks, and a `src` citation.
4. **MCQ keys** — `correct` in range, no duplicate options, every one explained and sourced.
5. **Case studies** — valid `kind`, topic ids resolve, every question sourced.
6. **Chains** — `beads.length === verbs.length + 1` (the hub drops a card that fails this).
7. **Metro layout** — every relation rides exactly one line or is marked feedback;
   no NaN positions; no relation on two lines (the cover must stay edge-disjoint).
8. **The pulse** — ≤5 offers, ≤20 cards each, real `counts`, and the day-rotation
   proven to give all 10 topics a turn (with 10 topics and 5 slots, a stable sort
   would otherwise starve half the module forever).
9. **`[[glossary]]` cross-links** resolve to a real glossary term somewhere.
10. **Giga parity** — the `HOUSE:GIGA:METRO` CSS block is diffed, rule by rule and
    property by property, against the `.metro-*` rules in
    `../gigastudyapp/app/studio/studio.css` (with Giga's theme tokens renamed to
    the house set). Any drifted value or missing rule FAILS. Deviations must be
    declared in `GIGA_DEVIATIONS` with a structural reason; hub-only additions
    are listed so an additive override can't smuggle drift back in.

    This exists because the map's first port was written from a prose description
    rather than copied, and came out unrecognisable — routes all drawn at once,
    flat cards, no hover. Prose cannot specify a look; a diff can. If
    `gigastudyapp` is not checked out beside this repo the step notes that parity
    was **not** verified rather than passing quietly.

`check.js` is generated; it is not the source of anything.
