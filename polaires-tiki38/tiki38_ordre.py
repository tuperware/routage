#!/usr/bin/env python3
"""Add a clear sail-reduction schema to the Tiki 38 workbook."""

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins

PATH = "/home/user/workspace/Tiki38_Polaires.xlsx"

TEAL = "01696F"
INK = "28251D"
MUTED = "7A7974"
SAND = "F4E4C8"
GREY = "E4E2DE"
GREY_INK = "5C5854"
WARN_BG = "F8E6E4"
WARN = "6B2D2D"
PALE = "F7F6F3"
ZEBRA = "E7F2F3"
WHITE = "FFFFFF"
LINE = "D5D1CB"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
none = Border()

font_title = Font(name="Calibri", size=16, bold=True, color=TEAL)
font_sub = Font(name="Calibri", size=11, color=MUTED)
font_section = Font(name="Calibri", size=13, bold=True, color=TEAL)
font_head = Font(name="Calibri", size=11, bold=True, color=WHITE)
font_ink = Font(name="Calibri", size=11, color=INK)
font_ink_b = Font(name="Calibri", size=11, bold=True, color=INK)
font_white_b = Font(name="Calibri", size=11, bold=True, color=WHITE)
font_muted = Font(name="Calibri", size=10, color=MUTED)
font_tag = Font(name="Calibri", size=10, bold=True, color=TEAL)
font_warn = Font(name="Calibri", size=11, bold=True, color=WARN)
font_warn_body = Font(name="Calibri", size=11, color=WARN)
font_input = Font(name="Calibri", size=11, color="1F4E79")

fill_teal = PatternFill("solid", fgColor=TEAL)
fill_sand = PatternFill("solid", fgColor=SAND)
fill_grey = PatternFill("solid", fgColor=GREY)
fill_pale = PatternFill("solid", fgColor=PALE)
fill_warn = PatternFill("solid", fgColor=WARN_BG)
fill_zebra = PatternFill("solid", fgColor=ZEBRA)
fill_white = PatternFill("solid", fgColor=WHITE)

center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left = Alignment(horizontal="left", vertical="center", wrap_text=True)

# Sail-state fills. Haute = up. Risée = reduced. Amenée = down.
STATE = {
    "Haute": (fill_teal, font_white_b),
    "Amenée": (fill_grey, Font(name="Calibri", size=11, bold=True, color=GREY_INK)),
    "Ridée": (fill_sand, font_ink_b),
    "1,5 m": (fill_sand, font_ink_b),
    "3,0 m": (fill_sand, font_ink_b),
    "4,5 m": (fill_sand, font_ink_b),
    "1er rang": (fill_sand, font_ink_b),
    "2e rang": (fill_sand, font_ink_b),
    "3e rang": (fill_sand, font_ink_b),
    "Même cran": (fill_sand, font_ink_b),
    "Réduite": (fill_sand, font_ink_b),
    "non cotée": (fill_pale, font_muted),
}


def apply(cell, value, font, fill, align, border=thin):
    cell.value = value
    cell.font = font
    cell.fill = fill
    cell.alignment = align
    cell.border = border


def chip(ws, row, col, text):
    fill, font = STATE[text]
    apply(ws.cell(row, col), text, font, fill, center)


