# 📄 PaperPilot — Read Less, Know More

AI-powered web app that summarizes any PDF into clear bullet points and answers questions about its contents — powered by Google Gemini.

**🔗 Live Demo:** [paper-pilot-snowy.vercel.app](https://paper-pilot-snowy.vercel.app/)

## ✨ Features
- Instant bullet-point PDF summaries
- Ask questions about the document's contents
- English, Hindi & Kannada support
- Quick / Detailed summary modes
- Voice input & read-aloud
- Dark/Light theme, copy/download, session history

## 🛠️ Tech Stack
**Frontend:** React (Vite), CSS3
**Backend:** FastAPI, pdfplumber
**AI:** Google Gemini API
**Hosting:** Render (backend) + Vercel (frontend)

## 🚀 Run Locally

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
echo "GEMINI_API_KEY=your_key_here" > .env
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`

## 📝 License
MIT
