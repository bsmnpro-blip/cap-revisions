# Cap Révisions

Application web personnelle de suivi des révisions. Elle est conçue comme un journal de progression : une note est comparée uniquement avec les autres notes du même cours.

## Ouvrir l’application

Ouvrez `index.html` dans un navigateur récent. Aucun serveur ni installation ne sont nécessaires. Au premier démarrage, ajoutez une matière, un cours, puis une session. Le bouton « Voir un exemple » permet d’explorer l’interface avec les cas du cahier des charges.

Le dossier peut également être publié tel quel sur GitHub Pages : il ne dépend d’aucun serveur ou compte applicatif.

## Stockage et sauvegarde

Les données sont conservées dans le stockage local du navigateur (`localStorage`) : elles survivent au rechargement et fonctionnent hors ligne. Elles restent toutefois propres à chaque navigateur et appareil. Avec GitHub Pages, vous aurez le même site sur PC et tablette, mais les notes ne se synchroniseront pas automatiquement. Utilisez « Mes données » dans le menu latéral pour exporter régulièrement un fichier JSON de sauvegarde ou importer un export sur l’autre appareil.

## Logique de calcul

- Chaque score est normalisé sur 20 : `score / maxScore × 20`.
- Pour un cours, les sessions sont classées par date, puis par instant de création lorsque deux sessions ont la même date.
- La progression totale d’un cours est `dernière note - première note`. La dernière progression compare les deux dernières sessions de ce même cours.
- Une matière calcule sa progression en moyennant les progressions de ses cours. Le nombre de sessions d’un cours ne lui donne donc pas plus de poids.
- La moyenne de niveau d’une matière (et du niveau global) est la moyenne des dernières notes connues de chaque cours concerné.
- La moyenne de toutes les notes est la moyenne de toutes les sessions enregistrées sur la période sélectionnée ; elle complète la moyenne de niveau sans la remplacer.
- La courbe globale recalcule, à chaque session, la moyenne des dernières performances alors disponibles pour les cours déjà travaillés.

Les filtres de période appliquent ces mêmes règles aux sessions comprises dans la période sélectionnée : ils répondent donc à la question « comment ai-je évolué pendant cette période ? ».

## Vérification des calculs

Ouvrez `tests.html` pour lancer les tests de régression inclus. Ils vérifient notamment le scénario « Statut juridique » (16 → 17 → 14 → 18) et l’indépendance avec « Génériques ».

## Structure

- `models.js` : modèles et validation des saisies.
- `storage.js` : persistance locale, export et import.
- `analytics.js` : calculs purs, indépendants de l’interface.
- `app.js` : écrans, formulaires, filtres et graphiques SVG légers.
- `styles.css` : design responsive et mode sombre.
