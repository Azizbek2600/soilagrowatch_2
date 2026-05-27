import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── helpers ──────────────────────────────────────
function statusLabel(st) {
  return st === 'good' ? 'Yaxshi' : st === 'mid' ? "O'rtacha" : 'Yomon'
}
function statusRgb(st) {
  return st === 'good' ? [22, 163, 74] : st === 'mid' ? [217, 119, 6] : [220, 38, 38]
}

function pageFooter(doc, W, H, pageNum, total, dateStr, timeStr) {
  doc.setFillColor(15, 17, 23)
  doc.rect(0, H - 20, W, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(46, 204, 113)
  doc.text('SoilAgroWatch', 15, H - 7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`Hisobot SoilAgroWatch tomonidan tayyorlandi  |  ${dateStr}  ${timeStr}`, W / 2, H - 7, { align: 'center' })
  doc.text(`${pageNum} / ${total}`, W - 15, H - 7, { align: 'right' })
}

// ── main export ──────────────────────────────────
export function generatePdfReport({ analysis, polygons, year, geeIndices }) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const H    = doc.internal.pageSize.getHeight()
  const now  = new Date()
  const dateStr = now.toLocaleDateString('ru-RU')
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const totalHa = polygons.reduce((s, p) => s + p.ha, 0)
  const isGee   = analysis.source === 'GEE'

  // ────────────────────────────────────────────────
  // PAGE 1 — TITLE
  // ────────────────────────────────────────────────
  // Dark green header
  doc.setFillColor(15, 17, 23)
  doc.rect(0, 0, W, H, 'F')

  doc.setFillColor(26, 140, 78)
  doc.rect(0, 0, W, 60, 'F')

  // Accent stripe
  doc.setFillColor(46, 204, 113)
  doc.rect(0, 60, W, 3, 'F')

  // Logo text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.setTextColor(255, 255, 255)
  doc.text('SoilAgroWatch', W / 2, 28, { align: 'center' })

  // Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(180, 240, 210)
  doc.text('Tuproq Tahlil Hisoboti', W / 2, 40, { align: 'center' })

  // Tagline
  doc.setFontSize(9)
  doc.setTextColor(130, 200, 170)
  doc.text("Sun'iy yo'ldosh ma'lumotlari asosida avtomatik tayyorlangan", W / 2, 51, { align: 'center' })

  // Info card
  doc.setFillColor(20, 24, 32)
  doc.setDrawColor(46, 204, 113)
  doc.setLineWidth(0.5)
  doc.roundedRect(20, 75, W - 40, 130, 4, 4, 'FD')

  // Card title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(46, 204, 113)
  doc.text('HISOBOT MALUMOTLARI', 30, 89)

  doc.setDrawColor(42, 45, 58)
  doc.setLineWidth(0.4)
  doc.line(30, 93, W - 30, 93)

  const infoRows = [
    ['Sana', dateStr],
    ['Vaqt', timeStr],
    ['Tahlil yili', String(year)],
    ['Maydon', `${totalHa.toFixed(2)} ga (${(totalHa * 10000).toFixed(0)} m2)`],
    ['Polygon soni', `${polygons.length} ta`],
    ["Ma'lumot manbai", isGee ? 'Google Earth Engine (Sentinel-2)' : "Mahalliy ma'lumotlar"],
  ]
  if (analysis.period) infoRows.push(['Tahlil davri', analysis.period])

  let y = 104
  for (const [label, value] of infoRows) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(label + ':', 32, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(226, 232, 240)
    doc.text(value, 95, y)
    y += 11
  }

  // GEE satellite badge
  doc.setFillColor(26, 140, 78, 0.2)
  doc.setFillColor(10, 40, 25)
  doc.setDrawColor(46, 204, 113)
  doc.setLineWidth(0.5)
  doc.roundedRect(20, 218, W - 40, 22, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(46, 204, 113)
  doc.text('Manba: Google Earth Engine  |  Sentinel-2 SR Harmonized', W / 2, 228, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Bulutlilik < 20%  |  Vaqt oralig\'i: mart - oktyabr', W / 2, 234, { align: 'center' })

  pageFooter(doc, W, H, 1, 3, dateStr, timeStr)

  // ────────────────────────────────────────────────
  // PAGE 2 — INDICES TABLE
  // ────────────────────────────────────────────────
  doc.addPage()
  doc.setFillColor(15, 17, 23)
  doc.rect(0, 0, W, H, 'F')

  doc.setFillColor(26, 140, 78)
  doc.rect(0, 0, W, 22, 'F')
  doc.setFillColor(46, 204, 113)
  doc.rect(0, 22, W, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('Indekslar Tahlili', W / 2, 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(180, 240, 210)
  doc.text(`Yil: ${year}   Manba: ${isGee ? 'GEE Sentinel-2' : "Mahalliy"}`, W / 2, 30, { align: 'center' })

  // Build rows
  const tableRows = []
  for (const idx of geeIndices) {
    const res = analysis[idx.key]
    if (!res) continue
    const st  = idx.status(res.avg)
    tableRows.push([idx.label, idx.fmt(res.avg), statusLabel(st), idx.text(res.avg)])
  }

  autoTable(doc, {
    startY: 36,
    head: [['Indeks', 'Qiymat', 'Holat', 'Tavsiya / Sharh']],
    body: tableRows,
    margin: { left: 12, right: 12 },
    theme: 'grid',
    headStyles: {
      fillColor: [26, 140, 78],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [226, 232, 240],
      fillColor: [20, 24, 32],
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [26, 29, 39] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, halign: 'center' },
      1: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    tableLineColor: [42, 45, 58],
    tableLineWidth: 0.3,
    didParseCell(data) {
      if (data.column.index === 2 && data.section === 'body') {
        const val = data.cell.text[0]
        data.cell.styles.textColor =
          val === 'Yaxshi'     ? [46, 204, 113]
          : val === "O'rtacha" ? [251, 191, 36]
          :                      [248, 113, 113]
      }
      if (data.column.index === 1 && data.section === 'body') {
        data.cell.styles.textColor = [96, 165, 250]
      }
    },
  })

  // Legend below table
  const afterY = doc.lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Holat belgisi:', 14, afterY)

  const legend = [
    { label: 'Yaxshi', rgb: [46, 204, 113] },
    { label: "O'rtacha", rgb: [251, 191, 36] },
    { label: 'Yomon', rgb: [248, 113, 113] },
  ]
  let lx = 42
  for (const { label, rgb } of legend) {
    doc.setFillColor(...rgb)
    doc.roundedRect(lx, afterY - 4, 3, 4, 1, 1, 'F')
    doc.setTextColor(...rgb)
    doc.setFont('helvetica', 'bold')
    doc.text(label, lx + 5, afterY)
    lx += 30
  }

  pageFooter(doc, W, H, 2, 3, dateStr, timeStr)

  // ────────────────────────────────────────────────
  // PAGE 3 — OVERALL CONCLUSION
  // ────────────────────────────────────────────────
  doc.addPage()
  doc.setFillColor(15, 17, 23)
  doc.rect(0, 0, W, H, 'F')

  doc.setFillColor(26, 140, 78)
  doc.rect(0, 0, W, 22, 'F')
  doc.setFillColor(46, 204, 113)
  doc.rect(0, 22, W, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text("Umumiy Xulosa va Tavsiyalar", W / 2, 14, { align: 'center' })

  // Compute overall score
  const scores = geeIndices
    .filter(i => analysis[i.key])
    .map(i => i.score(analysis[i.key].avg))
  const avgScore    = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const overallSt   = avgScore >= 0.6 ? 'good' : avgScore >= 0.4 ? 'mid' : 'bad'
  const overallRgb  = statusRgb(overallSt)
  const overallLbl  = statusLabel(overallSt)
  const overallSub  =
    overallSt === 'good' ? "Dala umumiy holati yaxshi. Monitoring davom ettirilsin."
    : overallSt === 'mid' ? "Ba'zi korsatkichlarga e'tibor berilsin."
    : "Zudlik bilan agrotexnik chora korish talab etiladi."

  // Status card
  doc.setFillColor(20, 24, 32)
  doc.setDrawColor(...overallRgb)
  doc.setLineWidth(1)
  doc.roundedRect(14, 30, W - 28, 34, 4, 4, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...overallRgb)
  doc.text(overallLbl, W / 2, 46, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text(overallSub, W / 2, 57, { align: 'center' })

  // Score bar
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text(`Umumiy korsatkich: ${(avgScore * 100).toFixed(0)}%`, 14, 76)

  // Track
  doc.setFillColor(30, 36, 51)
  doc.roundedRect(14, 79, W - 28, 6, 2, 2, 'F')
  // Fill
  doc.setFillColor(...overallRgb)
  doc.roundedRect(14, 79, (W - 28) * avgScore, 6, 2, 2, 'F')

  // Categorize indices
  const badItems  = geeIndices.filter(i => analysis[i.key] && i.status(analysis[i.key].avg) === 'bad')
  const midItems  = geeIndices.filter(i => analysis[i.key] && i.status(analysis[i.key].avg) === 'mid')
  const goodItems = geeIndices.filter(i => analysis[i.key] && i.status(analysis[i.key].avg) === 'good')

  let cy = 96

  function section(title, items, rgb) {
    if (!items.length) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...rgb)
    doc.text(title, 14, cy)
    cy += 1
    doc.setDrawColor(...rgb)
    doc.setLineWidth(0.3)
    doc.line(14, cy + 1, W - 14, cy + 1)
    cy += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(200, 210, 224)
    for (const idx of items) {
      const res   = analysis[idx.key]
      const line1 = `${idx.label} (${idx.fmt(res.avg)}) — ${idx.text(res.avg)}`
      const lines = doc.splitTextToSize(line1, W - 34)
      // bullet
      doc.setFillColor(...rgb)
      doc.circle(17, cy - 1.5, 1.2, 'F')
      doc.text(lines, 21, cy)
      cy += lines.length * 5 + 3
      if (cy > H - 30) return
    }
    cy += 4
  }

  section('Kritik muammolar (zudlik bilan chora korish zarur):', badItems,  [248, 113, 113])
  section("E'tibor talab etuvchi korsatkichlar:",                midItems,  [251, 191, 36])
  section('Yaxshi holatdagi korsatkichlar:',                    goodItems, [46, 204, 113])

  // General recommendations box
  if (cy < H - 60) {
    doc.setFillColor(20, 24, 32)
    doc.setDrawColor(42, 45, 58)
    doc.setLineWidth(0.4)
    doc.roundedRect(14, cy, W - 28, 30, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(46, 204, 113)
    doc.text('Umumiy tavsiyalar:', 20, cy + 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    const recs = [
      '1. Har yili kamida 2 marta masofadan sensing tahlili otkazing.',
      '2. Muammoli indekslar uchun laboratoriya tasdig\'i oling.',
      '3. Agrotexnik tadbirlardan keyin takroriy tahlil qiling.',
    ]
    let ry = cy + 17
    for (const rec of recs) {
      doc.text(rec, 20, ry)
      ry += 6
    }
  }

  pageFooter(doc, W, H, 3, 3, dateStr, timeStr)

  // Save
  const slug = now.toISOString().slice(0, 10)
  doc.save(`SoilAgroWatch_${year}_${slug}.pdf`)
}
