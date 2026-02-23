# Installation

## Prérequis
- Windows 10/11, macOS ou Linux
- Node.js LTS (18+ recommandé)
- npm
- qemu-img installé et accessible dans le PATH

### Installer qemu-img

#### Windows
- Option 1 (Chocolatey):
  choco install qemu-full
- Option 2:
  Installer QEMU depuis https://www.qemu.org/download/#windows

#### Ubuntu / Debian
- sudo apt update
- sudo apt install qemu-utils

#### Fedora
- sudo dnf install qemu-img

#### Arch Linux
- sudo pacman -S qemu

#### macOS
- brew install qemu

## Vérification
- qemu-img --version

## Lancer l'application (si les sources sont présentes)
- npm install
- npm start

## Dépannage rapide
- Si erreur "qemu-img ... ENOENT", vérifier que qemu-img est bien dans le PATH.
- Sous WSL, vérifier dans WSL avec: which qemu-img
- Redémarrer le terminal après installation de QEMU.
