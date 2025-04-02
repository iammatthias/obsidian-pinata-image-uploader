Great point — with a Cursor-based agentic workflow, where tools like Cursor can automate refactors, generate scaffolding, test, and even deploy iteratively, we can drastically reduce those conventional timelines.

Here’s a revised version of the PRD with leaner, more realistic durations assuming you're leveraging agentic dev assistance heavily throughout the cycle:

---

# Obsidian IPFS Image Uploader - PRD

## Overview

A plugin for [Obsidian](https://docs.obsidian.md/Home) that automatically uploads embedded images to [Pinata](https://ai-docs.pinata.cloud) via IPFS, replacing local image references in markdown with `ipfs://` links. It also handles gateway proxying for image display, supporting both public and private gateways with JWT-based authentication and signed URLs when needed.

The goal is to make decentralized image hosting seamless and secure for Obsidian users.

## Team & Timeline

| Role            | Responsibilities                             | Allocation |
| --------------- | -------------------------------------------- | ---------- |
| Project Manager | Plugin scoping, scheduling, release planning | 100%       |
| Lead Developer  | Plugin development, API integration          | 100%       |

**Project Phases:**

-   **Pre-production** (2–3 days): Define plugin structure, gather credentials, scaffold setup
-   **Production** (5–7 days): Core functionality, proxying, settings UI, testing
-   **Polishing** (1–2 days): UX refinement, docs, packaging

## Development Roadmap

### Pre-production

| Module           | Timeline | Owner    | Dependencies | Deliverables                  |
| ---------------- | -------- | -------- | ------------ | ----------------------------- |
| Plugin Bootstrap | Day 1    | Lead Dev | None         | Scaffolding, manifest, README |
| Auth Flow Setup  | Day 2-3  | Lead Dev | Pinata docs  | JWT + gateway fields wired in |

### Production

| Module                | Timeline | Owner     | Dependencies      | Deliverables                   |
| --------------------- | -------- | --------- | ----------------- | ------------------------------ |
| Image Event Hooking   | Day 3–4  | Lead Dev  | Plugin shell      | Intercept image adds           |
| Upload to Pinata      | Day 4    | Lead Dev  | JWT setup         | Pinata integration, CID return |
| Markdown Replacement  | Day 4    | Lead Dev  | Upload success    | `ipfs://` link in markdown     |
| Gateway Proxy (basic) | Day 5    | Lead Dev  | CID availability  | Gateway URL from user settings |
| Settings Panel UI     | Day 6    | Lead Dev  | Obsidian settings | JWT, gateway URL, visibility   |
| Private Gateway Proxy | Day 7    | Lead Dev  | Proxy setup       | Signed URL generation stub     |
| Testing & Validation  | Day 7    | QA / Self | All               | Functional tests, UX review    |

### Polishing

| Module   | Timeline | Owner | Dependencies | Deliverables           |
| -------- | -------- | ----- | ------------ | ---------------------- |
| Final QA | Day 8    | QA    | All modules  | Bug-free plugin build  |
| Delivery | Day 8–9  | Dev   | All modules  | Packaged plugin + docs |

## Platform Specifications

-   **Primary**: Desktop (Obsidian plugin)
-   **Languages**: TypeScript
-   **Frameworks**: Obsidian Plugin API
-   **Target Devices**: macOS, Windows, Linux

## Core Components

### Image Upload Handler

**Priority**: High  
**Description**: Listens to image embed events and uploads to Pinata.

**Implementation:**

-   Hook into paste, drag-drop, and attach events
-   Send blob to Pinata using JWT
-   Replace embed in markdown with `ipfs://CID`

### Gateway Proxy

**Priority**: High  
**Description**: Rewrites `ipfs://` to displayable gateway URLs

**Implementation:**

-   If public, rewrite to `https://{gateway}/ipfs/{CID}`
-   If private, generate signed URLs via user proxy
-   Markdown remains clean of signed/secret content

### Settings Panel

**Priority**: High  
**Description**: Lets users input JWT and gateway config

**Implementation:**

-   Inputs: JWT, gateway URL, visibility (public/private)
-   Persisted via Obsidian’s plugin settings API

## Integrations

### Pinata API

**Type**: API  
**Description**: Handles IPFS uploads and JWT auth

**Snippet:**

```ts
await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
	method: "POST",
	headers: { Authorization: `Bearer ${jwt}` },
	body: formData,
});
```

### Proxy (for private mode)

**Type**: API Gateway  
**Description**: User-hosted endpoint that signs IPFS URLs

**Responsibilities:**

-   Accept CID + TTL
-   Return signed, short-lived gateway URL
-   Never embeds secrets in markdown

## Technical Requirements

-   **Performance**: Upload latency <2s
-   **Security**: JWT secure in local plugin config
-   **Compatibility**: GitHub and other renderers show images cleanly

## Implementation Approach

-   **Dev**: Cursor + Obsidian plugin dev kit + Pinata docs
-   **QA**: Manual markdown file tests + image embed coverage
-   **Deploy**: GitHub repo + community plugin submission

## Design Direction

**Visual Style**: Clean, minimal — standard Obsidian UI patterns  
**Color Palette**: Default Obsidian styling (dark/light mode compatibility)

## Notes

-   Gateway proxy can be self-hosted by user or provided as boilerplate
-   Ensure markdown portability across cloud-based renderers

---

Want me to scaffold the plugin manifest or stub out the image hook for you?
