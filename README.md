# Game of Thrones Family Tree

An interactive family-tree and relationship map for _Game of Thrones_ Season 1, built with React, Vite, and React Flow.

The app renders houses, characters, and unions as a graph, lays them out automatically with ELK, and lets you move through episodes with a slider so characters only appear once they have been introduced.

## Features

- Interactive node graph built with `@xyflow/react`
- Automatic layout using `elkjs`
- Episode-based reveal system for character and house states
- Custom node types for houses, characters, and unions
- Local JSON data source for nodes and edges

## Tech Stack

- React 19
- Vite 7
- React Flow / XYFlow
- ELK.js
- Font Awesome

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run the app locally

```bash
npm run dev
```

Vite will start a local development server and print the URL in the terminal, usually `http://localhost:5173`.

## Available Scripts

```bash
npm run dev      # start the development server
npm run build    # create a production build
npm run preview  # preview the production build locally
npm run lint     # run ESLint
```

## How the Project Works

### Data

The diagram is driven by JSON files in [`./src/data`](./src/data):

- [`./src/data/nodes.json`](./src/data/nodes.json): houses, characters, and union nodes
- [`./src/data/edges.json`](./src/data/edges.json): relationships between nodes used by the current diagram

Each node includes a `type` and a `data` object. Many nodes also include `states`, which determine when a character or house becomes visible and what metadata should be shown at a given episode.

### Rendering

The main diagram lives in [`./src/components/GoTDiagram.jsx`](./src/components/GoTDiagram.jsx).

It:

- loads the node and edge data
- computes positions with ELK on mount
- applies episode-specific state through `getStateForEpisode`
- renders the graph with React Flow
- exposes an episode slider at the bottom of the screen

### Layout

Layout logic is handled in [`./src/utils/layoutHelper.js`](./src/utils/layoutHelper.js).

The current layout process only sends parent-child and parent-union relationships into ELK so the graph stays readable, while all original edges are still rendered afterward.

## Project Structure

```text
src/
  components/     React components for the graph and custom nodes
  data/           JSON data for characters, houses, unions, and edges
  utils/          Episode-state and layout helpers
public/
  banners/        House banner images
  characters/     Character portraits
```

## Notes

- The current episode slider is configured for episodes `1` through `10`.
- The app currently imports `edges.json`.
- This project appears focused on Season 1 data and progression.

## Build for Production

```bash
npm run build
```

The production output will be generated in the `dist/` directory.