def main():
    wb = openpyxl.load_workbook(PATH)
    if "Ordre de réduction" in wb.sheetnames:
        del wb["Ordre de réduction"]
    ws = wb.create_sheet("Ordre de réduction", 0)
    ws.sheet_properties.tabColor = TEAL
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 110
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 2
    ws.page_setup.horizontalCentered = True
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.5, bottom=0.5, header=0.2, footer=0.2)
    ws.oddFooter.center.text = "Ordre de travail. Le plan n'imprime pas cette suite."
    ws.oddFooter.center.font = "Calibri"
    ws.oddFooter.center.size = 9

    widths = {"A": 3, "B": 16, "C": 16, "D": 16, "E": 17, "F": 15, "G": 14, "H": 3}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    # Inputs live below the schema. The picture references them.
    # C80 grand-voile, C81 misaine, C82 trinquette, C83 total, C84 light
    # C85 luff, C86/C87/C88 reef heights, C89-C91 remaining GV, C92 route if GV only at reef 3
    inputs = [
        (80, "Grand-voile m²", 20.88, "Écrit. Feuille de stabilité, 20,88. Le tableau de cotes se lisait 20,85."),
        (81, "Misaine m²", 20.70, "Écrit. Plan de voilure, 20,70 m²."),
        (82, "Trinquette m²", 13.04, "Écrit. Feuille de stabilité, 13,04. Pas 15,04."),
        (84, "Light m²", 96.1, "Écrit. 96,1 m² imprimé, nommé light."),
        (85, "Guindant GV m", 7.04, "Écrit. Plan de voilure."),
        (86, "Ris 1 m", 1.5, "Écrit. 1 500 mm au-dessus de la bordure, grand-voile."),
        (87, "Ris 2 m", 3.0, "Écrit. Deuxième bande de 1 500 mm."),
        (88, "Ris 3 m", 4.5, "Écrit. Troisième bande de 1 500 mm."),
    ]
    apply(ws.cell(79, 2), "Chiffres du schéma", font_section, fill_white, left, none)
    apply(ws.cell(79, 3), "Valeur", font_head, fill_teal, center)
    apply(ws.cell(79, 4), "Statut", font_head, fill_teal, center)
    ws.merge_cells("D79:G79")
    for row, label, value, note in inputs:
        apply(ws.cell(row, 2), label, font_ink, fill_zebra, left)
        cell = ws.cell(row, 3, value)
        cell.font = font_input
        cell.fill = fill_zebra
        cell.alignment = center
        cell.border = thin
        cell.number_format = "0.00"
        apply(ws.cell(row, 4), note, font_muted, fill_white, left, none)
        ws.merge_cells(start_row=row, start_column=4, end_row=row, end_column=7)

    apply(ws.cell(83, 2), "Route m²", font_ink_b, fill_pale, left)
    total = ws.cell(83, 3, "=C80+C81+C82")
    total.font = font_ink_b
    total.fill = fill_pale
    total.alignment = center
    total.border = thin
    total.number_format = "0.00"
    apply(ws.cell(83, 4), "Calcul. Doit donner 54,62.", font_muted, fill_white, left, none)
    ws.merge_cells("D83:G83")

    apply(ws.cell(89, 2), "GV après ris 3", font_ink, fill_pale, left)
    gv3 = ws.cell(89, 3, "=C80*(C85-C88)/C85")
    gv3.font = font_ink
    gv3.fill = fill_pale
    gv3.alignment = center
    gv3.border = thin
    gv3.number_format = "0.00"
    apply(
        ws.cell(89, 4),
        "Calcul. Surface au prorata du guindant. Le plan n'imprime pas cette surface.",
        font_muted,
        fill_white,
        left,
        none,
    )
    ws.merge_cells("D89:G89")

    apply(ws.cell(90, 2), "Route, GV seule au 3e ris", font_ink, fill_pale, left)
    only = ws.cell(90, 3, "=C83-C80+C89")
    only.font = font_ink
    only.fill = fill_pale
    only.alignment = center
    only.border = thin
    only.number_format = "0.00"
    apply(
        ws.cell(90, 4),
        "Calcul. Misaine et trinquette encore hautes. C'est le cas « 3 ris GV insuffisants ».",
        font_muted,
        fill_white,
        left,
        none,
    )
    ws.merge_cells("D90:G90")

    # Title
    ws.merge_cells("B2:G2")
    apply(
        ws.cell(2, 2),
        "Ordre de réduction",
        font_title,
        fill_white,
        Alignment(horizontal="left", vertical="center", wrap_text=False),
        none,
    )
    ws.merge_cells("B3:G3")
    apply(
        ws.cell(3, 2),
        "Deux mâts. Le plan n'imprime pas cette suite. Elle garde les deux voiles à corne ensemble, pour ne pas déplacer le centre de poussée.",
        font_sub,
        fill_white,
        left,
        none,
    )
    ws.row_dimensions[2].height = 36
    ws.row_dimensions[3].height = 40

    # Balance
    apply(ws.cell(5, 2), "Équilibre des deux mâts", font_section, fill_white, left, none)
    ws.merge_cells("B5:G5")
    headers = [(3, "Trinquette"), (4, "Misaine"), (5, "Grand-voile"), (6, "Effet sur la barre")]
    apply(ws.cell(6, 2), "", font_head, fill_teal, center)
    for col, text in headers:
        apply(ws.cell(6, col), text, font_head, fill_teal, center)
    ws.merge_cells("F6:G6")
    ws.row_dimensions[6].height = 22

    pictures = [
        (7, "GV seule", "Haute", "Haute", "Ridée", "Centre avance. Le bateau mollit."),
        (9, "Avant seul", "Réduite", "Ridée", "Haute", "Centre recule. Le bateau devient ardent."),
        (11, "Ensemble", "Haute", "Même cran", "Même cran", "Centre entre les deux mâts."),
    ]
    for row, name, stay, fore, main, effect in pictures:
        apply(ws.cell(row, 2), name, font_white_b, fill_teal, center)
        chip(ws, row, 3, stay)
        chip(ws, row, 4, fore)
        chip(ws, row, 5, main)
        apply(ws.cell(row, 6), effect, font_ink, fill_pale, left)
        ws.merge_cells(start_row=row, start_column=6, end_row=row, end_column=7)
        ws.row_dimensions[row].height = 32

    ws.merge_cells("B13:G13")
    apply(
        ws.cell(13, 2),
        "Sur une goélette monocoque, on ride souvent la grand-voile d'abord, à cause de la gîte. Un Tiki gîte peu. Les deux voiles à corne ont presque la même surface : on les ride ensemble.",
        font_ink,
        fill_pale,
        left,
    )
    ws.row_dimensions[13].height = 52

    # Order
    apply(ws.cell(15, 2), "Ordre de travail", font_section, fill_white, left, none)
    ws.merge_cells("B16:G16")
    apply(
        ws.cell(16, 2),
        "Pas un barème de vent. 17,4 / 22,4 nœuds et 21 / 25,3 nœuds sont des stabilités, pas des seuils de ris. Le vent du calcul est dans Comparaison.",
        font_sub,
        fill_white,
        left,
        none,
    )
    ws.row_dimensions[16].height = 44

    apply(ws.cell(17, 2), "Couleur", font_muted, fill_white, left, none)
    chip(ws, 17, 3, "Haute")
    chip(ws, 17, 4, "Ridée")
    chip(ws, 17, 5, "Amenée")
    apply(ws.cell(17, 6), "La couleur est l'état de la voile.", font_muted, fill_white, left, none)
    ws.merge_cells("F17:G17")
    ws.row_dimensions[17].height = 22

    order_heads = ["Cran", "Trinquette", "Misaine", "Grand-voile", "Chute", "m²"]
    for col, text in enumerate(order_heads, 2):
        apply(ws.cell(18, col), text, font_head, fill_teal, center)
    ws.merge_cells("F18:G18")
    # m² sits in F, explanation uses the row below. Keep G as part of chute? 
    # Redesign: chute in F, m² in G. Header row should not merge F:G.
    # Fix below after the loop by unmerging and rewriting. Done after this block.
    ws.unmerge_cells("F18:G18")
    apply(ws.cell(18, 6), "Chute", font_head, fill_teal, center)
    apply(ws.cell(18, 7), "m²", font_head, fill_teal, center)
    ws.row_dimensions[18].height = 22

    steps = [
        # row, name, stay, fore, main, chute, area, tag, sentence
        (19, "0 Portant", "Amenée", "Haute", "Haute", "Haute", "=C84", "Plan",
         "Départ au portant. 96,1 m² est imprimé, nommé light. Trinquette amenée : c'est le calcul du total, pas une phrase."),
        (21, "1 Chute bas", "Haute", "Haute", "Haute", "Amenée", "=C83", "Plan",
         "Amener la chute. Renvoyer la trinquette. Aucun vent n'est écrit pour quitter le light."),
        (23, "2 Ris 1", "Haute", "1er rang", "1,5 m", "Amenée", "non cotée", "Plan",
         "Les deux voiles à corne ensemble. 1,5 m est imprimé sur la grand-voile seulement. Ne pas recopier cette cote sur la misaine."),
        (25, "3 Ris 2", "Haute", "2e rang", "3,0 m", "Amenée", "non cotée", "Un bateau",
         "Les deux ensemble. 3,0 m, grand-voile seulement. Un Tiki 38 a pris un ris dans chaque voile, puis un second. Ce n'est pas un seuil."),
        (27, "4 Ris 3", "Haute", "3e rang", "4,5 m", "Amenée", "non cotée", "Photo",
         "Les deux ensemble. 4,5 m, grand-voile seulement. Trois rangées de points sont visibles sur la misaine, sans cote."),
        (29, "5 Trinquette", "Réduite", "3e rang", "4,5 m", "Amenée", "non cotée", "Plan",
         "Enrouleur, son ris, ou plus petit foc. Le plan donne les trois. La surface du petit foc n'est pas imprimée."),
        (31, "6 Misaine bas", "Réduite", "Amenée", "4,5 m", "Amenée", "non cotée", "Travail",
         "Si encore trop de toile : amener la misaine, garder la grand-voile au 3e ris. Pas dessiné. Le centre ne doit pas avancer."),
    ]
    for row, name, stay, fore, main, chute, area, tag, sentence in steps:
        apply(ws.cell(row, 2), name, font_white_b, fill_teal, center)
        chip(ws, row, 3, stay)
        chip(ws, row, 4, fore)
        chip(ws, row, 5, main)
        chip(ws, row, 6, chute)
        if isinstance(area, str) and area.startswith("="):
            cell = ws.cell(row, 7, area)
            cell.font = font_ink_b
            cell.fill = fill_pale
            cell.alignment = center
            cell.border = thin
            cell.number_format = "0.00"
        else:
            chip(ws, row, 7, area)
        ws.row_dimensions[row].height = 24
        apply(ws.cell(row + 1, 2), tag, font_tag, fill_white, center, none)
        apply(ws.cell(row + 1, 3), sentence, font_ink, fill_pale, left)
        ws.merge_cells(start_row=row + 1, start_column=3, end_row=row + 1, end_column=7)
        ws.row_dimensions[row + 1].height = 52

    apply(ws.cell(33, 2), "Entre les crans", font_section, fill_white, left, none)
    ws.merge_cells("B34:G34")
    apply(
        ws.cell(34, 2),
        "Trop ardent : enrouler un peu la trinquette. Mou : ne pas prendre un ris de grand-voile sans la misaine.",
        font_ink,
        fill_pale,
        left,
    )
    ws.row_dimensions[34].height = 28

    apply(ws.cell(35, 2), "À ne pas faire", font_warn, fill_white, left, none)
    for col, text in ((3, "Trinquette"), (4, "Misaine"), (5, "Grand-voile"), (6, "Chute")):
        apply(ws.cell(36, col), text, font_head, PatternFill("solid", fgColor="8C3A3A"), center)
    apply(ws.cell(36, 2), "", font_head, PatternFill("solid", fgColor="8C3A3A"), center)
    apply(ws.cell(36, 7), "", font_head, PatternFill("solid", fgColor="8C3A3A"), center)
    ws.row_dimensions[36].height = 22
    apply(ws.cell(37, 2), "Faux", font_white_b, PatternFill("solid", fgColor="8C3A3A"), center)
    chip(ws, 37, 3, "Réduite")
    chip(ws, 37, 4, "Haute")
    chip(ws, 37, 5, "Amenée")
    chip(ws, 37, 6, "Amenée")
    apply(ws.cell(37, 7), "mou", font_warn, fill_warn, center)
    ws.row_dimensions[37].height = 24
    ws.merge_cells("B38:G38")
    apply(
        ws.cell(38, 2),
        "Grand-voile amenée, misaine haute : le centre avance, le bateau mollit. Ne pas recopier 1,5 / 3,0 / 4,5 m sur la misaine. Ne pas prendre les nœuds de stabilité comme ordre de ris.",
        font_warn_body,
        fill_warn,
        left,
    )
    ws.row_dimensions[38].height = 56

    ws.merge_cells("B40:G40")
    callout = ws.cell(
        40,
        2,
        '="Si on ne ride que la grand-voile au 3e ris, il reste "&TEXT(C90,"0.00")&" m². Misaine et trinquette encore hautes. Ce n\'est pas l\'ordre."',
    )
    callout.font = font_ink
    callout.fill = fill_pale
    callout.alignment = left
    callout.border = thin
    ws.row_dimensions[40].height = 44

    ws.merge_cells("B42:G42")
    apply(ws.cell(42, 2), "D'où viennent les crans", font_section, fill_white, left, none)
    sources = [
        (43, "Plan", "Grand-voile : trois bandes de 1 500 mm. Misaine : points dessinés, aucune cote. Trinquette : enrouleur, ou un ris, ou un plus petit foc. Light : 96,1 m², sans vent écrit."),
        (44, "Wharram", "L'article du wingsail ne donne pas d'ordre de ris pour le Tiki 38. La phrase sans winch concerne Spirit of Gaia, 44,1 m² par voile, pas ce bateau."),
        (45, "Gleda", "Un Tiki 38, voiles Rolly Tasker : 3 ris sur la misaine et 3 sur la grand-voile. Foc de gros temps 2,60 m². Un bateau. Cette surface n'est pas sur le plan."),
        (46, "Razzle Dazzle", "Un Tiki 38, travers, environ 15 nœuds, surchargé : un ris dans chaque voile, puis un second ris. Un bateau. Pas un seuil pour cette polaire."),
    ]
    for row, tag, text in sources:
        apply(ws.cell(row, 2), tag, font_tag, fill_white, Alignment(horizontal="left", vertical="center", wrap_text=True), none)
        apply(ws.cell(row, 3), text, font_ink, fill_white, left, none)
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=7)
        ws.row_dimensions[row].height = 44

    urls = [
        (48, "https://www.wharram.com/articles/how-we-design/wharram-wingsail-rig/"),
        (49, "https://www.multihulls.uk.com/index.php/wharramcats/1358tiki38"),
        (50, "http://gotouring.com/razzledazzle/tiki/tiki.html"),
    ]
    for row, url in urls:
        apply(ws.cell(row, 2), url, Font(name="Calibri", size=9, color=TEAL), fill_white, left, none)
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=7)
        ws.row_dimensions[row].height = 16

    ws.freeze_panes = None
    ws.auto_filter.ref = None
    ws.print_title_rows = None
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 3
    ws.page_setup.scale = None
    ws.sheet_view.view = "normal"
    ws.sheet_view.zoomScale = 120
    ws.oddHeader.left.text = ""

    # The picture prints on its own. The audit numbers stay on the sheet, below.
    ws.print_area = "A1:G50"
    for col, width in {"A": 3, "B": 18, "C": 18, "D": 18, "E": 18, "F": 16, "G": 16}.items():
        ws.column_dimensions[col].width = width
        ws.column_dimensions[col].bestFit = False

    wb.active = ws
    wb.save(PATH)
    print("saved", PATH, "active", wb.active.title)


if __name__ == "__main__":
    main()
