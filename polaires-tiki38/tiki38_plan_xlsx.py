#!/usr/bin/env python3
"""Classeur Tiki 38 à partir des feuilles de plan photographiées.
Les chiffres incertains restent marqués. Aucun seuil de vent inventé.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.page import PageMargins
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import DataPoint
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.fill import PatternFillProperties, ColorChoice
from openpyxl.chart.legend import Legend

OUT = "/home/user/workspace/Tiki38_Polaires.xlsx"

TEAL = "01696F"
INK = "28251D"
MUTED = "7A7974"
WHITE = "FFFFFF"
LINE = "D4D1CA"
SAND = "F0EDE5"
DOC = "E7F2F3"
WARN = "F6E7DC"
GOLD = "F8EBD0"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
fill_h = PatternFill("solid", fgColor=TEAL)
fill_sand = PatternFill("solid", fgColor=SAND)
fill_doc = PatternFill("solid", fgColor=DOC)
fill_warn = PatternFill("solid", fgColor=WARN)
fill_gold = PatternFill("solid", fgColor=GOLD)
font_h = Font(name="Calibri", bold=True, color=WHITE, size=11)
font_title = Font(name="Calibri", bold=True, size=16, color=TEAL)
font_sub = Font(name="Calibri", size=11, color=MUTED)
font_b = Font(name="Calibri", bold=True, size=11, color=INK)
font_n = Font(name="Calibri", size=11, color=INK)
font_s = Font(name="Calibri", size=10, color=MUTED)
wrap = Alignment(wrap_text=True, vertical="center", horizontal="left")
wrap_c = Alignment(wrap_text=True, vertical="center", horizontal="center")


def setup(ws, widths):
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_margins = PageMargins(left=0.45, right=0.45, top=0.55, bottom=0.5)
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.sheet_properties.tabColor = TEAL
    ws.page_setup.horizontalCentered = True
    ws.oddFooter.left.text = "Lu sur les feuilles photographiées. Rien n'est estimé."
    ws.oddFooter.right.text = "Page &P"
    ws.column_dimensions["A"].width = 3
    ws.row_dimensions[1].height = 8
    ws.freeze_panes = "B5"
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def title(ws, text, last, sub):
    ws.cell(2, 2, text).font = font_title
    ws.merge_cells(start_row=2, start_column=2, end_row=2, end_column=last)
    ws.row_dimensions[2].height = 24
    ws.cell(3, 2, sub).font = font_sub
    ws.cell(3, 2).alignment = wrap
    ws.merge_cells(start_row=3, start_column=2, end_row=3, end_column=last)
    ws.row_dimensions[3].height = 32


def header(ws, row, labels):
    ws.row_dimensions[row].height = 30
    for i, lab in enumerate(labels, 2):
        c = ws.cell(row, i, lab)
        c.font = font_h
        c.fill = fill_h
        c.alignment = wrap_c
        c.border = thin


def put(ws, row, vals, fill=None, h=34, bold0=True):
    ws.row_dimensions[row].height = h
    for i, val in enumerate(vals, 2):
        c = ws.cell(row, i, val)
        c.font = font_b if (bold0 and i == 2) else font_n
        c.alignment = wrap_c if i > 2 else wrap
        c.border = thin
        if fill:
            c.fill = fill
    return row


wb = Workbook()

# ----- A lire -----
ws = wb.active
ws.title = "A lire"
setup(ws, {"B": 32, "C": 78})
title(
    ws,
    "Tiki 38 — lu sur les feuilles de plan",
    3,
    "Trois photos des plans. Les plis cachent une partie des annotations de ris. Ces cases restent vides.",
)
header(ws, 5, ["Constat", "Conséquence pour le tableau"])
items = [
    ("La page web dit 53,2 m²", "La feuille de plan dit 54,62 m² pour le gréement de route. Les deux chiffres sont conservés. Ils ne sont pas moyennés.", fill_gold),
    ("Trois voiles de route", "Grand-voile, misaine, trinquette. Deux mâts. Le foc de la page web n'est pas le nom écrit sur cette feuille : c'est staysail.", fill_doc),
    ("Deux configurations chiffrées", "Working rig, 54,62 m². Light off the wind, 96,1 m². Le plan ne détaille pas la seconde en mots. L'arithmétique est dans l'onglet Configurations, marquée comme calcul.", fill_doc),
    ("Équilibre chiffré", "Le plan donne la hauteur du centre de poussée : 5,9 m, et la stabilité calculée par Wharram pour ce gréement de route. Pas pour chaque ris.", fill_doc),
    ("Ris", "REEF 1 est lisible sur la grand-voile. Le reste des étiquettes est dans les plis. Aucune surface de ris n'est imprimée. Aucun seuil de vent non plus.", fill_warn),
    ("Ancienne polaire", "Retirée. Elle ne venait pas de ces feuilles.", fill_warn),
]
for i, (a, b, fill) in enumerate(items):
    put(ws, 6 + i, [a, b], fill=fill, h=40)
    ws.cell(6 + i, 3).alignment = wrap

# ----- Cotes -----
ws = wb.create_sheet("Cotes du plan")
setup(ws, {"B": 28, "C": 14, "D": 14, "E": 14, "F": 14, "G": 18, "H": 36})
title(
    ws,
    "Sailplan — dimensions and areas",
    8,
    "Tableau de la feuille photographiée. Guindant de la trinquette : le chiffre du milieu n'est pas sûr.",
)
header(ws, 5, ["Voile", "Guindant m", "Chute m", "Bordure m", "Têtière m", "Surface m²", "Lecture"])
# values placed so formulas can audit the total
# B6 mainsail names, C6 luff etc.
rows_spec = [
    (6, "Grand-voile", 7.04, 8.17, 3.52, 2.50, 20.85, "Lisible. 230 ft² à côté sur la feuille."),
    (7, "Misaine", 7.46, 8.07, 3.34, 2.41, 20.70, "Lisible. 228 ft² à côté sur la feuille."),
    (8, "Trinquette", None, 7.67, 3.43, None, None, "Chute et bordure lisibles. Guindant : 8,35 ou 8,55. Surface : le total impose 13,07 si les deux autres sont exacts. La photo peut se lire 13,04."),
]
for r, name, luff, leach, foot, head, area, note in rows_spec:
    put(ws, r, [name, luff, leach, foot, head, area, note], fill=fill_sand if r != 8 else fill_warn, h=48)
    for col in (3, 4, 5, 6, 7):
        if ws.cell(r, col).value is not None:
            ws.cell(r, col).number_format = "0.00"
    ws.cell(r, 8).alignment = wrap

# staysail area by formula from published total
ws["C8"] = None
ws["G8"] = "=G10-G6-G7"
ws["G8"].number_format = "0.00"
ws["G8"].font = font_b

put(ws, 9, ["Chute de croisière", None, None, None, None, None, "Fourchette lue 54,5 à 56,3 m², avec 600 à 625 ft² à côté. Le haut de fourchette est moins net que le bas."], fill=fill_gold, h=40)
ws["G9"] = 54.5
ws["G9"].number_format = '0.0" bas"'

put(ws, 10, ["Working rig total", None, None, None, None, 54.62, "Imprimé sur la feuille, avec 600 ft². Ce n'est pas 53,2 m²."], fill=fill_doc, h=36)
ws["G10"].number_format = "0.00"
put(ws, 11, ["Light off the wind", None, None, None, None, 96.1, "Imprimé. 1058 ft² à côté, cohérent avec leur conversion d'environ 11 ft² par m²."], fill=fill_doc, h=36)
ws["G11"].number_format = "0.00"

put(ws, 13, ["Contrôle", None, None, None, None, None, "Somme grand-voile + misaine + trinquette calculée. Doit égaler 54,62."], fill=fill_doc, h=32)
ws["G13"] = "=G6+G7+G8"
ws["G13"].number_format = "0.00"
ws["G13"].font = font_b

put(ws, 14, ["Page web Wharram", None, None, None, None, 53.2, "573 sq ft / 53,2 m². Autre document. Non mélangé au plan."], fill=fill_gold, h=32)
ws["G14"].number_format = "0.00"
put(ws, 15, ["Écart plan moins web", None, None, None, None, None, "Le plan de route est plus grand que le chiffre de la page publique."], fill=fill_warn, h=32)
ws["G15"] = "=G10-G14"
ws["G15"].number_format = '+0.00" m²";-0.00" m²"'
ws["G15"].font = font_b

# ----- Configurations -----
ws = wb.create_sheet("Configurations")
setup(ws, {"B": 32, "C": 14, "D": 14, "E": 14, "F": 16, "G": 16, "H": 42}) 
title(
    ws,
    "Configurations écrites sur le plan",
    8,
    "Working rig est imprimé. La composition du light rig est un calcul sur les totaux du plan, pas une phrase imprimée.",
)
header(ws, 5, ["Configuration", "Grand-voile", "Misaine", "Trinquette", "Chute", "Total m²", "Statut"])
put(ws, 6, ["Working rig", "='Cotes du plan'!G6", "='Cotes du plan'!G7", "='Cotes du plan'!G8", 0, "=C6+D6+E6+F6", "Imprimé : trois voiles. Le total calculé doit donner 54,62."], fill=fill_doc, h=36)
put(ws, 7, ["Light, calcul", "='Cotes du plan'!G6", "='Cotes du plan'!G7", 0, "='Cotes du plan'!G11-C7-D7", "=C7+D7+E7+F7", "La chute est 96,1 moins les deux voiles à corne. La trinquette est à zéro. Ce n'est pas écrit en toutes lettres."], fill=fill_gold, h=52)
put(ws, 8, ["Light imprimé", None, None, None, None, "='Cotes du plan'!G11", "96,1 m² sur la feuille. La ligne du dessus doit tomber sur le même total."], fill=fill_sand, h=36)
for r in (6, 7, 8):
    for col in range(3, 8):
        cell = ws.cell(r, col)
        if isinstance(cell.value, str) and str(cell.value).startswith("="):
            cell.number_format = "0.00"
        elif isinstance(cell.value, (int, float)):
            cell.number_format = "0.00"
    ws.cell(r, 8).alignment = wrap

put(ws, 10, ["Trinquette sur enrouleur", "haute", "haute", "enroulée en partie", "non envoyée", "non chiffré", "Drisse interne recommandée si roller reefing. Feuille des ferrures."], fill=fill_sand, h=40)
put(ws, 11, ["Trinquette à mousquetons", "haute", "haute", "entière, ou un ris", "non envoyée", "non chiffré", "Drisse externe plus sûre pour un hâlage répété au large. Même feuille."], fill=fill_sand, h=40)
put(ws, 12, ["Second foc plus petit", "haute", "haute", "autre voile", "non envoyée", "non chiffré", "Alternative écrite sur le plan de voilure. Surface absente du tableau."], fill=fill_warn, h=40)
put(ws, 13, ["Drisse de spi", "non dit", "non dit", "non dit", "non identifiée à la chute", "non chiffré", "Bout opposé de la poutre 2, ou pied du mât. Le tableau parle de cruiser chute, pas de spi."], fill=fill_gold, h=44)
for r in range(10, 14):
    ws.cell(r, 8).alignment = wrap

# ----- Equilibre -----
ws = wb.create_sheet("Équilibre")
setup(ws, {"B": 34, "C": 22, "D": 22, "E": 48})
title(
    ws,
    "Centre de poussée et stabilité, feuille du plan",
    5,
    "Formule citée sur la feuille : article Catamaran Stability, J. Wharram et H. Boon. L'initiale de Boon est peu nette sur la photo.",
)
header(ws, 5, ["Donnée", "Léger", "Chargé", "Note"])
eq = [
    ("Poids", "3000 kg / 6600 lbs", "5000 kg / 11000 lbs", "Imprimé. Le chargé des plans est 5000 kg, pas une estimation."),
    ("Écart des coques, axe à axe", "4,6 m / 15 ft", "identique", "C-C beam."),
    ("Surface prise dans la formule", "54,6 m² / 600 ft²", "identique", "Le tableau dit 54,62. La formule arrondit à 54,6."),
    ("Hauteur du centre de poussée", "5,9 m / 19,3 ft", "identique", "Une seule hauteur, pour le working rig. Pas une hauteur par ris."),
]
for i, vals in enumerate(eq):
    put(ws, 6 + i, list(vals), fill=fill_doc if i % 2 == 0 else fill_sand, h=36)
    ws.cell(6 + i, 5).alignment = wrap

header(ws, 11, ["Résultat imprimé", "Léger", "Chargé", "Note"])
put(ws, 12, ["Stabilité statique", "28,9 nœuds", "37,4 nœuds", "14 × racine de (W × demi-écart) / (surface × hauteur du centre)."], fill=fill_doc, h=40)
put(ws, 13, ["Stabilité dynamique", "17,4 nœuds", "22,4 nœuds", "Imprimé comme statique × 0,6. Le mot Force est peu lisible. 17,4 nœuds est un force 5, 22,4 un force 6, sur l'échelle Beaufort. Ce rapprochement n'est pas une phrase recopiée."], fill=fill_warn, h=48)
ws.cell(13, 5).alignment = wrap

ws.cell(15, 2, "Ce que cette feuille ne calcule pas").font = font_b
ws.merge_cells("B15:E15")
put(ws, 16, ["Après un ris", "non calculé", "non calculé", "La hauteur 5,9 m et les 54,6 m² sont celles du gréement de route entier."], fill=fill_warn, h=36)
put(ws, 17, ["Au portant sous chute", "non calculé", "non calculé", "Le light rig de 96,1 m² n'entre pas dans la formule imprimée."], fill=fill_warn, h=36)
put(ws, 18, ["Effet sur la barre", "non indiqué", "non indiqué", "Le plan donne un centre plus ou moins haut, pas un déplacement avant-arrière quand on ride une seule voile."], fill=fill_warn, h=40)

# ----- Ris -----
ws = wb.create_sheet("Ris")
setup(ws, {"B": 28, "C": 34, "D": 34, "E": 40})
title(
    ws,
    "Prise de ris — seulement le texte lisible",
    5,
    "Photo pliée. REEF 1 est net sur la grand-voile. Je ne compte pas les rangées que le pli empêche de lire.",
)
header(ws, 5, ["Élément", "Ce qui est lisible", "Surface restante", "Source sur la photo"])
ris = [
    ("Grand-voile, reef 1", "Étiquette REEF 1 lisible sur la voile.", "Non imprimée", "Plan de voilure", fill_doc),
    ("Grand-voile, reefs suivants", "Non lisibles à travers les plis. Ne pas écrire 2 ou 3.", "Non imprimée", "Même photo", fill_warn),
    ("Misaine", "Le nom FORES AIL est lisible. Aucune étiquette REEF n'est lisible sur cette photo.", "Non imprimée", "Même photo", fill_warn),
    ("Trinquette, enrouleur", "Drisse interne recommandée si roller reefing.", "Non chiffrée", "Feuille des ferrures", fill_doc),
    ("Trinquette, mousquetons", "Drisse externe plus sûre pour un hâlage répété, navigation hauturière.", "Non chiffrée", "Feuille des ferrures", fill_doc),
    ("Second foc", "Le plan de voilure prévoit cette alternative au ris de trinquette. Surface absente du tableau.", "Non imprimée", "Note de la trinquette, pli compris", fill_gold),
    ("Ordre de réduction", "Non imprimé. Rien ne dit de rider les deux voiles à corne ensemble, ni laquelle en premier.", "—", "Absence sur les trois feuilles", fill_warn),
    ("Seuil de vent", "Non imprimé. Les 17,4 et 22,4 nœuds sont une stabilité, pas un barème de ris.", "—", "Feuille de stabilité", fill_warn),
]
for i, rowv in enumerate(ris):
    vals, fill = rowv[:-1], rowv[-1]
    put(ws, 6 + i, list(vals), fill=fill, h=40)
    ws.cell(6 + i, 3).alignment = wrap
    ws.cell(6 + i, 5).alignment = wrap

ws.cell(15, 2, "Ferrures qui concernent l'envoi, pas la vitesse").font = font_b
ws.merge_cells("B15:E15")
notes = [
    "Drisses de pic et de gorge : clutch, réas, puis winch.",
    "Drisse de spi : bout opposé de la poutre 2, ou pied de mât.",
    "Quand la drisse n'est pas en service, les deux bouts se frappent sur le liston pour ne pas troubler l'air sur le guindant de misaine.",
    "Écoute de grand-voile : palan 4:1 sur le pont central. Le détail est renvoyé à une autre feuille, absente de ces trois photos.",
]
for i, t in enumerate(notes):
    ws.cell(16 + i, 2, t).font = font_n
    ws.merge_cells(start_row=16 + i, start_column=2, end_row=16 + i, end_column=5)
    ws.row_dimensions[16 + i].height = 22

wb.save(OUT)
print(OUT)
