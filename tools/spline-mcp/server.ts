/**
 * tools/spline-mcp/server.ts — Spline catalog & embed-helper MCP.
 *
 * This server does NOT author Spline scenes. Spline has no public authoring
 * API and the .splinecode format is a proprietary binary. Programmatic scene
 * creation is not possible without Spline's cooperation. See SPLINE_MCP.md.
 *
 * What this server does:
 *   - Maintains a local JSON catalog of named Spline scene URLs.
 *   - Validates URLs against the known prod/draft CDN pattern.
 *   - Generates ready-to-paste <SplineEmbed /> JSX for this project.
 *
 * Transport: stdio (wire up via `npx @modelcontextprotocol/inspector` or
 * the Claude desktop config). Install the SDK first: npm i @modelcontextprotocol/sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SceneEntry {
  name: string;
  sceneUrl: string;
  description: string;
  addedAt: string;
}

interface Catalog {
  scenes: SceneEntry[];
}

// ---------------------------------------------------------------------------
// Catalog persistence
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CATALOG_PATH = join(__dirname, 'catalog.json');

// Validated against Spline's known prod and draft CDN hostnames.
const SCENE_URL_RE =
  /^https?:\/\/(prod|draft)\.spline\.design\/[A-Za-z0-9_-]+\/scene\.splinecode$/;

async function loadCatalog(): Promise<Catalog> {
  if (!existsSync(CATALOG_PATH)) {
    const empty: Catalog = { scenes: [] };
    await writeFile(CATALOG_PATH, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }
  const raw = await readFile(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw) as Catalog;
}

async function saveCatalog(catalog: Catalog): Promise<void> {
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Embed helper
// ---------------------------------------------------------------------------

/** Converts a scene name to a kebab-case id fallback. */
function toKebab(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Builds the JSX string for <SplineEmbed /> from a catalog entry. */
function buildEmbed(entry: SceneEntry, id: string, label: string): string {
  return [
    '<SplineEmbed',
    `  id="${id}"`,
    `  sceneUrl="${entry.sceneUrl}"`,
    `  skeletonLabel="${label}"`,
    '/>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'spline-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// --- tool registry ----------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'spline.list',
      description: 'Returns all scenes in the local Spline catalog.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'spline.add',
      description:
        'Adds a Spline scene URL to the catalog. Validates the URL against the known prod/draft CDN pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable identifier for this scene.',
          },
          sceneUrl: {
            type: 'string',
            description:
              'The .splinecode URL from Spline Code Export → React. Must match prod or draft CDN.',
          },
          description: {
            type: 'string',
            description: 'Optional note about what this scene is used for.',
          },
        },
        required: ['name', 'sceneUrl'],
      },
    },
    {
      name: 'spline.embed',
      description:
        'Generates a <SplineEmbed /> JSX snippet for the named scene.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The catalog scene name to look up.',
          },
          id: {
            type: 'string',
            description:
              'Override the component id prop. Defaults to kebab-case of name.',
          },
          label: {
            type: 'string',
            description:
              'Override the skeletonLabel prop. Defaults to "HYDRATION.LOG".',
          },
        },
        required: ['name'],
      },
    },
  ],
}));

// --- tool handlers ----------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // spline.list — no input, returns full catalog as JSON text.
  if (name === 'spline.list') {
    const catalog = await loadCatalog();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(catalog, null, 2),
        },
      ],
    };
  }

  // spline.add — validates URL, appends to catalog, returns new entry.
  // Rejects duplicate names and malformed URLs before touching disk.
  if (name === 'spline.add') {
    const { name: sceneName, sceneUrl, description } = args as {
      name: string;
      sceneUrl: string;
      description?: string;
    };

    if (!SCENE_URL_RE.test(sceneUrl)) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid sceneUrl. Must match: ^https?://(prod|draft)\\.spline\\.design/[A-Za-z0-9_-]+/scene\\.splinecode$\n\nGot: ${sceneUrl}`,
          },
        ],
        isError: true,
      };
    }

    const catalog = await loadCatalog();

    if (catalog.scenes.some((s) => s.name === sceneName)) {
      return {
        content: [
          {
            type: 'text',
            text: `A scene named "${sceneName}" already exists in the catalog. Use a different name or update it manually in catalog.json.`,
          },
        ],
        isError: true,
      };
    }

    const entry: SceneEntry = {
      name: sceneName,
      sceneUrl,
      description: description ?? '',
      addedAt: new Date().toISOString(),
    };

    catalog.scenes.push(entry);
    await saveCatalog(catalog);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(entry, null, 2),
        },
      ],
    };
  }

  // spline.embed — looks up named scene, returns <SplineEmbed /> JSX.
  // The id defaults to kebab-case of name; label defaults to HYDRATION.LOG.
  if (name === 'spline.embed') {
    const { name: sceneName, id, label } = args as {
      name: string;
      id?: string;
      label?: string;
    };

    const catalog = await loadCatalog();
    const entry = catalog.scenes.find((s) => s.name === sceneName);

    if (!entry) {
      return {
        content: [
          {
            type: 'text',
            text: `No scene named "${sceneName}" in catalog. Run spline.list to see available scenes.`,
          },
        ],
        isError: true,
      };
    }

    const resolvedId = id ?? toKebab(sceneName);
    const resolvedLabel = label ?? 'HYDRATION.LOG';
    const jsx = buildEmbed(entry, resolvedId, resolvedLabel);

    return {
      content: [{ type: 'text', text: jsx }],
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure catalog file exists before accepting any requests.
  await loadCatalog();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
