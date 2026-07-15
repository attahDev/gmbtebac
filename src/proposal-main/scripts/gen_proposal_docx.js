const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, TabStopType,
  TabStopPosition, PageNumberElement, NumberFormat, TableOfContents
} = require('docx');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/proposal_data.json', 'utf8'));
const { title, proposal_type, proposal_id, date, content } = data;

const INK     = "0F0F0F";
const GOLD    = "C9A84C";
const MUTED   = "8A8070";
const BORDER  = "D4CFC5";
const CREAM   = "EDE9E0";
const LIGHT   = "F5F2EC";

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const noBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const CONTENT_W = 9026;

function monoRun(text, opts = {}) {
  return new TextRun({ text, font: "Courier New", size: 16, color: MUTED, ...opts });
}

function rule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 1 } },
    spacing: { before: 0, after: 160 },
    children: []
  });
}

function sectionLabel(num) {
  return new Paragraph({
    spacing: { before: 320, after: 60 },
    children: [monoRun(`S E C T I O N  ${num}`, { color: MUTED })]
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 0, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 26, font: "Georgia", color: INK })]
  });
}

function bodyParagraphs(text) {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim() !== '').map(line =>
    new Paragraph({
      spacing: { before: 0, after: 140 },
      children: [new TextRun({ text: line.trim(), size: 22, font: "Georgia", color: "3A3530" })]
    })
  );
}

function parsePricingHtml(html) {
  const elements = [];
  if (!html) return elements;

  const introMatch = html.match(/class='pricing-intro'>(.*?)<\/p>/s);
  if (introMatch) {
    elements.push(new Paragraph({
      spacing: { before: 0, after: 160 },
      children: [new TextRun({ text: introMatch[1].replace(/<[^>]+>/g, ''), size: 22, font: "Georgia", color: "3A3530" })]
    }));
  }

  const tableMatches = [...html.matchAll(/<table[^>]*>(.*?)<\/table>/gs)];
  tableMatches.forEach((tableMatch, tIdx) => {
    const tableHtml = tableMatch[1];
    const headingMatch = html.substring(0, tableMatch.index).match(/.*<h4>(.*?)<\/h4>/s);
    if (headingMatch) {
      const h4text = headingMatch[1];
      elements.push(new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: h4text, bold: true, size: 22, font: "Georgia", color: INK, allCaps: true })]
      }));
    }

    const rows = [...tableHtml.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(r => r[1]);
    const docxRows = rows.map((rowHtml, rIdx) => {
      const isHeader = rowHtml.includes('<th');
      const isFooter = rowHtml.includes('class=\'total-row\'') || rowHtml.includes('class="total-row"');
      const cellTag  = isHeader ? 'th' : 'td';
      const cells    = [...rowHtml.matchAll(new RegExp(`<${cellTag}[^>]*>(.*?)<\\/${cellTag}>`, 'gs'))].map(c => c[1].replace(/<[^>]+>/g, '').trim());

      const colCount = cells.length || 4;
      const colW     = Math.floor(CONTENT_W / colCount);
      const lastW    = CONTENT_W - colW * (colCount - 1);

      return new TableRow({
        tableHeader: isHeader,
        children: cells.map((cellText, cIdx) =>
          new TableCell({
            borders: allBorders,
            width: { size: cIdx === cells.length - 1 ? lastW : colW, type: WidthType.DXA },
            shading: isHeader
              ? { fill: INK,   type: ShadingType.CLEAR }
              : isFooter
                ? { fill: CREAM, type: ShadingType.CLEAR }
                : rIdx % 2 === 0
                  ? { fill: "FFFFFF", type: ShadingType.CLEAR }
                  : { fill: LIGHT,   type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({
                text: cellText,
                size: isHeader ? 18 : isFooter ? 22 : 20,
                bold: isHeader || isFooter,
                font: isHeader ? "Courier New" : "Georgia",
                color: isHeader ? "F5F2EC" : INK,
              })]
            })]
          })
        )
      });
    });

    elements.push(new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: Array(rows[0] ? [...rows[0].matchAll(/<t[hd][^>]*>/g)].length || 4 : 4)
        .fill(0).map((_, i, a) => i === a.length - 1 ? CONTENT_W - Math.floor(CONTENT_W / a.length) * (a.length - 1) : Math.floor(CONTENT_W / a.length)),
      rows: docxRows
    }));
    elements.push(new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }));
  });

  const noteMatch = html.match(/class='pricing-note'>(.*?)<\/p>/s);
  if (noteMatch) {
    elements.push(new Paragraph({
      spacing: { before: 120, after: 0 },
      children: [new TextRun({ text: noteMatch[1].replace(/<[^>]+>/g, ''), size: 20, font: "Georgia", color: MUTED, italics: true })]
    }));
  }

  return elements;
}
function signatureBlock() {
  const line = (label) => [
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: label, bold: true, size: 20, font: "Georgia", color: INK })]
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 1 } },
      spacing: { before: 280, after: 80 },
      children: [new TextRun({ text: " ", size: 20 })]
    })
  ];

  return [
    new Paragraph({ spacing: { before: 320, after: 120 }, children: [new TextRun({ text: "Prepared by:", bold: true, size: 22, font: "Georgia", color: INK })] }),
    ...line("Name:"), ...line("Title:"), ...line("Signature:"), ...line("Date:"),
    new Paragraph({ spacing: { before: 320, after: 120 }, children: [new TextRun({ text: "Accepted by:", bold: true, size: 22, font: "Georgia", color: INK })] }),
    ...line("Name:"), ...line("Title:"), ...line("Organisation:"), ...line("Signature:"), ...line("Date:"),
  ];
}

