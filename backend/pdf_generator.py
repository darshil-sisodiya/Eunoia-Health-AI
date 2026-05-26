"""
PDF Health Report Generator
Generates professional medical reports from user health data.
"""

from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, KeepTogether
)
from reportlab.pdfgen import canvas
from datetime import datetime
from io import BytesIO
from typing import List, Dict, Any, Optional
import json


class NumberedCanvas(canvas.Canvas):
    """Custom canvas with page numbers and headers."""
    
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.setFont("Helvetica", 9)
        self.setFillColorRGB(0.5, 0.5, 0.5)
        self.drawRightString(
            7.5 * inch, 0.5 * inch,
            f"Page {self._pageNumber} of {page_count}"
        )
        self.drawString(
            0.75 * inch, 0.5 * inch,
            f"Generated: {datetime.now().strftime('%B %d, %Y')}"
        )


def create_health_report_pdf(
    username: str,
    profile_data: Dict[str, Any],
    ai_summary: str,
    prescriptions: Optional[List[Dict[str, Any]]] = None,
    prescription_ai_summary: Optional[str] = None,
) -> BytesIO:
    """
    Generate a comprehensive health report PDF.
    
    Args:
        username: Patient username
        profile_data: Health profile information
        ai_summary: AI-generated summary from Gemini
        prescriptions: Optional list of prescription data
        prescription_ai_summary: Optional AI summary of prescriptions
        
    Returns:
        BytesIO: PDF file buffer
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=1*inch,
        bottomMargin=1*inch,
    )
    
    # Container for the 'Flowable' objects
    story = []
    
    # Define styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=rl_colors.HexColor('#1E293B'),
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=rl_colors.HexColor('#64748B'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=rl_colors.HexColor('#0F172A'),
        spaceAfter=12,
        spaceBefore=20,
        fontName='Helvetica-Bold'
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=10,
        textColor=rl_colors.HexColor('#334155'),
        spaceAfter=12,
        alignment=TA_JUSTIFY,
        fontName='Helvetica'
    )
    
    label_style = ParagraphStyle(
        'CustomLabel',
        parent=styles['Normal'],
        fontSize=9,
        textColor=rl_colors.HexColor('#64748B'),
        fontName='Helvetica-Bold'
    )
    
    # Title Page
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Health Report", title_style))
    story.append(Paragraph(f"Prepared for: {username}", subtitle_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Report Info Box
    report_date = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    info_data = [
        ['Report Date:', report_date],
        ['Patient:', username],
        ['Report Type:', 'Comprehensive Health Summary'],
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#F1F5F9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), rl_colors.HexColor('#0F172A')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#CBD5E1')),
        ('PADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Health Profile Section
    story.append(Paragraph("Health Profile", heading_style))
    
    profile_items = []
    profile_labels = {
        'sleep_pattern': 'Sleep Pattern',
        'sleep_hours': 'Sleep Hours',
        'hydration_level': 'Hydration Level',
        'stress_level': 'Stress Level',
        'exercise_frequency': 'Exercise Frequency',
        'diet_type': 'Diet Type'
    }
    
    for key, label in profile_labels.items():
        value = profile_data.get(key, 'N/A')
        if isinstance(value, str):
            value = value.replace('_', ' ').title()
        elif isinstance(value, (int, float)):
            value = f"{value} hours" if 'hours' in key else str(value)
        profile_items.append([label + ':', str(value)])
    
    profile_table = Table(profile_items, colWidths=[2*inch, 4*inch])
    profile_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#F8FAFC')),
        ('TEXTCOLOR', (0, 0), (-1, -1), rl_colors.HexColor('#0F172A')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#E2E8F0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(profile_table)

    # Prescriptions section
    if prescriptions:
        story.append(PageBreak())
        story.append(Paragraph("Prescriptions & Medication Analysis", heading_style))
        
        # Process each prescription as a separate card for better readability
        for idx, p in enumerate(prescriptions, 1):
            med = p.get('medication_name') or p.get('medications') or 'Unknown'
            if isinstance(med, (list, dict)):
                try:
                    med = json.dumps(med)
                except:
                    med = str(med)
            
            med = str(med)
            dosage = str(p.get('dosage') or '-')
            frequency = str(p.get('frequency') or '-')
            timing = str(p.get('timing') or '-')
            purpose = str(p.get('purpose') or '-')
            
            # Wrap everything in Paragraphs for proper text wrapping
            pres_data = [
                [Paragraph('<b>Medication:</b>', body_style), Paragraph(med, body_style)],
                [Paragraph('<b>Dosage:</b>', body_style), Paragraph(dosage, body_style)],
                [Paragraph('<b>Frequency:</b>', body_style), Paragraph(frequency, body_style)],
                [Paragraph('<b>Timing:</b>', body_style), Paragraph(timing, body_style)],
                [Paragraph('<b>Purpose:</b>', body_style), Paragraph(purpose, body_style)],
            ]
            
            pres_table = Table(pres_data, colWidths=[1.3*inch, 4.7*inch])
            pres_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#FEF3C7')),
                ('TEXTCOLOR', (0, 0), (-1, -1), rl_colors.HexColor('#0F172A')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#E2E8F0')),
                ('PADDING', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [rl_colors.white, rl_colors.HexColor('#FFF7ED')]),
            ]))
            story.append(pres_table)
            story.append(Spacer(1, 0.12*inch))
            
            # Add brief side effects or key notes only
            side_effects = p.get('side_effects') or ''
            if side_effects:
                side_effects_clean = str(side_effects).replace('*', '').replace('#', '').strip()
                # Limit to 200 characters for brevity
                if len(side_effects_clean) > 200:
                    side_effects_clean = side_effects_clean[:200] + '...'
                notes_para = Paragraph(f"<b>Key Notes:</b> {side_effects_clean}", body_style)
                story.append(notes_para)
                story.append(Spacer(1, 0.1*inch))

        # Prescription AI summary (brief overview only)
        if prescription_ai_summary:
            story.append(Spacer(1, 0.15*inch))
            story.append(Paragraph("Medication Summary", heading_style))
            pres_ai_text_clean = str(prescription_ai_summary).replace('*', '').replace('#', '').strip()
            # Limit summary to 400 characters
            if len(pres_ai_text_clean) > 400:
                pres_ai_text_clean = pres_ai_text_clean[:400] + '...'
            story.append(Paragraph(pres_ai_text_clean, body_style))
            story.append(Spacer(1, 0.15*inch))

    story.append(PageBreak())
    
    # AI Summary Section
    story.append(Paragraph("AI Health Analysis", heading_style))
    ai_summary_cleaned = ai_summary.replace('*', '').replace('#', '')
    story.append(Paragraph(ai_summary_cleaned, body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Disclaimer
    story.append(PageBreak())
    story.append(Paragraph("Important Disclaimer", heading_style))
    disclaimer_text = """
    This health report is generated based on self-reported data and AI analysis. 
    It is intended for informational purposes only and should not be considered as 
    professional medical advice, diagnosis, or treatment. Always consult with a 
    qualified healthcare provider for medical advice and before making any decisions 
    about your health or treatment.
    
    The information in this report represents patterns and insights derived from 
    logged data and should be reviewed with your healthcare provider for accurate 
    medical interpretation.
    """
    story.append(Paragraph(disclaimer_text, body_style))
    
    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    
    buffer.seek(0)
    return buffer
