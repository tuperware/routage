#!/usr/bin/env python3
"""Classeur sourcé : voilure, ris et équilibre du Tiki 38.
Aucune surface de ris ni aucun seuil de vent inventé.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins

OUT = "/home/user/workspace/Tiki38_Polaires.xlsx"

TEAL = "01696F"
INK = "28251D"
MUTED = "7A7974"
WHITE = "FFFFFF"
LINE = "D4D1CA"
SAND = "F0EDE5"
DOC = "E7F2F3"
WARN = "F6E7DC"
WARN_INK = "964219"
CONFLICT = "F8EBD0"

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
fill_conflict = PatternFill("solid", fgColor=CONFLICT)
font_h = Font(name="Calibri", bold=True, color=WHITE, size=11)
font_title = Font(name="Calibri", bold=True, size=16, color=TEAL)
font_sub = Font(name="Calibri", italic=True, size=11, color=MUTED)
font_b = Font(name="Calibri", bold=True, size=11, color=INK)
font_n = Font(name="Calibri", size=11, color=INK)
font_s = Font(name="Calibri", size=10, color=MUTED)
font_warn = Font(name="Calibri", bold=True, size=11, color=WARN_INK)
wrap = Alignment(horizontal="left", vertical="center", wrap_text=True)
wrap_c = Alignment(horizontal="center", vertical="center", wrap_text=True)
left = Alignment(horizontal="left", vertical="center", wrap_text=True)


def setup(ws, widths, landscape=True):
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_margins = PageMargins(left=0.5, right=0.5, top=0.6, bottom=0.6, header=0.2, footer=0.2)
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.column_dimensions["A"].width = 3
    ws.row_dimensions[1].height = 8
    ws.freeze_panes = "B5"
    ws.sheet_view.zoomScale = 110
    ws.oddHeader.left.text = "Tiki 38 — voilure sourcée"
    ws.oddFooter.right.text = "Page &P"
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def title(ws, text, last_col, subtitle=None):
    ws.cell(2, 2, text).font = font_title
    ws.merge_cells(start_row=2, start_column=2, end_row=2, end_column=last_col)
    ws.row_dimensions[2].height = 24
    if subtitle:
        ws.cell(3, 2, subtitle).font = font_sub
        ws.merge_cells(start_row=3, start_column=2, end_row=3, end_column=last_col)
        ws.row_dimensions[3].height = 32


def header_row(ws, row, labels):
    ws.row_dimensions[row].height = 32
    for i, lab in enumerate(labels, start=2):
        c = ws.cell(row, i, lab)
        c.font = font_h
        c.fill = fill_h
        c.alignment = wrap_c
        c.border = thin


def put(ws, row, values, fill=None, fonts=None, heights=36, aligns=None):
    ws.row_dimensions[row].height = heights
    for i, val in enumerate(values, start=2):
        c = ws.cell(row, i, val)
        c.font = (fonts[i - 2] if fonts else font_n)
        c.alignment = (aligns[i - 2] if aligns else wrap)
        c.border = thin
        if fill:
            c.fill = fill
    return row


wb = Workbook()

# ---------------------------------------------------------------------------
# 1. A lire
# ---------------------------------------------------------------------------
ws = wb.active
ws.title = "A lire"
setup(ws, {"B": 28, "C": 88}, landscape=False)
title(
    ws,
    "Tiki 38 — ce que les sources disent, et ce qu'elles ne disent pas",
    3,
    "Goélette à deux mâts. Les cases vides le restent : aucune surface de ris ni aucun seuil de vent n'est publié.",
)
header_row(ws, 5, ["Point", "Statut"])
rows = [
    ("Page officielle Wharram", "Surface totale 573 sq ft / 53,2 m². La page ne nomme pas les voiles, ne dit pas « goélette », et ne donne aucun ris.", fill_doc),
    ("Deux mâts", "Wharram écrit que le gréement à deux mâts a permis les Tiki 36 et Tiki 38. Le plan reproduit nomme Jib, Foresail et Mainsail.", fill_doc),
    ("Trois ris par voile à corne", "Le dessin reproduit montre trois rangées de points de ris sur la misaine et trois sur la grand-voile. Gleda, construite près des plans, a aussi 3 ris sur chaque voile à corne. La surface enlevée par chaque ris n'est écrite nulle part.", fill_doc),
    ("Équilibre publié", "Wharram parle d'un centre de poussée plus bas qu'un mât unique, donc d'une moindre force de chavirage. Il ne publie pas de position du centre, ni l'effet d'un ris sur la barre.", fill_doc),
    ("Seule prise de ris racontée", "Razzle Dazzle : un ris dans chaque voile, puis un second ris. Travers, environ 15 nœuds, bateau trop enfoncé de 6 pouces. Ce n'est pas un barème.", fill_warn),
    ("Ancienne polaire", "Retirée de ce classeur. Elle traitait la prise de ris comme un coefficient unique, sans les deux mâts. Ce n'était pas une mesure.", fill_warn),
]
for i, (a, b, fill) in enumerate(rows):
    put(ws, 6 + i, [a, b], fill=fill, fonts=[font_b, font_n], heights=48)
ws.cell(13, 2, "Règle de lecture").font = font_b
ws.merge_cells("B13:C13")
ws.cell(
    14,
    2,
    "Une case « non publié » n'est pas un oubli. Wharram ne vend pas les cotes du plan de voilure sur la page publique. Les annonces décrivent un bateau, pas le plan. Le forum oldmulti donne des surfaces, mais se contredit d'une page à l'autre et ne cite pas les plans.",
).font = font_n
ws.merge_cells("B14:C14")
ws.row_dimensions[14].height = 48
ws.cell(14, 2).alignment = wrap

# ---------------------------------------------------------------------------
# 2. Officiel
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Officiel")
setup(ws, {"B": 36, "C": 18, "D": 16, "E": 42})
title(ws, "Données publiées par James Wharram Designs", 5, "Source unique : page des plans Tiki 38. Les deux colonnes sont copiées telles quelles, y compris quand elles ne concordent pas.")
header_row(ws, 5, ["Paramètre", "Impérial publié", "Métrique publié", "Remarque"])
official = [
    ("Méthode", "Ply/Glass/Epoxy/Laminate", "identique", "—", None),
    ("Longueur hors tout", "38′", "11,60 m", "—", None),
    ("Bau hors tout", "22′ 4″", "6,20 m", "Les deux colonnes ne concordent pas : 22′ 4″ font 6,81 m, et 6,20 m font 20′ 4″. La page officielle n'arbitre pas.", fill_conflict),
    ("Longueur de flottaison", "31′ 6″", "9,60 m", "—", None),
    ("Tirant d'eau, quille LAR comprise", "2′ 6″", "0,75 m", "—", None),
    ("Poids", "6600 lbs", "3000 kg", "Paire publiée. 6600 lbs font environ 2994 kg ; l'écart est un arrondi de la page, pas une deuxième pesée.", None),
    ("Charge utile", "4400 lbs", "2000 kg", "Paire publiée.", None),
    ("Surface de voilure", "573 sq ft", "53,2 m²", "Total seul. Aucune répartition foc / misaine / grand-voile.", fill_warn),
    ("Nombre de mâts", "non indiqué", "non indiqué", "Absent de cette page.", fill_warn),
    ("Nom du gréement", "non indiqué", "non indiqué", "Le mot goélette n'est pas sur cette page.", fill_warn),
    ("Ris", "non indiqué", "non indiqué", "Aucun barème.", fill_warn),
]
for i, (a, b, c, d, fill) in enumerate(official):
    put(ws, 6 + i, [a, b, c, d], fill=fill or (fill_sand if i % 2 == 0 else None), fonts=[font_b, font_n, font_n, font_n], heights=36, aligns=[wrap, wrap_c, wrap_c, wrap])
ws.cell(18, 2, "URL").font = font_s
ws.cell(18, 3, "https://www.wharram.com/shop/building-plans/tiki38/").font = font_s
ws.merge_cells("C18:E18")

# ---------------------------------------------------------------------------
# 3. Gréement
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Gréement")
setup(ws, {"B": 28, "C": 78})
title(ws, "Gréement : deux mâts, trois voiles de route", 3, "Ce que Wharram écrit, et ce que le plan reproduit montre. Pas une reconstitution.")
header_row(ws, 5, ["Élément", "Ce qui est écrit ou dessiné"])
rig = [
    ("Type", "Soft Wingsail, que Wharram distingue d'une simple voile à corne : poche de guindant autour du mât, petite corne. Article Wharram, 1997, dessins Hanneke Boon.", fill_doc),
    ("Pourquoi deux mâts", "« Two masted rigs have smaller, easier handled sails and lighter gear than single masted rigs. On multihulls they also have, most important, a lower centre of effort than single masted rigs, giving less capsizing force. »", fill_doc),
    ("Lien avec le Tiki 38", "Wharram écrit que ce gréement a permis de dessiner de plus grands Tiki, « like the later TIKI 36 and Tiki 38 ». La page du Tiki 38 elle-même ne répète pas cette phrase.", fill_doc),
    ("Ordre des voiles, avant vers arrière", "Foc, puis misaine sur le mât avant, puis grand-voile sur le mât arrière. Lu sur le plan reproduit légendé Jib / Foresail / Mainsail.", fill_doc),
    ("Ris dessinés", "Trois rangées de points de ris sur la misaine. Trois rangées sur la grand-voile. Pas de rangée de ris dessinée sur le foc de ce plan.", fill_doc),
    ("Cotes sur le dessin", "Aucune. Ni surface, ni hauteur de mât, ni position du centre de poussée.", fill_warn),
    ("Manœuvres d'une Wingsail", "Drisse de gorge, drisse de pic, hale-bas, écoute, réglages de chariot. Liste générale du gréement, pas une procédure Tiki 38.", fill_doc),
    ("Bôme d'origine", "Touch Wood : le plan d'origine tend la voile du mât avant par deux écoutes, sans la bôme que ce propriétaire a ajoutée. C'est une modification, pas le plan.", fill_doc),
    ("Mâts construits", "Les deux existent : bois creux posé sur le pont (plan 123, Noble Masts) et aluminium 140 mm × 4 mm (Gleda) ou 150 mm × 3 mm (Touch Wood). La page officielle ne choisit pas.", fill_conflict),
]
for i, (a, b, fill) in enumerate(rig):
    put(ws, 6 + i, [a, b], fill=fill, fonts=[font_b, font_n], heights=52)

# ---------------------------------------------------------------------------
# 4. Inventaires
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Inventaires")
setup(ws, {"B": 24, "C": 16, "D": 16, "E": 18, "F": 22, "G": 36, "H": 28})
title(ws, "Surfaces citées, source par source", 8, "Ne pas additionner une ligne Gleda avec une ligne de forum. Ce ne sont pas les mêmes voiles mesurées.")
header_row(ws, 5, ["Source", "Misaine", "Grand-voile", "Avant", "Unité publiée", "Statut", "Ce qu'il ne faut pas en faire"])

# Gleda values in m2, sum by formula on a later row. Here each sail is its own row.
inv = [
    ("Officiel, total seul", "—", "—", "573 sq ft / 53,2 m² au total", "paire publiée", "Page des plans", "Ne pas le découper en trois voiles.", fill_doc),
    ("Gleda, misaine à corne", 20.70, "—", "—", "m² (222 sq ft publiés à côté)", "Un bateau, Rolly Tasker, 3 ris", "Pas la cote du plan.", fill_sand),
    ("Gleda, grand-voile à corne", "—", 20.88, "—", "m² (224 sq ft)", "Un bateau, 3 ris", "Pas la cote du plan.", fill_sand),
    ("Gleda, foc de route", "—", "—", 13.04, "m² (140 sq ft), mousquetons", "Un bateau", "Pas un ris : c'est une voile entière.", fill_sand),
    ("Gleda, trinquette", "—", "—", 7.80, "m² (84 sq ft), mousquetons", "Inventaire, usage non dit", "Ne pas la confondre avec les 140 sq ft du forum.", fill_conflict),
    ("Gleda, tourmentin", "—", "—", 2.60, "m² (28 sq ft), 9 oz", "Inventaire", "Voile séparée, pas un ris du foc.", fill_sand),
    ("Forum p. 68, oldmulti", "222 sq ft", "225 sq ft", "foc 140 ; spi 536 ; trinquette 140 « if carried »", "sq ft", "Forum, pas une citation des plans", "Le même auteur écrit ailleurs « ketch », mâts de 30 ft et deux voiles de 225. À écarter.", fill_conflict),
    ("Forum p. 99, même auteur", "573 sq ft au total, goélette à corne Wingsail", "—", "—", "sq ft", "Forum", "Le total colle à l'officiel. La répartition, non.", fill_warn),
    ("Nouvelle-Zélande", "Foresail, surface non donnée", "Main sail, surface non donnée", "No 1 Jib, No 3 Jib, Storm Jib, Spinnaker", "aucune", "Annonce, dite « standard Tiki rig »", "Noms seulement.", fill_sand),
    ("Good Old Boat", "absent", "absent", "Foc et trinquette recopiés à l'identique : 141,4 sq ft. Asymétrique calculé 561 sq ft", "sq ft, en partie calculé", "Base de données, champs dupliqués", "Ne pas s'en servir pour les voiles à corne.", fill_conflict),
]
for i, rowv in enumerate(inv):
    vals, fill = rowv[:-1], rowv[-1]
    put(ws, 6 + i, list(vals), fill=fill, fonts=[font_b, font_n, font_n, font_n, font_n, font_n, font_n], heights=42)

# Auditable sum of the three Gleda working sails
r = 17
ws.cell(r, 2, "Somme Gleda, route").font = font_b
ws.cell(r, 3, "=C7+D8+E9")
ws.cell(r, 3).number_format = '0.00" m²"'
ws.cell(r, 4, "Misaine + grand-voile + foc de route. Formule sur les trois cellules publiées.")
ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=8)
for col in range(2, 9):
    ws.cell(r, col).font = font_b if col == 2 else font_n
    ws.cell(r, col).fill = fill_doc
    ws.cell(r, col).border = thin
    ws.cell(r, col).alignment = wrap
ws.row_dimensions[r].height = 32

r = 18
ws.cell(r, 2, "Écart avec 53,2 m²").font = font_b
ws.cell(r, 3, "=C17-53.2")
ws.cell(r, 3).number_format = '+0.00" m²";-0.00" m²";0'
ws.cell(r, 4, "La garde-robe Gleda n'est pas le total officiel. L'écart ne se « corrige » pas.")
ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=8)
for col in range(2, 9):
    ws.cell(r, col).font = font_b if col == 2 else font_n
    ws.cell(r, col).fill = fill_warn
    ws.cell(r, col).border = thin
    ws.cell(r, col).alignment = wrap
ws.row_dimensions[r].height = 32

# ---------------------------------------------------------------------------
# 5. Configurations
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Configurations")
setup(ws, {"B": 22, "C": 28, "D": 28, "E": 32, "F": 24, "G": 36})
title(ws, "Configurations de voilure attestées", 7, "Chaque ligne est une combinaison réellement nommée. « Non publié » veut dire que la source ne le dit pas.")
header_row(ws, 5, ["Configuration", "Misaine", "Grand-voile", "Avant", "Surface", "Limite de la source"])
configs = [
    ("Plan reproduit, route", "Établie, 3 rangées de ris dessinées", "Établie, 3 rangées de ris dessinées", "Foc établi, pas de ris dessiné", "Non chiffrée sur le dessin", "Dessin de forum, pas les plans payants ouverts.", fill_doc),
    ("Total officiel", "Non nommé", "Non nommé", "Non nommé", "53,2 m² / 573 sq ft", "Ne dit pas quelles voiles composent le total.", fill_warn),
    ("Gleda, route", "20,70 m², 3 ris", "20,88 m², 3 ris", "Foc de route 13,04 m², mousquetons", "54,62 m², somme des trois", "Un jeu de voiles Rolly Tasker, pas le plan.", fill_sand),
    ("Gleda, trinquette à bord", "Non dit si elle reste établie", "Non dit", "Trinquette 7,80 m² présente", "7,80 m² pour cette seule voile", "L'annonce ne dit pas quand on l'envoie.", fill_conflict),
    ("Gleda, tourmentin à bord", "Non dit", "Non dit", "Tourmentin 2,60 m², voile à part", "2,60 m² pour cette seule voile", "Pas décrit comme un ris du foc.", fill_sand),
    ("Annonce NZ, dite standard", "Foresail, surface absente", "Main sail, surface absente", "No 1 Jib ; aussi No 3 Jib, Storm Jib, Spinnaker", "Non publiée", "L'annonce affirme « standard ». Wharram ne le confirme pas sur la page des plans.", fill_sand),
    ("Spi cité au forum", "Non dit", "Non dit", "536 sq ft", "536 sq ft", "oldmulti. Une autre base calcule 561 sq ft pour un asymétrique. Type non tranché.", fill_conflict),
    ("Razzle Dazzle, 1er ris", "Un ris", "Un ris", "Non mentionné", "Non publiée", "Un passage. Travers, ~15 kt, bateau enfoncé de 6 pouces, 11 kt.", fill_warn),
    ("Razzle Dazzle, 2e ris", "Voile non nommée", "Voile non nommée", "Non mentionné", "Non publiée", "« Jim took a second reef ». 8 à 9 kt, mêmes conditions. Pas un barème.", fill_warn),
]
for i, rowv in enumerate(configs):
    vals, fill = rowv[:-1], rowv[-1]
    put(ws, 6 + i, list(vals), fill=fill, fonts=[font_b] + [font_n] * 5, heights=46)

# ---------------------------------------------------------------------------
# 6. Ris et équilibre
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Ris et équilibre")
setup(ws, {"B": 24, "C": 26, "D": 26, "E": 26, "F": 34, "G": 28})
title(ws, "Prise de ris et équilibre", 7, "Schéma limité à ce qui est dessiné ou raconté. Pas de seuil de vent, parce qu'aucun n'est publié pour le Tiki 38.")

ws.cell(5, 2, "Ordre sur le bateau, de l'avant vers l'arrière").font = font_b
ws.merge_cells("B5:G5")
header_row(ws, 6, ["Place", "Voile", "Mât", "Ris dessinés", "Centre de poussée", "Source"])
schema = [
    ("1 — avant", "Foc", "Étai, devant le mât avant", "Aucun sur le plan reproduit", "Le plus avant des trois. Position non cotée.", "Plan légendé Jib"),
    ("2 — milieu", "Misaine", "Mât avant", "3 rangées de points", "Entre le foc et la grand-voile. Position non cotée.", "Plan légendé Foresail"),
    ("3 — arrière", "Grand-voile", "Mât arrière", "3 rangées de points", "Le plus arrière. Position non cotée.", "Plan légendé Mainsail"),
]
for i, vals in enumerate(schema):
    put(ws, 7 + i, list(vals), fill=fill_doc, fonts=[font_b] + [font_n] * 5, heights=36)

ws.cell(11, 2, "Équilibre publié par Wharram — vertical, pas longitudinal").font = font_b
ws.merge_cells("B11:G11")
ws.row_dimensions[11].height = 20
put(
    ws, 12,
    ["Deux mâts", "Voiles plus petites, gréement plus léger", "Centre de poussée plus bas qu'un mât unique", "Moins de force de chavirage", "Aucune cote, aucun bras de levier", "Article Wingsail, phrase citée dans l'onglet Gréement"],
    fill=fill_doc, fonts=[font_b] + [font_n] * 5, heights=48,
)
put(
    ws, 13,
    ["Ce qu'il ne dit pas", "Pas de règle « rider les deux voiles ensemble »", "Pas d'effet sur la barre", "Pas de force 5 ou 6 propre au Tiki 38", "Les chiffres de Spirit of Gaia et du Pahi 63 sont un autre bateau", "Ne pas les recopier ici comme barème Tiki 38"],
    fill=fill_warn, fonts=[font_warn] + [font_n] * 5, heights=48,
)

ws.cell(15, 2, "Réduction réellement décrite sur un Tiki 38").font = font_b
ws.merge_cells("B15:G15")
header_row(ws, 16, ["Étape", "Misaine", "Grand-voile", "Foc", "Équilibre", "Preuve"])
steps = [
    ("Pleine toile dessinée", "Haute", "Haute", "Établi", "Non chiffré", "Plan reproduit", fill_doc),
    ("Premier ris raconté", "Un ris", "Un ris", "Non mentionné", "Les deux voiles à corne sont réduites ensemble dans ce récit. Wharram n'en publie pas la raison.", "Razzle Dazzle, travers, ~15 kt, 11 kt, bateau surchargé", fill_warn),
    ("Second ris raconté", "Non précisé", "Non précisé", "Non mentionné", "Non publié", "Même récit : « a second reef », 8 à 9 kt", fill_warn),
    ("Troisième ris", "Le 3e rang existe sur le dessin et sur les voiles Gleda", "Idem", "Le foc ne se ride pas sur le dessin", "Non publié", "Existence des rangées, pas une procédure", fill_sand),
    ("Foc de gros temps", "Non dit", "Non dit", "On change de voile : tourmentin Gleda 2,60 m², ou Storm Jib NZ sans surface", "Non publié", "Inventaires. Pas l'étape qui suit le 3e ris.", fill_sand),
    ("Spi", "Non dit", "Non dit", "Envoyé à la place du foc, ou en plus : les annonces ne le disent pas", "Non publié", "NZ : présent. Forum : 536 sq ft. Type non tranché.", fill_conflict),
]
for i, rowv in enumerate(steps):
    vals, fill = rowv[:-1], rowv[-1]
    put(ws, 17 + i, list(vals), fill=fill, fonts=[font_b] + [font_n] * 5, heights=48)

ws.cell(24, 2, "Ce récit-là, et rien de plus").font = font_s
ws.merge_cells("B24:G24")
ws.cell(
    25, 2,
    "« We overloaded the boat badly, had it 6 inches too deep in the water, and it still did 11 knots with a reef in each sail. Jim took a second reef and we were still doing 8-9 knots. All of this on a beam reach in about 15 knot winds. » — Jim Richter, Razzle Dazzle. La page ne dit pas dans quelle voile le second ris a été pris.",
).font = font_n
ws.merge_cells("B25:G25")
ws.row_dimensions[25].height = 48
ws.cell(25, 2).alignment = wrap

# ---------------------------------------------------------------------------
# 7. Sources
# ---------------------------------------------------------------------------
ws = wb.create_sheet("Sources")
setup(ws, {"B": 32, "C": 62, "D": 42}, landscape=True)
title(ws, "Sources et limite de chacune", 4, "Contrôlées pour ce classeur. Une annonce n'est pas un plan.")
header_row(ws, 5, ["Source", "Ce qu'elle établit", "Ce qu'elle n'établit pas"])
sources = [
    ("Wharram, plans Tiki 38", "Cotes générales et 573 sq ft / 53,2 m².", "Ni goélette, ni détail des voiles, ni ris. Bau impérial et métrique en conflit."),
    ("Wharram, article Wingsail", "Deux mâts, centre de poussée plus bas, moindre force de chavirage. Tiki 38 cité comme bateau rendu possible par ce gréement.", "Pas de cote Tiki 38. Le ris sans winch concerne Spirit of Gaia, voiles de 44,1 m²."),
    ("Plan reproduit, Boat Design Net, oldmulti, 14 mai 2020", "Deux mâts. Légendes Jib, Foresail, Mainsail. Trois rangées de points de ris sur chaque voile à corne.", "Aucune cote. Ce n'est pas le PDF des plans."),
    ("Gleda, multihulls.uk.com, n° 107", "Surfaces Rolly Tasker et 3 ris sur chaque voile à corne. Foc, trinquette, tourmentin.", "Un bateau « built closely to the plans », pas le tableau officiel."),
    ("Razzle Dazzle, Jim Richter", "Goélette à corne. Un ris dans chaque voile, puis un second ris. 11 kt puis 8-9 kt.", "Un passage, bateau surchargé, pas un barème."),
    ("Annonce Nouvelle-Zélande", "Noms : Main, Foresail, No 1 Jib, No 3 Jib, Storm Jib, Spinnaker.", "Aucune surface. « Standard » est le mot de l'annonce."),
    ("Touch Wood, multihulls.uk.com", "Le plan d'origine tend la voile du mât avant par deux écoutes.", "Bateau modifié. Pas de nombre de ris."),
    ("Good Old Boat, fiche Tiki 38", "Cotes d'un foc et d'un asymétrique, en partie calculées.", "Foc et trinquette identiques : doublon. Pas de voile à corne."),
    ("oldmulti, pages 68, 99 et 111", "Le total 573 sq ft de la page 99 colle à l'officiel.", "Page 68 et page 111 se contredisent sur ketch/goélette, longueur de mât et trinquette. Non retenu comme plan."),
]
for i, vals in enumerate(sources):
    put(ws, 6 + i, list(vals), fill=fill_sand if i % 2 == 0 else None, fonts=[font_b, font_n, font_n], heights=42)

ws.cell(16, 2, "Liens").font = font_b
links = [
    "https://www.wharram.com/shop/building-plans/tiki38/",
    "https://www.wharram.com/articles/how-we-design/wharram-wingsail-rig",
    "https://www.boatdesign.net/threads/multihull-structure-thoughts.62361/page-68",
    "https://www.multihulls.uk.com/index.php/wharramcats/1358tiki38",
    "http://gotouring.com/razzledazzle/tiki/tiki.html",
    "http://wharramcatamaransforsale.blogspot.com/2011/12/tiki-38-in-new-zealand.html",
    "https://goodoldboat.com/saildata/boat/tiki-38/",
]
for i, url in enumerate(links):
    ws.cell(17 + i, 2, url).font = Font(name="Calibri", size=10, color=TEAL)
    ws.merge_cells(start_row=17 + i, start_column=2, end_row=17 + i, end_column=4)

ws.auto_filter.ref = "B5:D14"
ws.freeze_panes = "B6"
ws.page_setup.orientation = "landscape"
ws.print_title_rows = "1:5"
ws.sheet_properties.tabColor = TEAL

for s in wb.worksheets:
    s.page_setup.horizontalCentered = True
    s.sheet_properties.tabColor = TEAL
    s.sheet_view.view = "pageBreakPreview"
    s.sheet_view.view = "normal"
    s.print_options.horizontalCentered = True
    s.page_setup.horizontalCentered = True
    s.oddHeader.left.text = "&B Tiki 38"
    s.oddFooter.left.text = "Sources dans l'onglet Sources. Rien n'est estimé."
    s.oddFooter.right.text = "Page &P"

wb.save(OUT)
print(OUT)
