/**
 * Writes docs/greek-texts-review.docx: every Greek text the player sees, in tables an archaeologist
 * or a teacher can comment on in Word. The texts come straight from the game (src/game/el.ts and the
 * room's preset phrases), so the document is regenerated whenever they change: `npm run texts`.
 */
import { writeFileSync } from 'node:fs'
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, PageOrientation, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { agoraSteps, blockNames, buildings, copy, missions, sanctuarySteps, stadiumSteps } from '../src/game/el'
import { PHRASES } from '../src/net/protocol'

/** Written from the repository's root, where npm runs its scripts. */
const OUT = 'docs/greek-texts-review.docx'

interface Row { where: string; code: string; text: string }
interface Section { title: string; hint: string; rows: Row[] }

type Text = { title: string; description: string; note: string }

/** A building's steps: the note first (it is what players learn), then the title and the task. */
function steps(prefix: string, list: Record<string, Text>, label: (index: number, text: Text) => string): Row[] {
  return Object.entries(list).flatMap(([id, text], i) => [
    { where: `${label(i, text)}: τίτλος`, code: `${prefix}.${id}.title`, text: text.title },
    { where: `${label(i, text)}: τι χτίζεις`, code: `${prefix}.${id}.description`, text: text.description },
    { where: `${label(i, text)}: σημείωση`, code: `${prefix}.${id}.note`, text: text.note },
  ])
}

/** Keys of `copy` that have their own section; everything else is listed with the interface. */
const SPECIAL = new Set(['facts', 'guideSteps', 'inputHelp', 'roomErrors', 'removeConfirm', 'buildingLocked'])

/** Interface texts, in the order they appear in el.ts. A sentence with a gap shows it as «…». */
function interfaceRows(): Row[] {
  const rows: Row[] = []
  for (const [key, value] of Object.entries(copy)) {
    if (SPECIAL.has(key) || key === 'brand') continue
    if (typeof value === 'string') rows.push({ where: 'Διεπαφή', code: `copy.${key}`, text: value })
    else if (Array.isArray(value)) value.forEach((line, i) => typeof line === 'string' && rows.push({ where: 'Διεπαφή', code: `copy.${key}[${i}]`, text: line }))
  }
  return rows
}

