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

from profile_context import _CONTROL_LABELS, _DURATION_LABELS, _TREATMENT_LABELS

_ONSET_LABELS = {'lt_50': 'before 50', '50_70': 'age 50-70', 'gt_70': 'after 70'}


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


def _bmi(height_cm: Any, weight_kg: Any) -> Optional[float]:
    """BMI, or None when either input is missing or unusable."""
    try:
        h = float(height_cm)
        w = float(weight_kg)
    except (TypeError, ValueError):
        return None
    if h <= 0:
        return None
    return w / ((h / 100.0) ** 2)


def create_health_report_pdf(
    username: str,
    profile_data: Dict[str, Any],
    ai_summary: str,
    prescriptions: Optional[List[Dict[str, Any]]] = None,
    prescription_ai_summary: Optional[str] = None,
    clinical: Optional[Dict[str, Any]] = None,
) -> BytesIO:
    """
    Generate a comprehensive health report PDF.

    Args:
        username: Patient username
        profile_data: Health profile information
        ai_summary: AI-generated summary from Gemini
        prescriptions: Optional list of prescription data
        prescription_ai_summary: Optional AI summary of prescriptions
        clinical: Optional bundle from `profile_context.load_full_profile`,
            supplying the conditions, medications, allergies, vitals, family
            history and risk assessment. Without it the report is a lifestyle
            summary rather than something a doctor can act on.

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
    # This table used to render six lifestyle fields, two of which were
    # hardcoded constants, which made it close to useless as a doctor handoff.
    # The caller already passes the whole health_profiles row, so the fix is
    # simply to name the columns that matter clinically.
    profile_labels = {
        'age': 'Age',
        'gender': 'Gender',
        'height': 'Height (cm)',
        'weight': 'Weight (kg)',
        'blood_group': 'Blood Group',
        'smoking': 'Smoking',
        'smokeless_tobacco': 'Smokeless Tobacco',
        'alcohol': 'Alcohol',
        'exercise_frequency': 'Exercise Frequency',
        'exercise_minutes_per_week': 'Exercise (min/week)',
        'sleep_pattern': 'Sleep Pattern',
        'sleep_hours': 'Sleep Hours',
        'stress_level': 'Stress Level',
        'diet_type': 'Diet Type',
        'hydration_level': 'Hydration Level',
    }

    for key, label in profile_labels.items():
        value = profile_data.get(key)
        # Distinguish "not recorded" from a real answer. Printing 'N/A' for a
        # value we never asked for is the honest rendering; inventing one is not.
        if value is None or value == '':
            value = 'Not recorded'
        elif isinstance(value, str):
            value = value.replace('_', ' ').title()
        else:
            value = str(value)
        profile_items.append([label + ':', str(value)])

    bmi = _bmi(profile_data.get('height'), profile_data.get('weight'))
    if bmi is not None:
        profile_items.append(['BMI:', f'{bmi:.1f}'])

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

    # ---- Clinical sections. ------------------------------------------------
    # These are the parts a doctor actually needs and the report never had:
    # what the patient has been diagnosed with and for how long, what they
    # take, what they react to, and their latest numbers.
    if clinical:
        def _table(title: str, rows: List[List[str]], empty: str) -> None:
            story.append(Spacer(1, 0.22 * inch))
            story.append(Paragraph(title, heading_style))
            data = rows if rows else [[empty, '']]
            table = Table(data, colWidths=[2.4 * inch, 3.6 * inch])
            table.setStyle(TableStyle([
                ('TEXTCOLOR', (0, 0), (-1, -1), rl_colors.HexColor('#0F172A')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#E2E8F0')),
                ('PADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(table)

        _table(
            'Diagnosed Conditions',
            [[str(c.get('name', '')),
              '{0}, {1}, {2}'.format(
                  _DURATION_LABELS.get(c.get('diagnosed_bucket'), 'duration unknown'),
                  _CONTROL_LABELS.get(c.get('control'), 'control unknown'),
                  _TREATMENT_LABELS.get(c.get('treatment'), 'untreated'))]
             for c in (clinical.get('conditions') or [])],
            'None recorded',
        )

        _table(
            'Current Medications',
            [[str(m.get('name', '')),
              ', '.join(filter(None, [
                  str(m.get('dose') or ''),
                  str(m.get('frequency') or '').upper(),
                  ('for ' + str(m['for_condition'])) if m.get('for_condition') else '',
              ])) or 'no detail recorded']
             for m in (clinical.get('medications') or [])],
            'None recorded',
        )

        # Allergies carry a severity marker because this is the line a
        # prescriber is most likely to scan for.
        _table(
            'Allergies',
            [[str(a.get('allergen', '')),
              '{0} allergy{1}'.format(
                  str(a.get('category', 'other')),
                  (', reaction: ' + str(a['reaction']).replace('_', ' '))
                  if a.get('reaction') else '')]
             for a in (clinical.get('allergies') or [])],
            'None recorded',
        )

        vitals = clinical.get('vitals') or {}
        vital_labels = [
            ('systolic_mmhg', 'Blood pressure systolic (mmHg)'),
            ('diastolic_mmhg', 'Blood pressure diastolic (mmHg)'),
            ('fasting_glucose_mgdl', 'Fasting glucose (mg/dL)'),
            ('hba1c_percent', 'HbA1c (%)'),
            ('total_cholesterol_mgdl', 'Total cholesterol (mg/dL)'),
            ('hdl_mgdl', 'HDL (mg/dL)'),
            ('ldl_mgdl', 'LDL (mg/dL)'),
            ('triglycerides_mgdl', 'Triglycerides (mg/dL)'),
            ('resting_hr_bpm', 'Resting heart rate (bpm)'),
            ('waist_cm', 'Waist (cm)'),
        ]
        _table(
            'Recent Vitals',
            [[label, str(vitals[key])] for key, label in vital_labels
             if vitals.get(key) is not None],
            'No measurements recorded',
        )

        family_rows = {}
        for f in (clinical.get('family_history') or []):
            cond = str(f.get('condition', ''))
            rel = str(f.get('relation') or '').strip() or 'relation not specified'
            onset = f.get('onset_bucket')
            if onset and onset != 'unknown':
                rel += ' (onset ' + _ONSET_LABELS.get(onset, str(onset)) + ')'
            family_rows.setdefault(cond, []).append(rel)
        _table(
            'Family History',
            [[cond, '; '.join(rels)] for cond, rels in sorted(family_rows.items())],
            'None recorded',
        )

        report = clinical.get('latest_report') or {}
        if report:
            rows = [
                ['Risk score', '{0}/100 ({1})'.format(
                    report.get('risk_score'), report.get('risk_level'))],
                ['Wellness score', '{0}/100'.format(report.get('wellness_score'))],
            ]
            confidence = report.get('confidence')
            if isinstance(confidence, dict) and confidence.get('confidence') is not None:
                rows.append(['Assessment confidence', '{0}%'.format(confidence['confidence'])])
                missing = [str(m.get('label')) for m in (confidence.get('missing') or [])]
                if missing:
                    rows.append(['Not yet assessed', ', '.join(missing)])
            _table('Risk Assessment', rows, 'Not yet assessed')

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
