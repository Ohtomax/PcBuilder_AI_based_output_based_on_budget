# Project Rules — PcBuilder AI (Custom PC E-Commerce with AI Builder)

---

## Project: PcBuilder AI — Custom PC-Building E-Commerce Platform
- **Backend:** Express 4, TypeScript 5, Prisma 7 (PostgreSQL via Supabase), Firebase Admin Auth, Zod 3 validation
- **Frontend:** React 19, TypeScript, TailwindCSS 4, Vite 6, React Router 7, TanStack Query 5, Zustand 5, Vercel AI SDK (`@ai-sdk/react`)
- **AI:** Vercel AI SDK 4 (`ai`), Google Gemini (`@ai-sdk/google`), OpenAI (`@ai-sdk/openai`), Ollama (`ollama-ai-provider`)
- **Database:** PostgreSQL (Supabase remote, pooled connection with SSL `verify-full`)
- **Caching/Rate-Limiting:** Redis via `ioredis` + `rate-limit-redis` + `express-rate-limit`
- **Architecture:** Modular (controller → service → repository pattern with dedicated error handlers, input validators, and rate limiters)

---

## 1. Security (HIGHEST PRIORITY — this handles user accounts, payments, orders, and trade-in evaluations)

### Authentication & Authorization
- Auth uses Firebase ID tokens verified server-side — always apply `verifyToken` middleware before any protected route
- Apply role-based access control middleware: `verifyAdmin`, `verifyStaff`, or `verifyUser` on every protected endpoint
- Role enum is `USERS | ADMIN | STAFF` — always check against the `role` field on the `users` model
- Never trust client-side role claims — always verify the Firebase UID against the database user record

### Input Validation & Sanitization
- All user input MUST be validated with Zod schemas before reaching services — define validators in `src/utils/input-validators/`
- Sanitize any user-generated HTML output to prevent XSS — never render raw user content unsanitized
- Use parameterized queries only (Prisma handles this) — NEVER build raw SQL strings or use `$queryRawUnsafe` with user input

### Data Protection
- Never log or expose sensitive data (tokens, Firebase credentials, `DATABASE_URL`, payment references, PII) in error messages, responses, or `console.log`
- Never expose stack traces or internal error details to the client — return clean error messages via the error handler pattern
- Keep `.env` files out of version control — `.gitignore` already excludes them
- SSL is enforced for database connections via `sslmode=verify-full` and the Supabase CA cert at `certs/prod-ca-2021.crt`

### Rate Limiting
- Apply `express-rate-limit` with Redis backing (`rate-limit-redis`) on all route groups
- Configure rate limiters per module in `src/utils/rate-limiter/` — stricter limits on auth endpoints, relaxed on catalog reads
- Never bypass rate limiting for convenience during development

---

## 2. Database & Prisma (Prisma 7 — Important Differences)

### Prisma 7 Configuration
- Generator uses `provider = "prisma-client"` (NOT `"prisma-client-js"` — this is Prisma 7)
- `datasource db` block has NO `url` property — connection URLs go in `prisma.config.ts` via `defineConfig({ datasource: { url } })`
- Database adapter pattern: `PrismaPg` from `@prisma/adapter-pg` is initialized in `config/db.ts` and passed to `new PrismaClient({ adapter })`
- Schema is multi-file: `prisma.config.ts` sets `schema: './prisma'` to load all `.prisma` files from the `prisma/` directory

### Schema Rules
- **Multi-file schema:** Each domain module has its own `.prisma` file (e.g., `users.prisma`, `product.prisma`, `order.prisma`, `cart.prisma`, `pcbuild.prisma`)
- **Only `schema.prisma`** contains the `generator` and `datasource` blocks — other files contain only `model`, `enum`, and relation definitions
- **Prisma types are PascalCase:** `Int`, `String`, `Boolean`, `DateTime`, `Decimal`, `Json` — never lowercase
- **Native type annotations are PascalCase:** `@db.VarChar(50)`, `@db.Timestamptz(6)`, `@db.Decimal(12,2)`, `@db.Text` — never `@db.int`, `@db.timestamp`
- `Int` maps to PostgreSQL `integer` automatically — do NOT add `@db.Int` or `@db.int`
- Use `@db.Timestamptz(6)` (timestamp WITH time zone) for all datetime columns — not `@db.Timestamp(6)`
- **Back-relations are mandatory:** If model A has `@relation` to model B, model B must declare the reverse field (e.g., `users` must have `builds PcBuild[]`, `cart Cart?`, `orders Order[]`)
- Use `@default(autoincrement())` for integer PKs, `@default(now())` for timestamps, `@default("{}")` for empty JSON
- Use enums for all status lifecycles (`BuildStatus`, `OrderStatus`, `RefundStatus`, `category`, `role`)

