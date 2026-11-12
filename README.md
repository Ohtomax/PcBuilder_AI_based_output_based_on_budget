# 🖥️ Next-Gen PC Shop & AI Custom Rig Builder

An e-commerce platform built for a PC hardware store featuring an **Inventory-Grounded AI Store Assistant** and an **Automated AI PC Builder**. Both AI modules are strictly constrained to recommend and assemble builds using **only real-time, in-stock store inventory**.

---

## ✨ Core Features

* **Full-Featured PC Hardware Store:** Browse components by category (CPU, GPU, Motherboard, RAM, Storage, PSU, Case, Cooling) with real-time stock tracking and spec filtering.
* **AI Store Inquiry Chatbot:** A conversational assistant capable of answering technical questions, comparing parts, and checking live store availability and pricing using tool-based Retrieval-Augmented Generation (RAG).
* **AI Custom PC Builder:** An interactive module that interviews the user (budget, target resolution, workload, aesthetic preferences) and automatically generates a 100% compatible, ready-to-buy PC build strictly from in-stock items.
* **Interactive Rig Customizer:** Swap individual parts suggested by the AI while maintaining real-time compatibility and wattage validation before adding the entire build to the cart in one click.

---

## 🛠️ Tech Stack

### Frontend
* **Framework:** React (Vite + TypeScript)
* **Server State & Data Fetching:** TanStack Query (React Query)
* **Client State Management:** Zustand (with `persist` middleware for Shopping Cart & Active PC Build slots)
* **AI UI Integration:** Vercel AI SDK (`@ai-sdk/react`)
* **Styling & UI Components:** Tailwind CSS + shadcn/ui
* **Schema Validation:** Zod

### Backend
* **Runtime & Framework:** Node.js + Express (TypeScript)
* **AI Orchestration:** Vercel AI SDK Core (`ai`)
* **LLM Providers:** 
  * Production: Google Gemini Flash (`@ai-sdk/google`) or OpenAI (`@ai-sdk/openai`)
  * Local Development: Ollama (`ollama-ai-provider`)
* **Validation & Structured Outputs:** Zod
* **Caching & Rate Limiting:** Redis + `express-rate-limit`
* **Payments:** PayMongo (GCash, Maya, Cards) / Stripe Webhooks

### Database
* **Primary Database:** PostgreSQL
* **ORM:** Prisma
* **Vector Search:** `pgvector` extension (for semantic product search alongside relational SQL filters)

---

## 🧠 AI Architecture & Inventory Grounding

To prevent hallucinated components, inaccurate pricing, or incompatible builds, the AI never guesses inventory. All recommendations are grounded in PostgreSQL data.

### 1. Store Inquiry Chatbot (Tool-Based RAG)
Instead of passing the entire product catalog into the prompt, the Express backend provides the LLM with structured tools:
* `searchInventory({ category, maxPrice, minPrice, specs, semanticQuery })`: Runs a hybrid query combining `pgvector` similarity search with hard SQL filters (`stock_quantity > 0`).
* `getPartDetails({ productId })`: Fetches exact specifications, warranty info, and live stock count for a specific item.
* `compareParts({ productIds })`: Fetches side-by-side specifications for up to 3 in-stock items.

### 2. AI PC Builder (3-Step Deterministic + LLM Pipeline)
LLMs alone should not be trusted with strict arithmetic (budget totals, PSU wattage) or physical hardware constraints. The AI Builder separates **conversation** from **compatibility math**:

#### Step 1: User Interview & Parameter Extraction
The chatbot gathers requirements and outputs a strict Zod-validated JSON object:
```json
{
  "totalBudget": 60000,
  "primaryUse": "1440p Gaming",
  "formFactor": "mATX",
  "aesthetics": "White / RGB",
  "includePeripherals": false
}
```

#### Step 2: Deterministic Compatibility & Budget Engine (TypeScript + SQL)
The Express backend allocates budget ratios based on `primaryUse` and queries PostgreSQL (`WHERE stock_quantity > 0`) enforcing strict hardware compatibility rules:
* **CPU & Motherboard:** Matching `socket` (e.g., `AM5`, `LGA1700`).
* **Motherboard & RAM:** Matching `memory_type` (`DDR4` vs `DDR5`) and available DIMM slots.
* **Case & Motherboard:** Supported `form_factor` (`ATX`, `mATX`, `ITX`).
* **Case & GPU/Cooler:** Physical clearance checks:
  $$\text{GPU Length (mm)} \le \text{Case Max GPU Length (mm)}$$
  $$\text{Cooler Height (mm)} \le \text{Case Max Cooler Height (mm)}$$
