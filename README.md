# Toolbox Virtualisation

Convertisseur de disques virtuels en interface graphique (Electron) utilisant `qemu-img`.

## Objectif
Cette application permet de convertir des images de disques virtuels entre plusieurs formats courants:

- VMDK
- VHD
- VHDX
- QCOW2
- RAW

## Fonctionnement (vue utilisateur)

1. **Sélectionner un fichier source**
   - Cliquer sur **Parcourir...** dans la section *Fichier Source*.
   - L’application détecte automatiquement le format et affiche les informations du fichier.

2. **Choisir un format de destination**
   - Sélectionner le format cible dans la liste.
   - La compatibilité source/destination est vérifiée et affichée.

3. **Choisir le dossier de sortie**
   - Cliquer sur **Parcourir...** dans la section *Dossier Destination*.
   - L’espace disque disponible est affiché.

4. **Configurer les options avancées**
   - Compression (si destination QCOW2)
   - Validation après conversion
   - Nombre de threads

5. **Lancer la conversion**
   - Cliquer sur **CONVERTIR**.
   - La progression et le temps estimé sont affichés en temps réel.

6. **Consulter le résultat**
   - En fin de traitement, un message de succès/erreur s’affiche.
   - Possibilité d’ouvrir le dossier de sortie.
   - Les conversions sont enregistrées dans l’historique local.

## Architecture technique

- **Electron Main Process**: `main.js`
  - Gère la fenêtre principale.
  - Expose les actions système via IPC (choix fichiers/dossiers, conversion, ouverture dossier, etc.).

- **Preload**: `preload.js`
  - Expose une API sécurisée (`window.api`) au frontend.

- **Renderer**: `public/index.html` + `public/app.js`
  - Interface utilisateur, interactions, affichage progression/résultats/historique.

- **Services**:
  - `src/services/converter.js`: logique de conversion (`qemu-img`), suivi progression, historique.
  - `src/services/fileUtils.js`: utilitaires (détection format, infos fichier, espace disque, validations).

## Prérequis

- Windows 10/11, macOS ou Linux
- Node.js LTS (18+ recommandé)
- npm
- `qemu-img` installé et accessible dans le PATH

Voir aussi: `INSTALLATION.md`.

## Lancer le projet

```bash
npm start
```

## Dépannage rapide

- Erreur `qemu-img ... ENOENT`:
  - Vérifier que `qemu-img` est installé et disponible dans le PATH.
  - Sous WSL: `which qemu-img`.

- L’application ne démarre pas:
  - Vérifier que Node.js et npm sont installés.
  - Relancer un terminal propre puis `npm start`.

## Notes

- L’historique des conversions est stocké localement dans le profil utilisateur.
- Les performances dépendent de la taille du disque source, du format cible et du stockage utilisé.