### Schema Modules
| File | Models/Enums |
|---|---|
| `schema.prisma` | `generator client`, `datasource db` |
| `users.prisma` | `users`, `role` enum |
| `product.prisma` | `product`, `category` enum |
| `pcbuild.prisma` | `PcBuild`, `BuildStatus` enum |
| `pcbuild-item.prisma` | `PcBuildItem` |
| `cart.prisma` | `Cart` |
| `cart-item.prisma` | `CartItem` |
| `order.prisma` | `Order`, `OrderStatus`, `Cancellation`, `CancelledBy`, `RefundStatus` enums |
| `order-item.prisma` | `OrderItem` |
| `ai-build.prisma` / `ai-build-item.prisma` | AI builder session models |

### Performance
- Use Prisma `select` / `include` to fetch only needed fields — avoid fetching entire records
- Prefer database-level filtering, sorting, and pagination (`where`, `orderBy`, `skip`, `take`) over in-memory processing
- Use `@@index` on frequently queried columns (foreign keys, status fields, timestamps)
- For stock management: use Prisma transactions (`prisma.$transaction`) to prevent overselling — never decrement stock outside a transaction

---

## 3. Backend Architecture & Code Patterns

### Modular Structure
```
server/
├── config/              # db.ts (Prisma + PrismaPg), firebase.ts
├── prisma/              # Multi-file schema (*.prisma)
├── prisma.config.ts     # Prisma 7 config (datasource URL, migrations path)
├── src/
│   ├── ai/
│   │   ├── builder/     # AI PC Builder logic
│   │   ├── prompts/     # System prompts for AI models
│   │   └── tools/       # AI function-calling tool definitions
│   ├── controllers/     # Route handlers — thin, delegates to services
│   ├── services/        # Business logic — validates, orchestrates, calls repositories
│   ├── repositories/    # Data access — Prisma queries only
│   ├── routes/          # Express Router definitions with middleware
│   ├── middlewares/     # Auth verification, role guards
│   └── utils/
│       ├── error-handler/    # Per-module error handler functions
│       ├── input-validators/ # Zod schemas for request validation
│       └── rate-limiter/     # Rate limit configs per module
├── server.ts            # Express app setup
└── tsconfig.json        # TypeScript config with path aliases
```

### Pattern Rules
- **Controller → Service → Repository** — never skip layers (no Prisma calls in controllers, no Express `req`/`res` in services)
- **Controllers:** Parse and validate input (Zod), call service methods, send responses, catch errors and pass to error handlers
- **Services:** Contain all business logic, throw typed errors (e.g., `ServiceError`), never import Express types
- **Repositories:** Pure data access layer — Prisma queries with `select`/`include`, return typed results
- **Error handlers:** Module-specific functions in `src/utils/error-handler/` that map service errors to HTTP responses
- **Input validators:** Zod schemas in `src/utils/input-validators/` — one file per module, export parse functions
- **Routes:** Define Express Router with middleware chain: `rateLimiter → verifyToken → verifyRole → controller`

### TypeScript Rules
- Use path alias `@/*` → `./src/*` for all imports (configured in `tsconfig.json`)
- Use ESM module system (`"type": "module"` in package.json, `"module": "NodeNext"` in tsconfig)
- Use `rewriteRelativeImportExtensions: true` — write `.ts` imports in source, compiler rewrites to `.js`
- Use proper TypeScript types from Prisma generated types (`@/generated/prisma`) — avoid `any`
- Strict mode is enabled — never use `// @ts-ignore` or `as any` to suppress errors
- Dev runner: `tsx watch` for hot-reloading; build: `tsc && tsc-alias` for path alias resolution

