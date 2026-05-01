# @syndash/creator-motion-storyboard

Capsule-to-motion-storyboard controller for the Dash Shatter design infrastructure.

Public-safe HTTP route that accepts a capsule (JSON scene data) and returns a self-contained, fixed-canvas HTML motion storyboard. No raw generated media.

## Quick start

```bash
bun install
bun run dev
# Server listening on http://localhost:3099
```

Custom port:

```bash
PORT=4000 bun run dev
```

## API

### `POST /capsule-to-storyboard`

Accepts a capsule JSON body matching the [capsule-v1 schema](https://syndash.dev/schemas/capsule-v1.json).

**Request example:**

```json
{
  "id": "cap-001",
  "title": "Product Demo",
  "canvas": { "width": 1280, "height": 720 },
  "scenes": [
    {
      "id": "scene-1",
      "index": 0,
      "duration": 2000,
      "caption": "Introduction",
      "transition": "fade",
      "background": "#1a1a2e",
      "elements": [
        {
          "type": "text",
          "x": 540, "y": 320,
          "width": 200, "height": 40,
          "content": "Welcome",
          "style": { "font-size": "24px", "color": "#fff" }
        }
      ]
    }
  ]
}
```

**Response:** `200` with `Content-Type: text/html` — a self-contained HTML storyboard page.

**Errors:**
- `400` — Invalid JSON body
- `422` — Body does not match capsule contract, or machine check failed

### `GET /health`

Returns `{"status":"ok"}`.

## Capsule contract

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique capsule identifier |
| `title` | string | yes | Human-readable title |
| `canvas.width` | number | yes | Canvas width (1–3840) |
| `canvas.height` | number | yes | Canvas height (1–2160) |
| `scenes` | array | yes | Non-empty array of scenes |
| `scene.id` | string | yes | Unique scene identifier |
| `scene.index` | integer | yes | Zero-based scene index |
| `scene.duration` | number | yes | Duration in milliseconds |
| `scene.transition` | enum | yes | `fade`, `slide-left`, `slide-right`, `zoom`, or `none` |
| `scene.caption` | string | no | Bottom caption text |
| `scene.overlay` | string | no | Top-right overlay label |
| `scene.background` | string | no | CSS background value |
| `scene.elements` | array | yes | Visual elements on the canvas |
| `element.type` | enum | yes | `text`, `shape`, or `placeholder` |
| `element.x`, `element.y` | number | yes | Position on canvas |
| `element.width`, `element.height` | number | yes | Element dimensions |
| `element.content` | string | no | Text content (escaped in output) |
| `element.style` | object | no | Inline CSS properties |
| `metadata` | object | no | Arbitrary metadata |

## Ledger retention

Every successful transformation is recorded as an append-only JSONL entry at `.ledger/storyboard-transforms.jsonl`. Configure the directory via `setLedgerDir()`.

## Machine check

The built-in machine check validates:
- Scene indices match their array position
- All durations are positive
- No duplicate scene IDs
- All elements fit within the declared canvas bounds

## Public safety

Output HTML uses a strict Content-Security-Policy (`default-src 'none'`) and escapes all capsule-originated strings, so user content is always rendered as text — never interpreted as markup or executable code.

## Testing

```bash
bun test
```

## License

Apache-2.0
