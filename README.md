# Mineur ou Majeur ?

## Installation

```bash
npm install
```

## Lancer le jeu

```bash
npm start
```

Puis ouvre → http://localhost:3000

## Ajouter des photos

Copie simplement tes images dans les dossiers :

```
photos/
  mineur/   ← mets ici les photos de mineurs
  majeur/   ← mets ici les photos de majeurs
```

Formats acceptés : `.jpg` `.jpeg` `.png` `.webp` `.gif` `.avif`

Pas besoin de redémarrer le serveur — les photos sont rechargées à chaque partie.

## Structure

```
mineur-majeur/
├── server.js          ← serveur Express
├── package.json
├── public/
│   └── index.html     ← le jeu (frontend)
└── photos/
    ├── mineur/        ← tes photos ici
    └── majeur/        ← tes photos ici
```