### AI Module Rules
- AI builder uses Vercel AI SDK (`ai` package) with provider adapters (`@ai-sdk/google`, `@ai-sdk/openai`, `ollama-ai-provider`)
- AI prompts live in `src/ai/prompts/` — keep them versioned and separated from logic
- AI tool definitions live in `src/ai/tools/` — define with Zod schemas for type-safe function calling
- **AI PC Builder must only recommend products that are `available: true` AND `stocks > 0`** — query the `product` table with these filters
- AI builder responses must reference actual `product.id_product` values — never hallucinate product IDs
- Store AI reasoning/notes in `PcBuild.aiNotes` and `PcBuildItem.note` for transparency

---

## 4. Frontend Architecture & Code Patterns

### Stack
- **React 19** + **Vite 6** + **TypeScript 5**
- **Styling:** TailwindCSS 4 (via `@tailwindcss/vite` plugin) + utility composition with `clsx` + `tailwind-merge` + `class-variance-authority` (CVA)
- **Icons:** Lucide React (`lucide-react`)
- **Routing:** React Router 7 (`react-router-dom`)
- **Server State:** TanStack Query 5 (`@tanstack/react-query`)
- **Client State:** Zustand 5
- **Auth:** Firebase Client SDK (`firebase`)
- **AI Chat:** Vercel AI SDK React hooks (`@ai-sdk/react` — `useChat`, `useCompletion`)
- **HTTP:** Axios

### Directory Conventions
```
client/src/
├── api/              # Axios instance, API client functions
├── components/
│   ├── builder/      # AI PC Builder wizard, part picker, build summary
│   ├── catalog/      # Product listing, filters, product cards
│   ├── chat/         # AI chatbot and support messaging UI
│   └── ui/           # Reusable UI primitives (buttons, modals, inputs, skeletons)
├── store/            # Zustand stores (auth, cart, builder state)
└── types/            # TypeScript type definitions and interfaces
```

### Pattern Rules
- **API calls:** Use the shared Axios instance from `src/api/` — always attach the Firebase ID token as a Bearer token in the Authorization header
- **Server state:** Use TanStack Query (`useQuery`, `useMutation`) for all server requests
  - Set meaningful `staleTime` to prevent unnecessary background refetches
  - Always invalidate relevant query keys on mutations (`queryClient.invalidateQueries({ queryKey: [...] })`)
- **Client state:** Use Zustand stores for client-only state (auth session, cart UI state, builder wizard step)
- **Never mix** Zustand and TanStack Query for the same data — server data belongs in TanStack Query
- **Component styling:** Use Tailwind CSS utility classes; use CVA for component variant patterns; compose with `clsx` + `tailwind-merge` via a `cn()` helper — never use inline `style={{}}` for styles achievable with Tailwind
- **AI Chat:** Use `useChat` from `@ai-sdk/react` for the AI builder chat and customer support chatbot — it handles streaming, message history, and tool calls automatically

### TypeScript Rules
- Strictly type all component props using `interface` or `type`
- Define explicit types for API response data in `src/types/` — NEVER use `any`
- Use Zod schemas (shared with backend where possible) for runtime validation of API responses

### Performance
- Lazy-load page-level route components with `React.lazy()` + `<Suspense>`
- Provide skeleton loading states instead of blank screens or full-page spinners
- Use `useMemo` for expensive computations (build price calculations, filtered product lists)
- Use `useCallback` for functions passed as props to memoized child components
- Use server-side pagination for product catalog and order history — never fetch all records at once

---

## 5. AI PC Builder — Domain-Specific Rules

### How the AI Builder Works
1. User fills a questionnaire: **budget**, **primary use case** (Gaming, Video Editing, Office, etc.), **aesthetic preferences** (RGB, Minimalist, All-White, etc.)
2. AI queries the `product` table filtered by `available: true` AND `stocks > 0` and structured `specs` (JSON) for compatibility
3. AI generates a recommended build (`PcBuild`) with individual part picks (`PcBuildItem`) — each linked to a real product in inventory
4. User can review, modify parts, save the build, and move it to their Cart