* **Power Supply (PSU) Headroom:** Calculated using component Thermal Design Power (TDP):
  $$\text{PSU Wattage} \ge (\text{CPU TDP} + \text{GPU TDP} + 100\text{W}) \times 1.25$$

#### Step 3: Final Selection & Explanation
The backend passes a curated shortlist of verified, compatible, in-stock parts (with their database `id` and `price`) to the LLM. The LLM selects the best value combination where:
$$\sum \text{Part Prices} \le \text{Total Budget}$$
It returns the array of `productId` values along with a plain-English explanation of why the parts were chosen and expected performance.

---

## 📁 Recommended Repository Structure

```text
├── client/                     # React Frontend
│   ├── src/
│   │   ├── api/                # TanStack Query hooks & Axios/Fetch clients
│   │   ├── components/
│   │   │   ├── chat/           # Floating AI Store Assistant drawer
│   │   │   ├── builder/        # AI PC Builder wizard & slot visualizer
│   │   │   ├── catalog/        # Product cards, filters, search
│   │   │   └── ui/             # shadcn/ui primitives
│   │   ├── store/              # Zustand stores (useCartStore, useBuilderStore)
│   │   ├── types/              # Shared TypeScript interfaces
│   │   └── main.tsx
│   └── package.json
│
├── server/                     # Express + TypeScript Backend
│   ├── prisma/
│   │   └── schema.prisma       # PostgreSQL + pgvector schema
│   ├── src/
│   │   ├── ai/
│   │   │   ├── tools/          # Inventory search & part comparison tools
│   │   │   ├── builder/        # Deterministic compatibility & budget engine
│   │   │   └── prompts/        # System prompts for Assistant & Builder
│   │   ├── controllers/        # Route handlers (Products, Orders, AI, Webhooks)
│   │   ├── middlewares/        # Auth, Zod validation, Redis rate limiters
│   │   ├── repositories/       # Data access layer directly querying Prisma models
│   │   ├── routes/             # Express API routers
│   │   ├── services/           # Core business & payment logic
│   │   └── index.ts
│   └── package.json
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v20+ recommended)
* **PostgreSQL** (with `pgvector` extension enabled)
* **Redis** (optional for local dev, recommended for rate limiting)
* **LLM API Key** (Google Gemini or OpenAI) or **Ollama** installed locally

### 1. Environment Variables
Create a `.env` file inside the `/server` directory:

```env
# Server
PORT=4000
NODE_ENV=development

# Database (PostgreSQL + pgvector)
DATABASE_URL="postgresql://user:password@localhost:5432/pcshop_db?schema=public"

# AI Provider
GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_api_key"
# OPENAI_API_KEY="your_openai_api_key"

# Redis (Rate Limiting & Caching)
REDIS_URL="redis://localhost:6379"

# Payment Gateway
PAYMONGO_SECRET_KEY="sk_test_..."
PAYMONGO_WEBHOOK_SECRET="whsec_..."
```

### 2. Installation & Database Setup

```bash
# Install backend dependencies
cd server
npm install

# Generate Prisma client & run migrations
npx prisma generate
npx prisma migrate dev --name init

# Start backend development server
npm run dev
```

```bash
# In a new terminal, install frontend dependencies
cd client
npm install

# Start React development server
npm run dev
```

---

## 🛡️ Security & Reliability Guardrails
* **Atomic Inventory Deduction:** Checkout uses Prisma interactive transactions (`$transaction`) to verify stock and deduct quantities simultaneously, preventing overselling.
* **AI Rate Limiting:** AI endpoints (`/api/ai/chat` and `/api/ai/build`) are protected by IP and user-session rate limiters to prevent token abuse.
* **Strict ID Validation:** Before rendering an AI-generated PC build on the frontend, the backend validates every returned `productId` against current PostgreSQL stock and recalculates the total price server-side.