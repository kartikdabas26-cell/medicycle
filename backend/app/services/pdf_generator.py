from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from typing import List, Dict, Any, Optional
from datetime import datetime
import io

class NumberedCanvas(canvas.Canvas):
    """Adds running headers and footers with page numbers to every page."""
    report_title = "Inter-Facility Transfer Planning Report"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        # Top running line
        self.setStrokeColor(colors.HexColor('#E4EAE5'))
        self.setLineWidth(0.75)
        self.line(36, 580, 756, 580)

        # Top small text
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor('#718078'))
        self.drawString(36, 586, "MEDICYCLE — Clinical Supply Chain Optimization Platform")
        title = getattr(self, "report_title", "Inter-Facility Transfer Planning Report")
        self.drawRightString(756, 586, title)

        # Bottom running line
        self.line(36, 32, 756, 32)

        # Footer
        self.drawString(36, 22, "Confidential — For Hospital Pharmacy & Healthcare Supply Chain Evaluation Only")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(756, 22, page_text)
        self.restoreState()


class InventoryNumberedCanvas(NumberedCanvas):
    report_title = "Clinical Inventory & Stock Valuation Report"


def generate_transfers_pdf(
    recommendations: List[Dict[str, Any]],
    surge_pct: float = 0.0,
    generated_at: datetime = None
) -> bytes:
    """
    Generates a hospital-grade, elegant PDF report for Inter-Facility Transfer Recommendations.
    """
    if generated_at is None:
        generated_at = datetime.now()

    buffer = io.BytesIO()
    # Usable width = 792 - 72 = 720 pt
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Custom styles adhering to gentle hospital palette
    primary_color = colors.HexColor('#263A35')
    brand_green = colors.HexColor('#397A68')
    secondary_gray = colors.HexColor('#718078')
    soft_sage = colors.HexColor('#E8F1EC')
    border_color = colors.HexColor('#D5DFD9')

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color
    )

    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=secondary_gray
    )

    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=brand_green
    )

    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=primary_color
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#2E5F52')
    )

    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=primary_color
    )

    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        textColor=primary_color
    )

    cell_reason = ParagraphStyle(
        'TableCellReason',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor('#40524B')
    )

    story = []

    # 1. Header Section
    header_table_data = [
        [
            Paragraph("<b>MEDICYCLE</b> &nbsp;|&nbsp; Inter-Facility Transfer Planning Report", title_style),
            Paragraph(f"<b>Report Generated:</b> {generated_at.strftime('%Y-%m-%d %H:%M:%S')}<br/>"
                      f"<b>Demand Surge Setting:</b> {'Baseline (0%)' if surge_pct == 0 else f'+{surge_pct:.0f}% Epidemic Surge'}",
                      meta_val)
        ]
    ]
    header_table = Table(header_table_data, colWidths=[480, 240])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    # 2. Executive Summary Metrics Table
    total_recs = len(recommendations)
    total_units = sum(r.get('suggested_quantity', 0) for r in recommendations)
    expiry_salvage_count = sum(1 for r in recommendations if 'EXPIRY SALVAGE' in r.get('reason', '').upper())
    critical_count = sum(1 for r in recommendations if r.get('urgency') == 'Critical')

    summary_box_data = [
        [
            Paragraph("<b>Total Proposed Transfers</b>", meta_label),
            Paragraph("<b>Total Units to Redistribute</b>", meta_label),
            Paragraph("<b>Expiry Salvage Actions</b>", meta_label),
            Paragraph("<b>Critical Urgency Actions</b>", meta_label),
            Paragraph("<b>Procurement Cost Saved</b>", meta_label),
        ],
        [
            Paragraph(f"<font size=12><b>{total_recs} Transfers</b></font>", meta_val),
            Paragraph(f"<font size=12><b>{total_units:,} units</b></font>", meta_val),
            Paragraph(f"<font size=12><b>{expiry_salvage_count} Actions</b></font>", meta_val),
            Paragraph(f"<font size=12 color='#9C3838'><b>{critical_count} Critical</b></font>", meta_val),
            Paragraph("<font size=12 color='#2E5F52'><b>100% Inter-Facility</b></font>", meta_val),
        ]
    ]
    summary_table = Table(summary_box_data, colWidths=[144, 144, 144, 144, 144])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFBF9')),
        ('BOX', (0, 0), (-1, -1), 0.75, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EAEFEA')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 12))

    # 3. Main Recommendations Table
    if total_recs == 0:
        empty_box = [
            [
                Paragraph(
                    "<b>No Transfers Currently Required</b><br/>"
                    "All monitored facilities currently satisfy their safety-stock thresholds, or no donor facility "
                    "holds available surplus stock above its required operational and safety reserves.",
                    subtitle_style
                )
            ]
        ]
        empty_table = Table(empty_box, colWidths=[720])
        empty_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFBF9')),
            ('BOX', (0, 0), (-1, -1), 1, border_color),
            ('PADDING', (0, 0), (-1, -1), 16),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        story.append(empty_table)
    else:
        # Columns add up to 720 pt
        # Rec ID: 55, Medicine: 110, Donor: 115, Recipient: 115, Qty: 60, Urgency: 55, Justification: 210
        table_rows = [
            [
                Paragraph("<b>Rec ID</b>", th_style),
                Paragraph("<b>Medicine</b>", th_style),
                Paragraph("<b>Source (Surplus)</b>", th_style),
                Paragraph("<b>Destination (Deficit)</b>", th_style),
                Paragraph("<b>Proposed Qty</b>", th_style),
                Paragraph("<b>Urgency</b>", th_style),
                Paragraph("<b>Clinical Justification & Constraints</b>", th_style),
            ]
        ]

        for idx, rec in enumerate(recommendations):
            urgency = rec.get('urgency', 'Moderate')
            urgency_color = '#9C3838' if urgency == 'Critical' else ('#8A6020' if urgency == 'High' else '#2E5F52')

            # Expiry tag if applicable
            is_expiry = 'EXPIRY SALVAGE' in rec.get('reason', '').upper()
            expiry_tag = "<br/><font color='#8A6020'><b>[EXPIRY SALVAGE]</b></font>" if is_expiry else ""

            row = [
                Paragraph(f"<b>{rec.get('id', f'REC-{idx+1:04d}')}</b>", cell_bold),
                Paragraph(f"<b>{rec.get('medicine_name', '')}</b>", cell_style),
                Paragraph(
                    f"<b>{rec.get('source_facility_name', '')}</b><br/>"
                    f"<font color='#718078'>Rem: {rec.get('source_stock_remaining', 0):,} ({rec.get('donor_coverage_days_post_transfer', 0):.1f}d)</font>",
                    cell_style
                ),
                Paragraph(
                    f"<b>{rec.get('dest_facility_name', '')}</b><br/>"
                    f"<font color='#718078'>Coverage: {rec.get('dest_days_cover_before', 0):.1f}d → <b>{rec.get('dest_days_cover_after', 0):.1f}d</b></font>",
                    cell_style
                ),
                Paragraph(f"<b>{rec.get('suggested_quantity', 0):,}</b> {rec.get('unit', '')}", cell_bold),
                Paragraph(f"<font color='{urgency_color}'><b>{urgency}</b></font>", cell_style),
                Paragraph(f"{rec.get('reason', '')}{expiry_tag}", cell_reason),
            ]
            table_rows.append(row)

        col_widths = [55, 110, 115, 115, 60, 55, 210]
        recs_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
        recs_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), soft_sage),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('TOPPADDING', (0, 0), (-1, 0), 6),
            ('BOX', (0, 0), (-1, -1), 0.75, border_color),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EAEFEA')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FAFBF9')]),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(recs_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


def generate_inventory_pdf(
    items: List[Dict[str, Any]],
    surge_pct: float = 0.0,
    facility_name: Optional[str] = None,
    category_filter: Optional[str] = None,
    risk_filter: Optional[str] = None,
    generated_at: Optional[datetime] = None,
) -> bytes:
    """
    Generates a hospital-grade, elegant landscape PDF report for clinical inventory and stock valuation.
    Adheres to the gentle clinical palette (#263A35, #397A68, #E8F1EC, #D5DFD9) with landscape layout.
    """
    if generated_at is None:
        generated_at = datetime.now()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Clinical Palette
    primary_color = colors.HexColor('#263A35')
    brand_green = colors.HexColor('#397A68')
    secondary_gray = colors.HexColor('#718078')
    soft_sage = colors.HexColor('#E8F1EC')
    border_color = colors.HexColor('#D5DFD9')

    title_style = ParagraphStyle(
        'DocTitleInv',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color
    )

    subtitle_style = ParagraphStyle(
        'DocSubInv',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=secondary_gray
    )

    meta_label = ParagraphStyle(
        'MetaLabelInv',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=brand_green
    )

    meta_val = ParagraphStyle(
        'MetaValInv',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=primary_color
    )

    th_style = ParagraphStyle(
        'TableHeaderInv',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#2E5F52')
    )

    cell_style = ParagraphStyle(
        'TableCellInv',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=primary_color
    )

    cell_bold = ParagraphStyle(
        'TableCellBoldInv',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        textColor=primary_color
    )

    story = []

    # 1. Header Section
    scope_str = facility_name if facility_name else "All Monitored Network Facilities"
    filter_desc = []
    if category_filter and category_filter != 'All':
        filter_desc.append(f"Category: {category_filter}")
    if risk_filter and risk_filter not in ['All', 'All risks']:
        filter_desc.append(f"Risk: {risk_filter}")
    filter_str = f" &nbsp;|&nbsp; {' · '.join(filter_desc)}" if filter_desc else ""

    header_table_data = [
        [
            Paragraph("<b>MEDICYCLE</b> &nbsp;|&nbsp; Clinical Inventory & Stock Valuation Report", title_style),
            Paragraph(
                f"<b>Report Generated:</b> {generated_at.strftime('%Y-%m-%d %H:%M:%S')}<br/>"
                f"<b>Facility Scope:</b> {scope_str}<br/>"
                f"<b>Demand Surge Setting:</b> {'Baseline (1.0x)' if surge_pct == 0 else f'+{surge_pct:.0f}% Epidemic Surge'}{filter_str}",
                meta_val
            )
        ]
    ]
    header_table = Table(header_table_data, colWidths=[460, 260])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    # 2. Executive Summary Metrics Cards
    total_items = len(items)
    total_units = sum(i.get('current_stock', i.get('current_quantity', 0)) for i in items)
    total_valuation = sum(
        (i.get('current_stock', i.get('current_quantity', 0)) * float(i.get('unit_cost', 0.0)))
        for i in items
    )
    critical_count = sum(
        1 for i in items
        if i.get('stockout_risk_level') == 'Critical' or i.get('risk_status') == 'CRITICAL_SHORTAGE'
    )
    expiry_risk_count = sum(
        1 for i in items
        if i.get('expiry_risk_level') in ['Critical', 'High'] or i.get('risk_status') == 'NEAR_EXPIRY_SALVAGE'
    )

    summary_box_data = [
        [
            Paragraph("<b>Monitored Items / Batches</b>", meta_label),
            Paragraph("<b>Total Units in Stock</b>", meta_label),
            Paragraph("<b>Total Stock Valuation</b>", meta_label),
            Paragraph("<b>Critical Shortages</b>", meta_label),
            Paragraph("<b>Near Expiry Salvage</b>", meta_label),
        ],
        [
            Paragraph(f"<font size=11><b>{total_items} Line Items</b></font>", meta_val),
            Paragraph(f"<font size=11><b>{total_units:,} units</b></font>", meta_val),
            Paragraph(f"<font size=11 color='#2E5F52'><b>${total_valuation:,.2f}</b></font>", meta_val),
            Paragraph(f"<font size=11 color='#9C3838'><b>{critical_count} Critical</b></font>", meta_val),
            Paragraph(f"<font size=11 color='#8A6020'><b>{expiry_risk_count} Urgent Action</b></font>", meta_val),
        ]
    ]
    summary_table = Table(summary_box_data, colWidths=[144, 144, 144, 144, 144])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFBF9')),
        ('BOX', (0, 0), (-1, -1), 0.75, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EAEFEA')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 12))

    # 3. Main Inventory Table
    if total_items == 0:
        empty_box = [
            [
                Paragraph(
                    "<b>No Inventory Records Found</b><br/>"
                    "No clinical inventory records matched the specified facility, category, or risk criteria in the active network database.",
                    subtitle_style
                )
            ]
        ]
        empty_table = Table(empty_box, colWidths=[720])
        empty_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFBF9')),
            ('BOX', (0, 0), (-1, -1), 1, border_color),
            ('PADDING', (0, 0), (-1, -1), 16),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        story.append(empty_table)
    else:
        # Col widths sum to 720: 110 + 140 + 95 + 75 + 75 + 75 + 150 = 720
        table_rows = [
            [
                Paragraph("<b>Facility & Location</b>", th_style),
                Paragraph("<b>Medicine & Category</b>", th_style),
                Paragraph("<b>Stock / Buffer</b>", th_style),
                Paragraph("<b>Coverage (Days)</b>", th_style),
                Paragraph("<b>Stockout Risk</b>", th_style),
                Paragraph("<b>Expiry Risk</b>", th_style),
                Paragraph("<b>Unit Cost & Valuation</b>", th_style),
            ]
        ]

        def get_risk_color(level: str) -> str:
            lvl = str(level).upper()
            if 'CRIT' in lvl:
                return '#9C3838'
            elif 'HIGH' in lvl or 'NEAR' in lvl:
                return '#C25E00'
            elif 'MOD' in lvl or 'WARN' in lvl:
                return '#8A6020'
            return '#2E5F52'

        for item in items:
            fac_name = item.get('facility_name') or item.get('facility_id', 'Unknown Facility')
            fac_type = item.get('facility_type', '')
            med_name = item.get('medicine_name') or item.get('drug_name', 'Unknown')
            category = item.get('category', 'General')
            storage = item.get('storage_condition') or 'Room Temp'
            curr_stock = item.get('current_stock', item.get('current_quantity', 0))
            safety_stock = item.get('safety_stock', 0)
            unit = item.get('unit', 'units')
            days_supply = float(item.get('days_of_supply', item.get('days_to_expiry', 0.0)))
            daily_demand = float(item.get('avg_daily_demand', item.get('daily_consumption', 0.0)))

            stockout_risk = item.get('stockout_risk_level') or item.get('risk_status', 'Low')
            stockout_color = get_risk_color(stockout_risk)

            expiry_risk = item.get('expiry_risk_level') or item.get('expiry_band', 'Low')
            expiry_color = get_risk_color(expiry_risk)

            unit_cost = float(item.get('unit_cost', 0.0))
            valuation = curr_stock * unit_cost

            batch_note = f"<br/><font color='#718078'>Batch: {item['batch_number']}</font>" if item.get('batch_number') else ""

            row = [
                Paragraph(f"<b>{fac_name}</b><br/><font color='#718078'>{fac_type}</font>", cell_style),
                Paragraph(f"<b>{med_name}</b><br/><font color='#718078'>{category} · {storage}</font>{batch_note}", cell_style),
                Paragraph(f"<b>{curr_stock:,}</b> / {safety_stock:,}<br/><font color='#718078'>{unit}</font>", cell_style),
                Paragraph(f"<b>{days_supply:.1f} days</b><br/><font color='#718078'>Demand: {daily_demand:.1f}/d</font>", cell_style),
                Paragraph(f"<font color='{stockout_color}'><b>{stockout_risk}</b></font>", cell_style),
                Paragraph(f"<font color='{expiry_color}'><b>{expiry_risk}</b></font>", cell_style),
                Paragraph(f"<b>${valuation:,.2f}</b><br/><font color='#718078'>${unit_cost:,.2f} / {unit}</font>", cell_style),
            ]
            table_rows.append(row)

        col_widths = [110, 140, 95, 75, 75, 75, 150]
        inv_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
        inv_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), soft_sage),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('TOPPADDING', (0, 0), (-1, 0), 6),
            ('BOX', (0, 0), (-1, -1), 0.75, border_color),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EAEFEA')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FAFBF9')]),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(inv_table)

    doc.build(story, canvasmaker=InventoryNumberedCanvas)
    return buffer.getvalue()

