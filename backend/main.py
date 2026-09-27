import os
import uuid
import io
import pdfplumber
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="PaperPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-3.8-flash")

# --- simple in-memory store: {document_id: {"text": ..., "filename": ..., "word_count": ...}} ---
DOCS: dict[str, dict] = {}

MAX_CHARS = 350_000


class SummarizeRequest(BaseModel):
    document_id: str
    language: str = "English"
    length: str = "detailed"  # "quick" or "detailed"


class AskRequest(BaseModel):
    document_id: str
    question: str
    language: str = "English"


def extract_text(file_bytes) -> str:
    text_parts = []
    with pdfplumber.open(file_bytes) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
    return "\n".join(text_parts)


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Please upload a PDF file.")

    contents = await file.read()

    try:
        text = extract_text(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Could not read PDF: {e}")

    if not text.strip():
        raise HTTPException(
            400,
            "No extractable text found. This PDF may be scanned images."
        )

    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    document_id = str(uuid.uuid4())
    word_count = len(text.split())
    DOCS[document_id] = {"text": text, "filename": file.filename, "word_count": word_count}

    return {"document_id": document_id, "filename": file.filename, "word_count": word_count}


@app.post("/summarize")
async def summarize(req: SummarizeRequest):
    doc = DOCS.get(req.document_id)
    if not doc:
        raise HTTPException(404, "Document not found. Please re-upload.")

    length_instruction = (
        "Give a QUICK summary: at most 5 concise bullet points covering only the most essential points."
        if req.length == "quick"
        else "Give a DETAILED summary organized under short section headers, covering all key ideas, findings, and conclusions."
    )

    prompt = f"""You are summarizing a document for someone who wants to
read less and know more. {length_instruction}
Write the ENTIRE summary in {req.language}, including all headers and bullet points.
Format it in clear bullet points. Do not add information that isn't in the document.

DOCUMENT:
{doc['text']}
"""

    response = model.generate_content(prompt)
    return {"summary": response.text}


@app.post("/ask")
async def ask(req: AskRequest):
    doc = DOCS.get(req.document_id)
    if not doc:
        raise HTTPException(404, "Document not found. Please re-upload.")

    prompt = f"""Answer the question using ONLY the document below. Answer in {req.language}.
If the answer isn't in the document, say so clearly instead of guessing.

DOCUMENT:
{doc['text']}

QUESTION: {req.question}
"""

    response = model.generate_content(prompt)
    return {"answer": response.text}


@app.get("/health")
async def health():
    return {"status": "ok"}