const sections: Section[] = [
  {
    title: 'Ιστορικές σημειώσεις',
    hint: 'Εμφανίζονται στην πάνω δεξιά γωνία την πρώτη φορά που συμβαίνει κάτι (πέφτει η νύχτα, συναντάς ένα ζώο, στήνεις έναν σπόνδυλο κίονα) και μένουν στο Ημερολόγιο γνώσης. Υψηλή προτεραιότητα ελέγχου.',
    rows: Object.entries(copy.facts).flatMap(([id, fact]) => [
      { where: 'Τίτλος', code: `copy.facts.${id}.title`, text: fact.title },
      { where: 'Κείμενο', code: `copy.facts.${id}.text`, text: fact.text },
    ]),
  },
  {
    title: 'Το θέατρο: οι αποστολές',
    hint: 'Κάθε αποστολή έχει τίτλο, οδηγία για το τι χτίζει ο παίκτης και μια σημείωση που διαβάζει όταν την ολοκληρώνει. Υψηλή προτεραιότητα ελέγχου.',
    rows: steps('missions', missions, (i, text) => `Αποστολή ${i + 1} «${text.title}»`),
  },
  {
    title: 'Το ιερό του Διονύσου: τα βήματα',
    hint: 'Ένας μικρός δωρικός ναός 4 × 6 κιόνων με βωμό και περίβολο. Υψηλή προτεραιότητα ελέγχου.',
    rows: steps('sanctuarySteps', sanctuarySteps, (i, text) => `Βήμα ${i + 1} «${text.title}»`),
  },
  {
    title: 'Η αγορά: τα βήματα',
    hint: 'Μια στοά 7 δωρικών κιόνων με 3 καταστήματα, και ένα κρηνοστάσιο που γεμίζει από πηγή με πήλινο αγωγό. Υψηλή προτεραιότητα ελέγχου.',
    rows: steps('agoraSteps', agoraSteps, (i, text) => `Βήμα ${i + 1} «${text.title}»`),
  },
  {
    title: 'Το στάδιο: τα βήματα',
    hint: 'Ένας αμμόστρωτος δρόμος με βαλβίδες, πρανή θεατών, κρυπτή είσοδο, καμπτήρες και αυλάκι νερού. Υψηλή προτεραιότητα ελέγχου.',
    rows: steps('stadiumSteps', stadiumSteps, (i, text) => `Βήμα ${i + 1} «${text.title}»`),
  },
  {
    title: 'Τα κτίρια και οι πινακίδες τους',
    hint: 'Ο τίτλος κάθε κτιρίου και όσα λέει η πινακίδα στην είσοδο του χώρου του.',
    rows: [
      ...Object.entries(buildings).flatMap(([id, building]) => [
        { where: 'Τίτλος', code: `buildings.${id}.title`, text: building.title },
        { where: 'Πινακίδα', code: `buildings.${id}.intro`, text: building.intro },
      ]),
      { where: 'Πινακίδα κλειστού κτιρίου', code: 'copy.buildingLocked', text: copy.buildingLocked('…') },
    ],
  },
  {
    title: 'Υλικά, εργαλεία και αντικείμενα',
    hint: 'Οι ονομασίες στο σακίδιο, στη γρήγορη πρόσβαση και στις συνταγές.',
    rows: Object.entries(blockNames).map(([id, name]) => ({ where: 'Ονομασία', code: `blockNames.${id}`, text: name })),
  },
  {
    title: 'Οδηγός «Πρώτα βήματα» και «Πώς παίζεται»',
    hint: 'Οδηγίες χειρισμού. Ελέγξτε κυρίως αν είναι κατανοητές για μαθητές.',
    rows: [
      ...copy.guideSteps.flatMap((step, i) => [
        { where: `Πρώτα βήματα ${i + 1}: τίτλος`, code: `copy.guideSteps[${i}].title`, text: step.title },
        { where: `Πρώτα βήματα ${i + 1}: κείμενο`, code: `copy.guideSteps[${i}].text`, text: step.text },
      ]),
      ...copy.inputHelp.map(([keys, text], i) => ({ where: `Πώς παίζεται: ${keys}`, code: `copy.inputHelp[${i}]`, text })),
    ],
  },
  {
    title: 'Παιχνίδι με φίλους',
    hint: 'Οι έτοιμες φράσεις (δεν υπάρχει ελεύθερη συνομιλία, γιατί οι παίκτες είναι παιδιά) και τα μηνύματα των δωματίων.',
    rows: [
      ...PHRASES.map((phrase, i) => ({ where: `Φράση ${i + 1}`, code: `PHRASES[${i}]`, text: phrase })),
      ...Object.entries(copy.roomErrors).map(([id, text]) => ({ where: 'Μήνυμα σφάλματος', code: `copy.roomErrors.${id}`, text })),
      { where: 'Ερώτηση στον δημιουργό', code: 'copy.removeConfirm', text: copy.removeConfirm('…') },
    ],
  },
  {
    title: 'Μενού, κουμπιά και μηνύματα διεπαφής',
    hint: 'Όλα τα υπόλοιπα κείμενα της οθόνης, με τη σειρά που βρίσκονται στον κώδικα. Χαμηλότερη προτεραιότητα.',
    rows: interfaceRows(),
  },
]

// --- The document ---

const FONT = 'Noto Serif'
const GREY = '6B6B6B'
const run = (text: string, extra: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}) => new TextRun({ text, font: FONT, size: 20, ...extra })
const para = (text: string, extra: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}) => new Paragraph({ children: [run(text, extra)], spacing: { after: 120 } })

/** Column widths in twentieths of a point, on landscape A4 with 2 cm margins. */
const WIDTHS = [700, 2900, 6600, 3900]
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
const borders = { top: border, bottom: border, left: border, right: border }

const cell = (children: Paragraph[], width: number, shade?: string) => new TableCell({
  children, borders, width: { size: width, type: WidthType.DXA },
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  ...(shade ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: shade } } : {}),
})

function table(rows: Row[], start: number) {
  const head = new TableRow({
    tableHeader: true,
    children: ['#', 'Πού εμφανίζεται (κωδικός)', 'Κείμενο στο παιχνίδι', 'Σχόλια / διορθώσεις']
      .map((label, i) => cell([new Paragraph({ children: [run(label, { bold: true })] })], WIDTHS[i], 'E8E2D6')),
  })
  const body = rows.map((row, i) => new TableRow({
    cantSplit: true,
    children: [
      cell([new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(String(start + i), { color: GREY })] })], WIDTHS[0]),
      cell([new Paragraph({ children: [run(row.where)] }), new Paragraph({ children: [run(row.code, { font: 'Consolas', size: 16, color: GREY })] })], WIDTHS[1]),
      cell([new Paragraph({ children: [run(row.text)] })], WIDTHS[2]),
      cell([new Paragraph({ children: [] })], WIDTHS[3]),
    ],
  }))
  return new Table({ rows: [head, ...body], width: { size: WIDTHS.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: WIDTHS })
}