const SECTIONS_DEF = [
  ["1", "Executive Summary",    content.executive_summary,    false],
  ["2", "Project Overview",     content.project_overview,     false],
  ["3", "Scope of Work",        content.scope_of_work,        false],
  ["4", "Qualifications",       content.qualifications,       false],
  ["5", "Timeline",             content.timeline,             false],
  ["6", "Pricing",              content.pricing,              true ],
  ["7", "Terms & Conditions",   content.terms_and_conditions, false],
  ["8", "Agreement",            content.agreement,            false],
];

const bodyChildren = [];

SECTIONS_DEF.forEach(([num, heading, body, isHtml], idx) => {
  bodyChildren.push(sectionLabel(num));
  bodyChildren.push(sectionHeading(heading));

  if (isHtml) {
    bodyChildren.push(...parsePricingHtml(body));
  } else if (heading === "Agreement") {
    const sigIdx = (body || '').indexOf('Prepared by:');
    const textPart = sigIdx !== -1 ? body.substring(0, sigIdx) : body;
    bodyChildren.push(...bodyParagraphs(textPart));
    bodyChildren.push(...signatureBlock());
  } else {
    bodyChildren.push(...bodyParagraphs(body));
  }

  if (idx < SECTIONS_DEF.length - 1) {
    bodyChildren.push(rule());
  }
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Georgia", size: 22, color: INK } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 40, bold: true, font: "Georgia", color: INK },
        paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Georgia", color: INK },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 }
      },
    ]
  },
  sections: [
    // ── Section 1: Title page ──
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          children: [
            monoRun("P R O P O S A L"),
            new TextRun({ text: "\t", font: "Courier New", size: 16 }),
            monoRun(`Prepared: ${date}`),
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 0 },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          children: [
            new TextRun({ text: "\t", font: "Courier New", size: 16 }),
            monoRun(`Ref: ${proposal_id}`),
          ]
        }),
        ...Array(8).fill(null).map(() => new Paragraph({ children: [] })),
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [monoRun(proposal_type.toUpperCase().split('').join(' '), { color: MUTED })]
        }),
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 1 } },
          spacing: { before: 0, after: 240 },
          children: [new TextRun({ text: " " })]
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: title, bold: true, size: 52, font: "Georgia", color: INK })]
        }),
        ...Array(12).fill(null).map(() => new Paragraph({ children: [] })),
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER, space: 4 } },
          spacing: { before: 160, after: 0 },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          children: [
            monoRun("Confidential"),
            new TextRun({ text: "\t", font: "Courier New", size: 16 }),
            monoRun(date),
          ]
        }),
      ]
    },
    // ── Section 2: TOC ──
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [monoRun("C O N T E N T S")]
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 40, font: "Georgia", color: INK })]
        }),
        ...[
          ["Section 01", "Executive Summary"],
          ["Section 02", "Project Overview"],
          ["Section 03", "Scope of Work"],
          ["Section 04", "Qualifications"],
          ["Section 05", "Timeline"],
          ["Section 06", "Pricing"],
          ["Section 07", "Terms & Conditions"],
          ["Section 08", "Agreement"],
        ].map(([num, name]) =>
          new Paragraph({
            spacing: { before: 0, after: 0 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER, space: 4 } },
            tabStops: [{ type: TabStopType.LEFT, position: 1800 }],
            children: [
              new TextRun({ text: num, font: "Courier New", size: 18, color: MUTED }),
              new TextRun({ text: "\t", size: 18 }),
              new TextRun({ text: name, bold: true, size: 22, font: "Georgia", color: INK }),
            ]
          })
        )
      ]
    },
    // ── Section 3: Body ──
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: INK, space: 4 } },
              spacing: { before: 0, after: 160 },
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
              children: [
                new TextRun({ text: "P R O P O S A L", font: "Courier New", size: 16, color: MUTED }),
                new TextRun({ text: "\t", size: 16 }),
                new TextRun({ text: `Ref: ${proposal_id}`, font: "Courier New", size: 16, color: MUTED }),
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER, space: 4 } },
              spacing: { before: 120, after: 0 },
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
              children: [
                new TextRun({ text: date, font: "Courier New", size: 16, color: MUTED }),
                new TextRun({ text: "\t", size: 16 }),
                new PageNumberElement(),
              ]
            })
          ]
        })
      },
      children: bodyChildren
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(process.argv[3] || '/tmp/proposal_output.docx', buffer);
  console.log('OK');
}).catch(e => { console.error(e); process.exit(1); });