### Compatibility & Validation
- Product `specs` column (`Json`) stores structured hardware specs (e.g., socket type, RAM generation, TDP, form factor, GPU length)
- The AI must cross-reference specs for compatibility: CPU socket ↔ Motherboard socket, RAM generation ↔ Motherboard support, PSU wattage ≥ total TDP, GPU length ≤ Case clearance, Cooler socket compatibility
- **Never let the AI recommend a product that doesn't exist in the database or is out of stock**
- Each `PcBuildItem` has a unique `slot` per build (e.g., `CPU`, `GPU`, `RAM_1`, `RAM_2`, `STORAGE_1`) enforced by `@@unique([buildId, slot])`

### Build Lifecycle (State Machine)
```
DRAFT → SAVED → IN_CART → ORDERED
```
- `DRAFT`: AI is generating or user is tweaking — parts can change freely
- `SAVED`: User explicitly saved — acts as a wishlist/bookmark
- `IN_CART`: Build was moved to shopping cart — stock reservation begins
- `ORDERED`: An order was placed — build is immutable

---

## 6. Order Lifecycle & Stock Management

### Order Status State Machine
```
PENDING_PAYMENT → PROCESSING → TO_SHIP → SHIPPED → DELIVERED
                                                        ↘ CANCELLED (from any pre-DELIVERED state)
```

### Stock Rules
- **Cart reservations** have a TTL (`CartItem.expiresAt`) — default 15 minutes at checkout
- When a reservation expires, stock must be restored — run a cleanup job on `CartItem.expiresAt` index
- **Used/refurbished items** with serial numbers (`OrderItem.serialNumber`) are unique inventory — selling one means decrementing stock AND marking the specific item
- **Cancellations** auto-restock: when an order is cancelled, all `OrderItem` quantities must be added back to `product.stocks` within a Prisma transaction
- **Never decrement stock outside a `prisma.$transaction`**

---

## 7. Environment & Deployment

### Environment Variables
| Variable | Location | Purpose |
|---|---|---|
| `DATABASE_URL` | `server/.env` | Supabase PostgreSQL pooled connection string |
| `FIREBASE_SERVICE_ACCOUNT` | `server/.env` | Firebase Admin SDK service account JSON |
| `VITE_FIREBASE_API_KEY` | `client/.env` | Firebase Client SDK config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `client/.env` | Firebase Client SDK config |
| `VITE_FIREBASE_PROJECT_ID` | `client/.env` | Firebase Client SDK config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `client/.env` | Firebase Client SDK config |
| `VITE_FIREBASE_APP_ID` | `client/.env` | Firebase Client SDK config |

### Key Commands
| Command | Location | Purpose |
|---|---|---|
| `npm run dev` | `server/` | Start backend dev server (`tsx watch`) |
| `npm run dev` | `client/` | Start frontend dev server (Vite) |
| `npm run prisma:generate` | `server/` | Regenerate Prisma client after schema changes |
| `npm run prisma:migrate` | `server/` | Run Prisma migrations (`migrate dev`) |
| `npm run db:push` | `server/` | Push schema to database without migration |
| `npm run build` | `server/` | Compile TypeScript + resolve path aliases |

---

## 8. Do NOT
- Expose stack traces or internal error details to the client
- Skip Zod input validation on any endpoint
- Build raw SQL queries — always use Prisma's query builder
- Use `any` type when Prisma or Zod types are available
- Use `console.log` for production logging — use a structured logger
- Commit `.env` files or secrets
- Use `provider = "prisma-client-js"` — this project uses Prisma 7's `"prisma-client"`
- Put `url` in the `datasource db` block — it goes in `prisma.config.ts`
- Use `@db.int`, `@db.timestamp` or any lowercase native type — Prisma native types are PascalCase
- Let the AI builder recommend out-of-stock or non-existent products
- Decrement product stock without a Prisma transaction
- Use `dangerouslySetInnerHTML` without sanitization
- Make direct `fetch()` / `axios()` calls without attaching the auth token
- Use inline `style={{}}` for styles achievable with Tailwind CSS
- Skip back-relations in Prisma schema files — both sides of every relation must be declared