const total = sections.reduce((sum, section) => sum + section.rows.length, 0)
let counter = 1
const body = sections.flatMap((section, i) => {
  const start = counter
  counter += section.rows.length
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0, children: [new TextRun({ text: `${i + 1}. ${section.title}`, font: FONT })] }),
    para(section.hint, { italics: true, color: GREY }),
    table(section.rows, start),
  ]
})

const doc = new Document({
  creator: 'KivoPolis',
  title: 'KivoPolis: τα ελληνικά κείμενα του παιχνιδιού',
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  sections: [{
    properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'KivoPolis: τα ελληνικά κείμενα του παιχνιδιού', font: FONT })] }),
      para(`Για επιστημονικό έλεγχο. Το έγγραφο περιέχει κάθε κείμενο που βλέπει ο παίκτης, ${total} συνολικά, στα τέσσερα κτίρια του νησιού: το θέατρο, το ιερό του Διονύσου, την αγορά και το στάδιο. Οι ενότητες είναι ταξινομημένες κατά σημασία για τον αρχαιολογικό έλεγχο: πρώτα οι ιστορικές σημειώσεις και τα βήματα κάθε κτιρίου, μετά οι ονομασίες υλικών και αντικειμένων, και στο τέλος τα κείμενα χειρισμού και μενού.`),
      para('Παρακαλούμε γράψτε τα σχόλια ή τη διορθωμένη διατύπωση στην τελευταία στήλη (ή χρησιμοποιήστε την Παρακολούθηση αλλαγών του Word). Ο γκρι κωδικός στη δεύτερη στήλη μάς βοηθά να βρούμε το κείμενο στον κώδικα· δεν χρειάζεται να τον ελέγξετε.'),
      para('Χρήσιμα σημεία για έλεγχο:'),
      ...[
        'Ιστορική ακρίβεια των ισχυρισμών: θέατρο, ναός και λατρεία, αγορά και στοές, κρήνες και αγωγοί, Ολυμπία και αγώνες, καθημερινή ζωή, τροφή, ζώα, λυχνάρια.',
        'Ορολογία του θεάτρου: ορχήστρα, αναλήμματα, κοίλον, εδώλια, προεδρία, διάζωμα, κερκίδες, κλίμακες, σκηνή, πάροδοι, θυμέλη.',
        'Ορολογία του ναού και της στοάς: περίβολος, τέμενος, κρηπίδα, στυλοβάτης, σηκός, πρόναος, περίπτερος, σπόνδυλοι, κιονόκρανο (εχίνος, άβακας), θριγκός, επιστύλιο, ζωφόρος, τρίγλυφα, μετόπες, γείσο, αετώματα, θύρσος, όροι, κρηνοστάσιο, λεοντοκεφαλή.',
        'Ορολογία του σταδίου: στίβος, βαλβίδες, πρανή, ελλανοδίκες, κρυπτή είσοδος, σφηνόλιθοι, καμπτήρες, δίαυλος, δόλιχος.',
        'Υλικά και τεχνικές: ασβεστόλιθος, χαλίκι, μάρμαρο, λαξευτός λίθος, πηλός και κεραμίδια, χαλκός, κασσίτερος, μπρούντζος, η μέθοδος του χαμένου κεριού.',
      ].map((text) => new Paragraph({ bullet: { level: 0 }, children: [run(text)] })),
      para('Το παιχνίδι απευθύνεται σε μαθητές· οι απλουστεύσεις είναι σκόπιμες, αλλά δεν πρέπει να είναι λανθασμένες. Τα κτίρια είναι φανταστικές εκπαιδευτικές ερμηνείες, εμπνευσμένες από πραγματικά παραδείγματα όπως το θέατρο των Δελφών, ο ναός και το στάδιο της Ολυμπίας και οι στοές και οι κρήνες της αθηναϊκής αγοράς.'),
      ...body,
    ],
  }],
})

writeFileSync(OUT, await Packer.toBuffer(doc))
console.log(`${total} texts in ${sections.length} sections → docs/greek-texts-review.docx`)
