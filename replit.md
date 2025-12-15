# Forge - Personal Engineering Advisor

## Overview

Forge is a web application designed to be a digital advisor for mechatronics engineering students. It enforces a daily routine by converting academic theory into practical engineering tasks using a "proof-of-work" model. Students submit evidence of completed work (e.g., code commits, diagrams, simulation screenshots) rather than the application doing the work for them. Key capabilities include daily mission assignments for multiple engineering courses, a proof-of-work submission and tracking system, file-based knowledge base organization, and portfolio generation from completed work. The project aims to provide a minimalist, function-first UI inspired by engineering dashboards, helping students develop practical skills and build a portfolio.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (Fix Session - Dec 15, 2025)

**Fixed @xenova/transformers Packaging Issue for pkg:**
- Problem: Packaged app couldn't start with "Cannot find module @xenova/transformers" error
- Root cause: `@xenova/transformers` uses native onnxruntime-node bindings incompatible with pkg
- Solution implemented:
  - Created onnxruntime-node shim (onnxruntime-node.cjs) to intercept require and prevent native binding load
  - Bundle transformers.js directly into esbuild output instead of marking as external
  - Copy ONNX WASM files (~37MB) to Tauri resources folder
  - Configure transformers to use WASM backend only (no native bindings)
  - Models downloaded to ~/.forge/models on first use (offline after that)
- Files modified:
  - `script/build-sidecar.ts` - Added shim creation, WASM file copying, fixed paths for workspace setup
  - `server/llm/retriever.ts` - Safe backend initialization with error handling
  - `src-tauri/tauri.conf.json` - Include WASM resources in bundle
  - `src-tauri/binaries/shims/onnxruntime-node.cjs` - Shim module (generated during build)
  - `src-tauri/resources/*.wasm` - ONNX WASM runtime files (generated during build)

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript (Vite build tool)
**UI Component Library**: shadcn/ui (Radix UI primitives) with a "Acid Ops" / "Cyber-Brutalist" theme (high-contrast, custom fonts, Tailwind CSS).
**State Management**: TanStack Query for server state.
**Routing**: Wouter.
**Key Design Patterns**: Component composition, custom hooks for data fetching, toast notifications, mobile-responsive design.

### Backend Architecture

**Framework**: Express.js with TypeScript.
**API Endpoints**: CRUD operations for missions, courses, archives, proof of work submission, and document ingestion. Includes portfolio export.
**File Upload Handling**: Multer middleware stores files in course-specific directories within `/forge_kb/`.
**Packaging**: Tauri + pkg for standalone Windows/Mac/Linux executables.
**Key Design Decisions**: Dual-mode operation (Vite dev server for development, static files for production), request logging, no session/authentication system for simplicity.

### Data Storage

**Database**: PostgreSQL via Drizzle ORM (Neon serverless driver).
**Schema Design**: Tables for `courses`, `missions`, `proofs`, and `uploadedFiles` to store metadata and relationships.
**File System Structure**: `/forge_kb/` organizes proof artifacts and knowledge base files by course code.
**Validation**: Zod schemas derived from Drizzle definitions.

### Document Extraction Pipeline

**Tiered Approach**: Optimizes cost by using local extraction for Office documents and PDFs, reserving Gemini API for images and scanned content.
**Supported Formats**:
- **Word (.docx)**: Extract text with mammoth + OCR embedded images
- **Excel (.xlsx/.xls)**: Extract tabular data as CSV text
- **PowerPoint (.pptx/.ppt)**: Extract slide text from XML + OCR embedded images
- **PDF**: Use pdf-parse for regular PDFs, Gemini for scanned/image-based PDFs (auto-detect <100 chars)
- **Images (PNG, JPG, GIF, WebP)**: Gemini vision API for OCR
- **Text files (.txt, .md)**: Direct file read

**Processing Stages**: Upload → Extract → Process (tracked in UI)

### Build and Deployment

**Build Process**: 
- Client (Vite) and server (esbuild) are built into a single production artifact
- Server bundled to CJS with sharp/bcrypt/chromadb marked as external
- Transformers.js bundled directly with onnxruntime-node shim
- pkg creates standalone .exe for Tauri sidecar

**Development Environment**: Concurrent dev servers (Vite + Express) with HMR.
**Environment Variables**: `DATABASE_URL`, `NODE_ENV`, `GEMINI_API_KEY`.

### RAG (Retrieval-Augmented Generation) System

**Purpose**: Enhances mission generation by retrieving relevant information from a knowledge base.
**Components**:
- **Retriever**: Uses ChromaDB and `all-MiniLM-L6-v2` embeddings for vector similarity search.
- **Ingestion Pipeline**: File-by-file processing with chunking and embedding storage.
- **RAG Mission Generation**: Retrieves relevant chunks and uses Groq/Gemini for progressive mission generation.
- **Mastery Tracking**: Adjusts concept mastery levels based on feedback and performance.
**Activation**: Controlled by `USE_RAG` environment variable.

## External Dependencies

### Third-Party Services

- **Neon Database**: Serverless PostgreSQL hosting.
- **Gemini API**: Document extraction, concept analysis, vision/OCR.
- **Groq API**: Mission generation (optional).

### Key NPM Packages

**Frontend**:
- `@tanstack/react-query`: Server state management.
- `wouter`: Client-side routing.
- `@radix-ui/*`: Unstyled accessible UI primitives.
- `tailwindcss`: Utility-first CSS framework.
- `lucide-react`: Icon library.
- `react-hook-form`, `@hookform/resolvers`: Form management.
- `zod`: Schema validation.

**Backend**:
- `express`: Web server framework.
- `drizzle-orm`: TypeScript ORM.
- `multer`: File upload middleware.
- `postgres`: PostgreSQL client.
- `mammoth`: Word document text extraction.
- `xlsx`: Excel file parsing.
- `pdf-parse`: PDF text extraction.
- `adm-zip`: ZIP file manipulation for Office document processing.
- `@xenova/transformers`: Local embeddings with WASM backend for RAG.

**Development & Tooling**:
- `vite`: Build tool and dev server.
- `typescript`: Type safety.
- `esbuild`: Fast bundler for server code.
- `drizzle-kit`: Schema migrations.
- `drizzle-zod`: Zod schema generation from Drizzle.
- `@neondatabase/serverless`: Neon driver.
- `@yao-pkg/pkg`: Node.js to standalone executable.
- `@tauri-apps/cli`: Tauri desktop app framework.

### Integration Points

- Custom Vite plugin for dynamic OpenGraph image URL generation.
- Path aliases (`@/*`, `@shared/*`, `@assets/*`) for clean imports.
- PostCSS with Tailwind and Autoprefixer for CSS processing.
- Tauri shell plugin for spawning sidecar backend process.
