# Routage

Logiciel de routage météo simple et gratuit : on pose le départ et l'arrivée sur la carte, on choisit le modèle météo, et la route se calcule.

Site : https://routage.pplx.app

Copyright (C) 2026 Tup. Logiciel libre sous licence GNU GPL version 3 (fichier LICENSE). Vous pouvez l'utiliser, le modifier et le partager ; toute version modifiée diffusée doit rester sous la même licence, avec son code source.

## Contenu

- `site/` : l'application (HTML, CSS, JavaScript, sans serveur). Pour l'essayer en local : `cd site && python3 -m http.server`, puis ouvrir http://localhost:8000
- `android/` : appli Android (Capacitor) qui ouvre le site. La clé de signature n'est pas fournie : utilisez la vôtre (variables ROUTAGE_KEYSTORE, ROUTAGE_KEYSTORE_PASSWORD, ROUTAGE_KEY_ALIAS, ROUTAGE_KEY_PASSWORD).
- `windows/` : appli Windows (Electron) qui ouvre le site.
- `polaires-tiki38/` : polaires du Tiki 38 et scripts qui les produisent.

## Données utilisées (chacune garde sa licence)

- Vent, vagues, courant : Open-Meteo (Météo-France, ECMWF, DWD, NOAA…)
- Fond de carte et côtes : OpenStreetMap, OpenFreeMap / OpenMapTiles, Natural Earth
- Balises : OpenSeaMap ; fonds et dangers : © Open Waters: Seascape (CC BY 4.0)
- Carte littorale : SHOM-IGN via Géoportail
- Relief : Terrain Tiles (ETOPO1, GMTED) ; sondes : EMODnet

## Avertissement

Aide à la préparation uniquement, sans aucune garantie. Ne remplace pas les cartes marines officielles, l'annuaire des marées ni le jugement du chef de bord.
