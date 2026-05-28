# Assistme - AI-Powered Product Intelligence

Assistme is a modern, AI-powered product comparison and discovery platform. It is designed to help users intelligently explore, compare, and choose consumer electronics (specifically mobiles, tablets, and smartwatches from Apple, Samsung, Xiaomi, and Oppo) through a highly interactive and aesthetically pleasing user interface.

## 🚀 Features

Assistme is built around three primary user journeys (Scenarios):

1. **Direct Product Comparison (Scenario 1)**
   - Compare two or more specific devices side-by-side.
   - Dynamic comparison tables with automatic highlighting of "winning" specs.
   - Staggered row animations and collapsible spec categories for clean reading.

2. **Conversational Purchase Advice (Scenario 2)**
   - Natural language AI assistant.
   - Users provide their needs (e.g., "I need a great camera phone under $800"), and the AI filters, ranks, and recommends the best matches.
   - Interactive product cards allow users to select recommendations and instantly build a comparison table.

3. **Category Exploration (Scenario 3)**
   - Explore top-ranked products within specific categories (e.g., "Tablets", "Smartwatches").
   - Filter, select, and compare the best products in the market seamlessly.

**Additional Features:**
- **Authentication:** Secure user registration and login system with JWT.
- **Session Management:** Save and resume chat sessions and product comparisons from the sidebar.
- **Premium UI/UX:** A bespoke "Copper & Slate" light theme featuring custom Tailwind animations, glass-morphism, staggered element reveals, and tactile hover states.

## 🏗️ Architecture & Tech Stack

The project is structured as a full-stack monorepo, decoupled into a frontend and a backend application.

### Frontend
- **Framework:** React 18 with Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS (with custom keyframes and staggered delays)
- **UI Components:** Shadcn UI (Radix UI primitives)
- **Routing:** React Router v6
- **Icons:** Lucide React
- **Theme:** Bespoke Light Mode (Slate Primary `#2D3748`, Copper Accent `#B87333`)

### Backend
- **Framework:** FastAPI (Python)
- **Server:** Uvicorn
- **Database:** PostgreSQL (with schema migration via Supabase)
- **Authentication:** JWT (JSON Web Tokens)
- **Core Logic:** 
  - Modular services architecture (`comparison_service.py`, `conversation_manager.py`, `query_interpreter.py`) to handle AI filtering and product matching.
- **Data Ingestion:** Scripts to clean and ingest raw electronic specifications into the relational database.

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- PostgreSQL

### Running the Backend
1. Navigate to the `backend` directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
3. Install dependencies from requirements (if applicable).
4. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Running the Frontend
1. Navigate to the `frontend` directory.
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the localhost URL provided by Vite (typically `http://localhost:5173`).

## 🎨 UI/UX Design System
The frontend implements a strict, elegant design system:
- **Backgrounds:** Clean off-white (`#FCFCFC`) and transparent glass-morphism (`rgba(255, 255, 255, 0.55)`).
- **Typography:** DM Sans for body text, Syne for bold, branded headers.
- **Animations:** Custom `fade-in-up`, `scale-in`, and delayed staggered row entrances to make data visualization feel organic and premium.
- **Interactions:** Product cards feature smooth hover lifts (`-translate-y-1`) and dynamic shadow expansion.
