# Smart Study AI Web Application

Smart Study AI is a web application designed to help students process their study materials (text, images, PDFs) and generate summaries, flashcards, and quizzes using AI.

## Project Structure

/smart-study-app/├── backend/            # Node.js/Express backend│   ├── routes/         # API route handlers│   ├── models/         # Database models and DB connection│   ├── services/       # Business logic (auth, AI, file processing)│   ├── middleware/     # Express middleware (auth, rate limiting)│   └── app.js          # Express application setup├── db/                 # SQLite database file (e.g., smart_study.sqlite)├── public/             # Frontend static assets│   ├── index.html      # Main application page│   ├── dashboard.html  # Authenticated user dashboard│   ├── css/            # CSS stylesheets│   ├── js/             # JavaScript files│   └── assets/         # Images, icons, etc.├── templates/          # (Currently unused, for potential email templates etc.)├── .env                # Environment variables (API keys, secrets) - CREATE THIS FILE├── .gitignore          # Specifies intentionally untracked files├── package.json        # Project metadata and dependencies├── server.js           # Main Node.js server entry point└── README.md           # This file
## Technical Requirements

* **Frontend:** Vanilla HTML5, CSS3 (Flexbox/Grid), JavaScript (ES6+).
    * Client-side OCR: Tesseract.js v4
    * Client-side PDF text extraction: PDF.js
* **Backend:** Node.js, Express.js
    * Database: SQLite3
    * Authentication: JWT (JSON Web Tokens)
    * Rate Limiting for API calls
* **AI Processing:** OpenAI GPT-3.5 API (or newer compatible models)

## Core Functionality

* **Anonymous Users:**
    * File upload (JPG/PNG/PDF/TXT) with drag-and-drop.
    * Client-side text extraction.
    * Selection of output formats (summary, flashcards, quiz, all).
    * Results display with copy/download options.
* **Authenticated Users:**
    * Email/password registration and login.
    * Persistent sessions linked to user accounts.
    * Dashboard to view, manage (regenerate, delete) saved study sessions.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd smart-study-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create and configure the environment file:**
    * Copy the example `.env.example` (if provided) to `.env` or create `.env` manually in the project root.
    * Add your specific configurations:
        ```plaintext
        NODE_ENV=development
        PORT=3000
        OPENAI_API_KEY="YOUR_OPENAI_API_KEY_HERE"
        JWT_SECRET="YOUR_VERY_STRONG_AND_SECRET_JWT_KEY_HERE"
        DATABASE_URL=./db/smart_study.sqlite

        # Rate Limiting (optional, defaults are set)
        RATE_LIMIT_WINDOW_MS=900000 # 15 minutes in milliseconds
        RATE_LIMIT_MAX_REQUESTS=100
        ```
    * **Important:** Get an API key from [OpenAI](https://platform.openai.com/signup) and replace `"YOUR_OPENAI_API_KEY_HERE"`.
    * Set a strong `JWT_SECRET`.

4.  **Initialize the database:**
    The database and tables will be created automatically when the server starts for the first time due to the `db.init()` call in `server.js`.
    Alternatively, you can run:
    ```bash
    npm run init-db
    ```
    This script specifically runs the table creation logic. (Note: `npm run init-db` script needs `db.js` to handle `process.argv` for standalone execution, which is included in the provided `db.js`).

5.  **Run the application:**
    * For development (with `nodemon` for auto-restarts):
        ```bash
        npm run dev
        ```
    * For production:
        ```bash
        npm start
        ```

6.  **Access the application:**
    Open your browser and go to `http://localhost:3000` (or the port you specified).

## API Endpoints (Brief Overview)

* `POST /api/auth/register`: User registration.
* `POST /api/auth/login`: User login.
* `POST /api/study/process`: Process uploaded text (public, auth optional).
* `GET /api/study/sessions`: Get all sessions for authenticated user (protected).
* `GET /api/study/sessions/:id`: Get a specific session (protected).
* `PUT /api/study/sessions/:id/regenerate`: Regenerate content for a session (protected).
* `DELETE /api/study/sessions/:id`: Delete a session (protected).

## Key Components & Design Choices

* **Frontend State:** Managed with vanilla JavaScript variables and DOM manipulation. No external state management library.
* **Styling:** Custom CSS using Flexbox and Grid for responsiveness. No CSS frameworks.
* **Security:**
    * Password hashing with `bcryptjs`.
    * JWT for session management (stored in `localStorage`).
    * Rate limiting on API endpoints.
    * Basic input validation.
    * Content displayed via `textContent` where possible to mitigate XSS, or careful HTML construction for rich content.
* **Error Handling:** `try...catch` blocks in async functions, centralized API error handling, user-facing messages.
* **Performance:**
    * Client-side text extraction (Tesseract.js, PDF.js) reduces server load for these tasks.
    * File size limits.
* **Maintainability:**
    * Separation of concerns (backend: routes, services, models; frontend: UI, API, logic modules).
    * JSDoc comments for better code understanding.

## Future Enhancements / To-Do

* **Advanced File Handling:**
    * Support for more file types (e.g., DOCX).
    * Processing multiple files simultaneously and combining their text or results.
    * Progress indicators for large file uploads and OCR/PDF processing.
* **AI Enhancements:**
    * Option to choose different AI models.
    * More sophisticated prompt engineering for better results.
    * Allow users to customize generation parameters (e.g., summary length, number of flashcards).
    * Implement fallback to a local LLM (as per initial spec).
* **User Experience:**
    * More interactive quiz-taking interface.
    * Flashcard viewing/studying mode (e.g., flip animation).
    * Improved accessibility (WCAG AA compliance audit).
* **Testing:**
    * Implement unit tests for critical backend services (auth, AI, DB models).
    * Frontend unit/integration tests (e.g., using Jest with JSDOM).
* **Deployment:**
    * Detailed instructions for deploying to platforms like Render.com, Heroku, or AWS.
    * Dockerfile for containerization.
* **Security Hardening:**
    * More robust input sanitization and output encoding.
    * Implement CSRF protection if traditional forms were to be used more extensively.
    * Regular dependency updates.

## Notes on OpenAI JSON Mode

The AI service uses `response_format: { type: "json_object" }` for flashcards and quizzes. This feature is available on newer GPT models (like `gpt-3.5-turbo-1106` and later, `gpt-4-turbo-preview`). Ensure your chosen model supports this. If not, the AI might not strictly adhere to JSON output, and parsing logic would need to be more robust (e.g., regex to extract JSON from a larger text block). The current implementation assumes the model correctly returns a JSON string as the primary content.

---

This README provides a starting point. Feel free to expand it with more details as the project evolves.
