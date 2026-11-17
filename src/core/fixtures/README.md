Test PDFs for `detect.fixtures.test.ts`, generated with pdf-lib so each one uses a different drawing style:

- `small_7pt.pdf`: 7 pt text, underline as a thin filled bar, dashed date line, 5 pt squares, a table drawn as one
  stroked box per cell with a 15 pt header row.
- `big_14pt_landscape.pdf`: landscape, 14 pt text, round (curved) buttons, a dotted line made of 1 pt squares,
  three stacked dashed lines under "Remarks:", "Signature: ____" typed as text.
- `scaled.pdf`: drawn through a 0.5× transform matrix.

Add a file here (and a case in the test) when a real document shows a layout the detector gets wrong.

`forms.ts` makes synthetic forms with pdf-lib, each with the fields an admin sets up on it: grids of labels, Y / N /
NA checklists, answers printed in place of boxes, typed answer lines, filled input boxes, bullets and questions
answered in blank space under them, with words, sizes and borders picked by a seed. The learning tests and
`npm run eval` use them to score auto-detect on forms it has never seen (`bench.ts`).

`real.test.ts` (`npm run eval:real`) scores real forms the same way, leaving one out at a time: a folder of PDFs,
each next to the form JSON an admin saved on it, given by `FORMLIFT_CORPUS`. Never commit those files.
